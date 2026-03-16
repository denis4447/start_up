const express = require('express');
const crypto = require('crypto');
const { generateToken } = require('../middleware/auth');
const { validate, authSchema } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rate-limit');

const router = express.Router();

/**
 * Deterministic userId from deviceId.
 * Same device always gets the same user → license stays associated.
 */
function deviceIdToUserId(deviceId) {
  return crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 32);
}

// Simple device-based auth for mobile app
router.post('/register', authLimiter, validate(authSchema), (req, res) => {
  const { deviceId } = req.validatedBody;
  const userId = deviceIdToUserId(deviceId);
  const token = generateToken(userId);

  res.json({
    token,
    userId,
    expiresIn: '7d',
  });
});

router.post('/login', authLimiter, validate(authSchema), (req, res) => {
  const { deviceId } = req.validatedBody;
  const userId = deviceIdToUserId(deviceId);
  const token = generateToken(userId);

  res.json({
    token,
    userId,
    expiresIn: '7d',
  });
});

module.exports = router;
