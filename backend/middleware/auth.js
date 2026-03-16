const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET must be set in production'); })()
  : 'noteai-dev-secret');

const JWT_OPTIONS = { issuer: 'noteai-backend', audience: 'noteai-app' };

// Warn on weak secrets
if (JWT_SECRET.length < 32) {
  console.warn('⚠️  WARNING: JWT_SECRET is too short (< 32 chars). Generate a strong secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
}
if (['noteai-dev-secret', 'noteai-dev-secret-change-in-production'].includes(JWT_SECRET) && process.env.NODE_ENV === 'production') {
  console.error('🚨 FATAL: Default JWT_SECRET detected in production. Refusing to start.');
  process.exit(1);
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d', ...JWT_OPTIONS });
}

module.exports = { authenticateToken, generateToken };
