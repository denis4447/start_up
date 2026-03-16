const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const FIELD_PREFIX = 'FENC:';

function getFieldKey() {
  const key = process.env.DB_FIELD_KEY;
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      console.error('🚨 FATAL: DB_FIELD_KEY must be set (>=32 hex chars) in production.');
      process.exit(1);
    }
    // Deterministic dev key — never use in production
    return crypto.createHash('sha256').update('noteai-dev-field-key').digest();
  }
  return Buffer.from(key, 'hex');
}

let cachedKey = null;
function key() {
  if (!cachedKey) cachedKey = getFieldKey();
  return cachedKey;
}

/**
 * Encrypt a plaintext string. Returns prefixed base64.
 * If value is already encrypted or null/empty, returns as-is.
 */
function encryptField(plaintext) {
  if (!plaintext || plaintext.startsWith(FIELD_PREFIX)) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, encrypted]);
  return FIELD_PREFIX + combined.toString('base64');
}

/**
 * Decrypt a field value. Returns plaintext.
 * If value is not encrypted, returns as-is (backward-compatible).
 */
function decryptField(ciphertext) {
  if (!ciphertext || !ciphertext.startsWith(FIELD_PREFIX)) return ciphertext;
  const raw = Buffer.from(ciphertext.slice(FIELD_PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

module.exports = { encryptField, decryptField };
