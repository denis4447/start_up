/**
 * Скрипт для генерации лицензионных ключей.
 *
 * Использование:
 *   node scripts/generate-keys.js              — сгенерировать 1 ключ (30 дней)
 *   node scripts/generate-keys.js 5            — сгенерировать 5 ключей (30 дней)
 *   node scripts/generate-keys.js 3 90         — сгенерировать 3 ключа (90 дней)
 *   node scripts/generate-keys.js 1 365 "VIP"  — 1 ключ на год с пометкой
 */

const { getDb, saveDb } = require('../db');
const crypto = require('crypto');

function generateKey() {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
  }
  return `NOTEAI-${segments.join('-')}`;
}

async function main() {
  const count = parseInt(process.argv[2]) || 1;
  const durationDays = parseInt(process.argv[3]) || 30;
  const note = process.argv[4] || null;
  const tier = ['pro', 'ultra'].includes(process.argv[5]) ? process.argv[5] : 'pro';

  const db = await getDb();
  const keys = [];

  for (let i = 0; i < count; i++) {
    const key = generateKey();
    db.run(
      `INSERT INTO license_keys (key, tier, is_active, max_devices, note, duration_days) VALUES (?, ?, 1, 1, ?, ?)`,
      [key, tier, note, durationDays]
    );
    keys.push(key);
  }

  saveDb();

  console.log(`\n✅ Сгенерировано ${count} ключ(ей) (срок: ${durationDays} дней):\n`);
  keys.forEach((k, i) => console.log(`  ${i + 1}. ${k}`));
  console.log(`\nСохранено в БД: backend/data/noteai.db\n`);

  // Show all keys in DB
  const all = db.exec('SELECT key, is_active, activated_by, expires_at, note FROM license_keys');
  if (all.length > 0) {
    console.log('📋 Все ключи в базе:');
    console.log('─'.repeat(80));
    const rows = all[0].values;
    rows.forEach((row) => {
      const [k, active, user, expires, n] = row;
      const status = user ? (active ? '🟢 Активен' : '🔴 Истёк') : '⚪ Не использован';
      console.log(`  ${k}  ${status}${expires ? `  до ${expires}` : ''}${n ? `  (${n})` : ''}`);
    });
    console.log('─'.repeat(80));
  }
}

main().catch(console.error);
