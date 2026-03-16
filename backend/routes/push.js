const express = require('express');
const webpush = require('web-push');
const { z } = require('zod');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { getDb } = require('../db');

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2048),
    keys: z.object({
      p256dh: z.string().max(512),
      auth: z.string().max(512),
    }),
  }),
});

const scheduleSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional().default(''),
  scheduledAt: z.string().min(1).max(30),
  eventId: z.string().max(100).optional().nullable(),
});

const cancelSchema = z.object({
  eventId: z.string().min(1).max(100),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

const router = express.Router();

function initVapid() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(
    'mailto:admin@noteai.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Defer init until after dotenv has loaded
setImmediate(initVapid);

// GET /api/push/vapid-public-key — return public key to client
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Helper: run a sql.js statement and save db
function dbRun(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
}

function dbAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// POST /api/push/subscribe — save subscription for user
router.post('/subscribe', authenticateToken, validate(subscribeSchema), async (req, res) => {
  const { subscription } = req.validatedBody;
  try {
    const db = await getDb();
    dbRun(db,
      `INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, subscription_json, created_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [req.user.userId, subscription.endpoint, JSON.stringify(subscription)]
    );
    const { saveDb } = require('../db');
    saveDb();
    res.json({ ok: true });
  } catch (err) {
    console.error('Subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// POST /api/push/unsubscribe — remove subscription
router.post('/unsubscribe', authenticateToken, validate(unsubscribeSchema), async (req, res) => {
  const { endpoint } = req.validatedBody;
  try {
    const db = await getDb();
    dbRun(db, `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`, [req.user.userId, endpoint]);
    const { saveDb } = require('../db');
    saveDb();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// POST /api/push/schedule — schedule a push notification at a specific time
router.post('/schedule', authenticateToken, validate(scheduleSchema), async (req, res) => {
  const { title, body, scheduledAt, eventId } = req.validatedBody;
  try {
    const db = await getDb();
    dbRun(db,
      `INSERT INTO scheduled_pushes (user_id, title, body, scheduled_at, event_id, sent)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [req.user.userId, title, body || '', scheduledAt, eventId || null]
    );
    const { saveDb } = require('../db');
    saveDb();
    res.json({ ok: true });
  } catch (err) {
    console.error('Schedule push error:', err.message);
    res.status(500).json({ error: 'Failed to schedule push' });
  }
});

// POST /api/push/cancel — cancel scheduled pushes for an event
router.post('/cancel', authenticateToken, validate(cancelSchema), async (req, res) => {
  const { eventId } = req.validatedBody;
  try {
    const db = await getDb();
    dbRun(db,
      `DELETE FROM scheduled_pushes WHERE user_id = ? AND event_id = ? AND sent = 0`,
      [req.user.userId, eventId]
    );
    const { saveDb } = require('../db');
    saveDb();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel pushes' });
  }
});

// Internal function — called by the scheduler loop
async function sendDuePushes() {
  try {
    const db = await getDb();
    const { saveDb } = require('../db');
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const due = dbAll(db,
      `SELECT sp.id, sp.user_id, sp.title, sp.body, sp.event_id, ps.subscription_json
       FROM scheduled_pushes sp
       JOIN push_subscriptions ps ON ps.user_id = sp.user_id
       WHERE sp.sent = 0 AND sp.scheduled_at <= ?`,
      [now]
    );

    for (const row of due) {
      try {
        const subscription = JSON.parse(row.subscription_json);
        const payload = JSON.stringify({
          title: row.title,
          body: row.body,
          eventId: row.event_id || null,
        });
        await webpush.sendNotification(subscription, payload, {
          urgency: 'high',    // Survives battery saver / DND on supported platforms
          TTL: 3600,          // Keep in push queue for 1 hour if device is offline
        });
      } catch (e) {
        if (e.statusCode === 410) {
          // Subscription expired — clean up
          dbRun(db, `DELETE FROM push_subscriptions WHERE endpoint = ?`, [
            JSON.parse(row.subscription_json).endpoint,
          ]);
        } else {
          console.error('Push send error:', e.statusCode || e.message);
        }
      }
    }

    if (due.length > 0) {
      const ids = due.map((r) => r.id);
      dbRun(db,
        `UPDATE scheduled_pushes SET sent = 1 WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      saveDb();
    }
  } catch (err) {
    console.error('Push scheduler error:', err.message);
  }
}

// Start scheduler — check every 30 seconds
setInterval(sendDuePushes, 30_000);

module.exports = router;
