const { getDb, saveDb } = require('../db');

const PRO_LIMITS = { daily: 100, monthly: 500 };

/**
 * Middleware: проверяет наличие активной лицензии у пользователя.
 * Устанавливает req.licenseTier ('pro' | 'ultra') и req.licenseExpiresAt.
 */
async function requireLicense(req, res, next) {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const db = await getDb();
    const result = db.exec(
      `SELECT expires_at, tier FROM license_keys WHERE activated_by = ? AND is_active = 1 AND expires_at > datetime('now') ORDER BY expires_at DESC LIMIT 1`,
      [req.user.userId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(403).json({
        error: 'LICENSE_REQUIRED',
        message: 'Требуется активная лицензия. Введите ключ активации.',
      });
    }

    const [expiresAt, tier] = result[0].values[0];
    req.licenseExpiresAt = expiresAt;
    req.licenseTier = tier || 'pro';
    next();
  } catch (err) {
    console.error('License check error:', err);
    return res.status(500).json({ error: 'Ошибка проверки лицензии' });
  }
}

/**
 * Middleware: требует Ultra-тир лицензии.
 * Должен вызываться ПОСЛЕ requireLicense.
 */
function requireUltra(req, res, next) {
  if (req.licenseTier !== 'ultra') {
    return res.status(403).json({
      error: 'ULTRA_REQUIRED',
      message: 'Эта функция доступна только с подпиской Ultra.',
    });
  }
  next();
}

/**
 * Middleware: tier-based rate limiting для Pro пользователей.
 * Ultra — безлимит. Pro — 100 запросов/день, 500/месяц.
 * Должен вызываться ПОСЛЕ requireLicense.
 */
async function tierRateLimit(req, res, next) {
  try {
    if (req.licenseTier === 'ultra') {
      return next();
    }

    const db = await getDb();
    const userId = req.user.userId;

    // Count today's requests
    const dailyResult = db.exec(
      `SELECT COUNT(*) FROM request_counts WHERE user_id = ? AND created_at > datetime('now', '-1 day')`,
      [userId]
    );
    const dailyCount = dailyResult.length > 0 ? dailyResult[0].values[0][0] : 0;

    if (dailyCount >= PRO_LIMITS.daily) {
      return res.status(429).json({
        error: 'DAILY_LIMIT',
        message: `Дневной лимит Pro (${PRO_LIMITS.daily} запросов) исчерпан. Обновитесь до Ultra для безлимита.`,
        limit: PRO_LIMITS.daily,
        used: dailyCount,
      });
    }

    // Count this month's requests
    const monthlyResult = db.exec(
      `SELECT COUNT(*) FROM request_counts WHERE user_id = ? AND created_at > datetime('now', '-30 day')`,
      [userId]
    );
    const monthlyCount = monthlyResult.length > 0 ? monthlyResult[0].values[0][0] : 0;

    if (monthlyCount >= PRO_LIMITS.monthly) {
      return res.status(429).json({
        error: 'MONTHLY_LIMIT',
        message: `Месячный лимит Pro (${PRO_LIMITS.monthly} запросов) исчерпан. Обновитесь до Ultra для безлимита.`,
        limit: PRO_LIMITS.monthly,
        used: monthlyCount,
      });
    }

    // Record request
    const endpoint = req.baseUrl + req.path;
    db.run(
      `INSERT INTO request_counts (user_id, endpoint, created_at) VALUES (?, ?, datetime('now'))`,
      [userId, endpoint]
    );

    // Periodic cleanup: remove entries older than 31 days
    if (Math.random() < 0.01) {
      db.run(`DELETE FROM request_counts WHERE created_at < datetime('now', '-31 day')`);
    }

    next();
  } catch (err) {
    console.error('Tier rate limit error:', err);
    next();
  }
}

module.exports = { requireLicense, requireUltra, tierRateLimit };
