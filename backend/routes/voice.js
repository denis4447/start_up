const express = require('express');
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { requireLicense, requireUltra } = require('../middleware/license');
const { chatLimiter } = require('../middleware/rate-limit');

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.aitunnel.ru/v1/',
});

// Multer setup for audio uploads
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_AUDIO_EXTS = ['.mp3', '.mp4', '.m4a', '.wav', '.webm', '.ogg', '.flac'];

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_AUDIO_EXTS.includes(ext) ? ext : '.m4a';
    cb(null, `voice-${Date.now()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max (Whisper limit)
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_AUDIO_EXTS.includes(ext) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый формат аудио'));
    }
  },
});

const SUMMARY_PROMPT = `Ты — AI-ассистент для создания заметок из аудиозаписей. На вход ты получаешь транскрипцию аудиозаписи.

Твоя задача:
1. Создать краткий, информативный заголовок (одна строка)
2. Структурировать содержание в читаемую заметку
3. Выделить ключевые мысли и пункты
4. Убрать слова-паразиты и повторы
5. Сохранить весь важный смысл

Формат ответа СТРОГО:
TITLE: <заголовок>
---
<структурированное содержание в Markdown>`;

// POST /api/voice/transcribe — transcribe audio + generate note summary
router.post(
  '/transcribe',
  authenticateToken,
  requireLicense,
  requireUltra,
  chatLimiter,
  upload.single('audio'),
  async (req, res) => {
    let filePath = null;

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Аудиофайл не загружен' });
      }

      filePath = req.file.path;

      // Step 1: Transcribe with Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1',
        language: 'ru',
        response_format: 'text',
      });

      const transcript = typeof transcription === 'string'
        ? transcription
        : transcription.text || '';

      if (!transcript.trim()) {
        return res.status(400).json({ error: 'Не удалось распознать речь в аудиозаписи' });
      }

      // Step 2: Generate summary note
      const completion = await openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: transcript },
        ],
        max_tokens: 2000,
        temperature: 0.4,
      });

      const result = completion.choices[0].message.content || '';

      // Parse title and content
      let title = 'Голосовая заметка';
      let content = result;

      const titleMatch = result.match(/^TITLE:\s*(.+)/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
        content = result.replace(/^TITLE:\s*.+\n-{2,}\n?/m, '').trim();
      }

      res.json({
        title,
        content,
        transcript,
        usage: completion.usage,
      });
    } catch (error) {
      console.error('Voice transcription error:', error.message);

      if (error.message?.includes('format')) {
        return res.status(400).json({ error: 'Неподдерживаемый формат аудиофайла' });
      }

      res.status(500).json({ error: 'Ошибка обработки аудио' });
    } finally {
      // Clean up uploaded file
      if (filePath && fs.existsSync(filePath)) {
        fs.unlink(filePath, () => {});
      }
    }
  }
);

module.exports = router;
