const express = require('express');
const OpenAI = require('openai');
const { authenticateToken } = require('../middleware/auth');
const { requireLicense, tierRateLimit } = require('../middleware/license');
const { validate, structureNoteSchema, transformNoteSchema } = require('../middleware/validate');
const { chatLimiter } = require('../middleware/rate-limit');

const router = express.Router();

const OPENAI_TIMEOUT_MS = 90_000;
const MAX_CONTENT_CHARS = 12_000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.aitunnel.ru/v1/',
  timeout: OPENAI_TIMEOUT_MS,
});

// --- Data sanitization ---

function sanitizeContent(text) {
  return text
    .replace(/\r\n/g, '\n')           // normalize line endings
    .replace(/\n{3,}/g, '\n\n')       // collapse 3+ blank lines → 2
    .replace(/[ \t]+$/gm, '')         // trim trailing whitespace per line
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')         // strip zero-width chars
    .trim();
}

function truncateContent(content, maxChars = MAX_CONTENT_CHARS) {
  if (content.length <= maxChars) return content;
  const truncated = content.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = lastNewline > maxChars * 0.8 ? lastNewline : maxChars;
  return truncated.slice(0, cutPoint) + '\n\n[...текст сокращён]';
}

function prepareContent(content) {
  return truncateContent(sanitizeContent(content));
}

// --- Compressed system prompts ---
// Minimal, no filler. Every token counts for gpt-5-nano.

const STRUCTURE_PROMPT_RU = `Структурируй текст. Markdown. Параграфы, заголовки ##, списки. Исправь опечатки. Сохрани смысл. Только результат.`;

const STRUCTURE_PROMPT_EN = `Structure the text. Markdown. Paragraphs, ## headings, lists. Fix typos. Preserve meaning. Output only.`;

const SUMMARIZE_PROMPT = {
  ru: 'Кратко резюмируй текст. Только резюме, без пояснений.',
  en: 'Summarize concisely. Output only the summary.',
};

const TRANSFORM_PROMPTS = {
  expand: {
    ru: 'Расширь текст: добавь деталей и примеров. Сохрани смысл. Только результат.',
    en: 'Expand: add details and examples. Preserve meaning. Output only.',
  },
  shorten: {
    ru: 'Сократи текст до ключевых мыслей. Сохрани смысл. Только результат.',
    en: 'Shorten to key points. Preserve meaning. Output only.',
  },
  style: {
    friendly: {
      ru: 'Перепиши в дружелюбном неформальном стиле. Сохрани смысл. Только результат.',
      en: 'Rewrite in a friendly informal style. Preserve meaning. Output only.',
    },
    business: {
      ru: 'Перепиши в деловом профессиональном стиле. Сохрани смысл. Только результат.',
      en: 'Rewrite in a business professional style. Preserve meaning. Output only.',
    },
    email: {
      ru: 'Перепиши как e-mail: приветствие, тело, подпись. Сохрани смысл. Только результат.',
      en: 'Rewrite as email: greeting, body, signature. Preserve meaning. Output only.',
    },
    post: {
      ru: 'Перепиши как SMM-пост: ярко, вовлекающе, с эмодзи. Сохрани смысл. Только результат.',
      en: 'Rewrite as social media post: engaging, bright, emojis. Preserve meaning. Output only.',
    },
  },
};

// Stop sequences to prevent model from adding trailing commentary
const STOP_SEQUENCES = ['\n\n---', '\n\nПримечание:', '\n\nNote:', '\n\nP.S.'];

// --- Helpers ---

function handleAIError(error, res, label) {
  if (error.code === 'ERR_STREAM_DESTROYED' || res.writableEnded) return;
  console.error(`${label}:`, error.message);
  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
    return res.status(504).json({ error: 'Превышено время ожидания ответа от AI. Попробуйте ещё раз или сократите текст.' });
  }
  res.status(500).json({ error: `Ошибка обработки. Попробуйте ещё раз.` });
}

// --- Routes ---

// POST /notes/structure — streaming
router.post(
  '/structure',
  authenticateToken,
  requireLicense,
  tierRateLimit,
  chatLimiter,
  validate(structureNoteSchema),
  async (req, res) => {
    try {
      const { content, language } = req.validatedBody;
      const systemPrompt = language === 'en' ? STRUCTURE_PROMPT_EN : STRUCTURE_PROMPT_RU;
      const model = req.licenseTier === 'ultra' ? 'gpt-5.2' : 'gpt-5-nano';
      const processedContent = prepareContent(content);

      const start = Date.now();

      // Stream for lower TTFB
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: processedContent },
        ],
        max_tokens: 2048,
        temperature: 0.3,
        stop: STOP_SEQUENCES,
        stream: true,
      });

      let fullText = '';
      let usage = null;

      for await (const chunk of stream) {
        if (res.writableEnded) break;
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
        if (chunk.usage) usage = chunk.usage;
      }

      console.log(`[notes/structure] model=${model} time=${Date.now() - start}ms len=${fullText.length}`);

      if (!fullText.trim()) {
        res.write(`data: ${JSON.stringify({ error: 'AI вернул пустой ответ. Попробуйте ещё раз.' })}\n\n`);
      }

      // Send final message with complete text for clients that want it
      res.write(`data: ${JSON.stringify({ done: true, structured: fullText, usage })}\n\n`);
      res.end();
    } catch (error) {
      if (res.headersSent) {
        // Already streaming — send error as SSE event
        try { res.write(`data: ${JSON.stringify({ error: 'Ошибка обработки.' })}\n\n`); res.end(); } catch {}
        return;
      }
      handleAIError(error, res, 'Structure note error');
    }
  }
);

// POST /notes/summarize
router.post(
  '/summarize',
  authenticateToken,
  requireLicense,
  tierRateLimit,
  chatLimiter,
  validate(structureNoteSchema),
  async (req, res) => {
    try {
      const { content, language } = req.validatedBody;
      const model = req.licenseTier === 'ultra' ? 'gpt-5.2' : 'gpt-5-nano';
      const processedContent = prepareContent(content);
      const systemPrompt = SUMMARIZE_PROMPT[language] || SUMMARIZE_PROMPT.ru;

      const start = Date.now();
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: processedContent },
        ],
        max_tokens: 800,
        temperature: 0.3,
        stop: STOP_SEQUENCES,
      });
      console.log(`[notes/summarize] model=${model} time=${Date.now() - start}ms`);

      const summary = completion.choices[0]?.message?.content;
      if (!summary || !summary.trim()) {
        return res.status(502).json({ error: 'AI вернул пустой ответ. Попробуйте ещё раз.' });
      }

      if (!res.writableEnded) {
        res.json({ summary, usage: completion.usage });
      }
    } catch (error) {
      handleAIError(error, res, 'Summarize error');
    }
  }
);

// POST /notes/transform — streaming
router.post(
  '/transform',
  authenticateToken,
  requireLicense,
  tierRateLimit,
  chatLimiter,
  validate(transformNoteSchema),
  async (req, res) => {
    try {
      const { content, action, style, language } = req.validatedBody;
      const model = req.licenseTier === 'ultra' ? 'gpt-5.2' : 'gpt-5-nano';
      let systemPrompt;

      if (action === 'structure') {
        systemPrompt = language === 'en' ? STRUCTURE_PROMPT_EN : STRUCTURE_PROMPT_RU;
      } else if (action === 'style') {
        if (!style || !TRANSFORM_PROMPTS.style[style]) {
          return res.status(400).json({ error: 'Style is required for style action' });
        }
        systemPrompt = TRANSFORM_PROMPTS.style[style][language] || TRANSFORM_PROMPTS.style[style].ru;
      } else {
        systemPrompt = TRANSFORM_PROMPTS[action]?.[language] || TRANSFORM_PROMPTS[action]?.ru;
      }

      if (!systemPrompt) {
        return res.status(400).json({ error: 'Unknown action' });
      }

      const processedContent = prepareContent(content);

      // Max tokens depends on action
      const maxTokens = action === 'shorten' ? 1024 : 2048;

      const start = Date.now();

      // Stream for lower TTFB
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: processedContent },
        ],
        max_tokens: maxTokens,
        temperature: 0.4,
        stop: STOP_SEQUENCES,
        stream: true,
      });

      let fullText = '';
      let usage = null;

      for await (const chunk of stream) {
        if (res.writableEnded) break;
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
        if (chunk.usage) usage = chunk.usage;
      }

      console.log(`[notes/transform] action=${action} model=${model} time=${Date.now() - start}ms len=${fullText.length}`);

      if (!fullText.trim()) {
        res.write(`data: ${JSON.stringify({ error: 'AI вернул пустой ответ.' })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ done: true, result: fullText, action, usage })}\n\n`);
      res.end();
    } catch (error) {
      if (res.headersSent) {
        try { res.write(`data: ${JSON.stringify({ error: 'Ошибка обработки.' })}\n\n`); res.end(); } catch {}
        return;
      }
      handleAIError(error, res, 'Transform note error');
    }
  }
);

module.exports = router;
