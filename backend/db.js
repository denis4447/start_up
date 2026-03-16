const initSqlJs = require('sql.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'noteai.db');
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const ENC_HEADER = Buffer.from('ENCDB1');

function getDbKey() {
  const hex = process.env.DB_ENCRYPTION_KEY;
  if (hex && hex.length >= 64) return Buffer.from(hex, 'hex');
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 FATAL: DB_ENCRYPTION_KEY must be set (64 hex chars) in production.');
    process.exit(1);
  }
  return crypto.createHash('sha256').update('noteai-dev-db-key').digest();
}

function encryptBuffer(plain) {
  const key = getDbKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENC_HEADER, iv, tag, encrypted]);
}

function decryptBuffer(raw) {
  if (!raw || raw.length < ENC_HEADER.length || !raw.subarray(0, ENC_HEADER.length).equals(ENC_HEADER)) {
    return raw; // Not encrypted (legacy) — return as-is for migration
  }
  const key = getDbKey();
  const payload = raw.subarray(ENC_HEADER.length);
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const raw = fs.readFileSync(DB_PATH);
    const buffer = decryptBuffer(raw);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS license_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL DEFAULT 'pro',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      activated_at TEXT,
      expires_at TEXT,
      activated_by TEXT,
      device_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      max_devices INTEGER NOT NULL DEFAULT 1,
      note TEXT
    )
  `);

  // Add tier column to existing DBs (migration)
  try {
    db.run(`ALTER TABLE license_keys ADD COLUMN tier TEXT NOT NULL DEFAULT 'pro'`);
  } catch (_) {
    // Column already exists
  }

  // Add duration_days column (migration)
  try {
    db.run(`ALTER TABLE license_keys ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 30`);
  } catch (_) {
    // Column already exists
  }

  // Request counting for tier-based rate limits
  db.run(`
    CREATE TABLE IF NOT EXISTS request_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_request_counts_user ON request_counts(user_id, created_at)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS key_activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      device_id TEXT,
      activated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      subscription_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_pushes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      scheduled_at TEXT NOT NULL,
      event_id TEXT,
      sent INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_user ON scheduled_pushes(user_id, sent, scheduled_at)`);

  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const plain = Buffer.from(data);
  const encrypted = encryptBuffer(plain);
  fs.writeFileSync(DB_PATH, encrypted);
}

// Auto-save every 30 seconds (unref so CLI scripts can exit)
const autoSave = setInterval(() => {
  if (db) saveDb();
}, 30000);
autoSave.unref();

module.exports = { getDb, saveDb };
