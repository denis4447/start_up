require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { apiLimiter } = require('./middleware/rate-limit');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const notesRoutes = require('./routes/notes');
const licenseRoutes = require('./routes/license');
const voiceRoutes = require('./routes/voice');
const pushRoutes = require('./routes/push');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Validate critical env in production
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.error('🚨 FATAL: CORS_ORIGIN must be set in production.');
  process.exit(1);
}

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN
    : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

// Global rate limiting
app.use('/api/', apiLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/push', pushRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await getDb();
  console.log('📦 SQLite database initialized');

  app.listen(PORT, () => {
    console.log(`NoteAI Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your-')) {
      console.warn('⚠️  WARNING: OPENAI_API_KEY is not configured. Chat and AI features will not work.');
    }
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
