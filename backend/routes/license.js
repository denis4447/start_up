const express = require('express');
const { getDb, saveDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { validate, licenseActivateSchema } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rate-limit');

const router = express.Router();

// POST /api/license/activate — activate a license key
router.post('/activate', authenticateToken, authLimiter, validate(licenseActivateSchema), async (req, res) => {
  try {
    const { licenseKey } = req.validatedBody;
    const userId = req.user.userId;
    const db = await getDb();

    // Find the key
    const result = db.exec(
      `SELECT id, key, activated_by, expires_at, is_active, max_devices, tier, duration_days, activated_at FROM license_keys WHERE key = ?`,
      [licenseKey]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'Ключ не найден' });
    }

    const [id, key, activatedBy, expiresAt, isActive, maxDevices, tier, durationDays, activatedAtDb] = result[0].values[0];

    if (!isActive) {
      return res.status(400).json({ error: 'Ключ деактивирован' });
    }

    // Check if already activated by someone else
    if (activatedBy && activatedBy !== userId) {
      return res.status(400).json({ error: 'Ключ уже использован другим пользователем' });
    }

    // Check if expired
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Срок действия ключа истёк' });
    }

    // If already activated by this user and not expired — return current status
    if (activatedBy === userId && expiresAt && new Date(expiresAt) > new Date()) {
      return res.json({
        success: true,
        message: 'Ключ уже активирован',
        license: {
          key,
          tier: tier || 'pro',
          activatedAt: activatedAtDb,
          expiresAt,
          daysLeft: Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)),
        },
      });
    }

    // Activate: use duration_days from the key record (default 30)
    const days = durationDays || 30;
    const now = new Date();
    const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const activatedAt = now.toISOString();
    const expiresAtStr = expires.toISOString();

    db.run(
      `UPDATE license_keys SET activated_by = ?, activated_at = ?, expires_at = ?, is_active = 1 WHERE id = ?`,
      [userId, activatedAt, expiresAtStr, id]
    );

    // Record activation
    db.run(
      `INSERT INTO key_activations (license_key_id, user_id, device_id) VALUES (?, ?, ?)`,
      [id, userId, req.body.deviceId || null]
    );

    saveDb();

    res.json({
      success: true,
      message: `Ключ ${(tier || 'pro').toUpperCase()} успешно активирован`,
      license: {
        key,
        tier: tier || 'pro',
        activatedAt,
        expiresAt: expiresAtStr,
        daysLeft: days,
      },
    });
  } catch (err) {
    console.error('License activation error:', err);
    res.status(500).json({ error: 'Ошибка активации ключа' });
  }
});

// GET /api/license/status — check current license status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const db = await getDb();

    const result = db.exec(
      `SELECT key, activated_at, expires_at, is_active, tier FROM license_keys WHERE activated_by = ? AND is_active = 1 ORDER BY expires_at DESC LIMIT 1`,
      [userId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({
        active: false,
        message: 'Нет активной лицензии',
      });
    }

    const [key, activatedAt, expiresAt, isActive, tier] = result[0].values[0];
    const now = new Date();
    const expDate = new Date(expiresAt);
    const isExpired = expDate < now;

    if (isExpired) {
      // Mark as expired in DB
      db.run(
        `UPDATE license_keys SET is_active = 0 WHERE activated_by = ? AND expires_at < datetime('now')`,
        [userId]
      );
      saveDb();

      return res.json({
        active: false,
        expired: true,
        message: 'Срок лицензии истёк',
        expiresAt,
      });
    }

    const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

    res.json({
      active: true,
      tier: tier || 'pro',
      license: {
        key: key.slice(0, 12) + '****',
        tier: tier || 'pro',
        activatedAt,
        expiresAt,
        daysLeft,
      },
    });
  } catch (err) {
    console.error('License status error:', err);
    res.status(500).json({ error: 'Ошибка проверки лицензии' });
  }
});

// License key generation removed from HTTP API for security.
// Use CLI script instead: node scripts/generate-keys.js

module.exports = router;
