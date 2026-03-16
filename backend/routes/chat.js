const express = require('express');
const OpenAI = require('openai');
const { authenticateToken } = require('../middleware/auth');
const { requireLicense, tierRateLimit } = require('../middleware/license');
const { validate, chatMessageSchema } = require('../middleware/validate');
const { chatLimiter } = require('../middleware/rate-limit');

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.aitunnel.ru/v1/',
});

const BASE_SYSTEM_PROMPT = `Ты — NoteAI Assistant, встроенный AI-помощник в приложении для продуктивности. Отвечай КРАТКО и ПО ДЕЛУ — максимум 2-3 предложения, если не просят подробнее. Язык ответа — язык вопроса. Без лишних вступлений и заключений. Не раскрывай какая ты модель. ВАЖНО: если в сообщении пользователя есть раздел "Контекст для ответа" — используй его ТОЛЬКО если он релевантен вопросу. Всегда отвечай именно на вопрос пользователя, а не пересказывай контекст. СТРОГО ЗАПРЕЩЕНО: не притворяйся что ты можешь добавлять события, напоминания, заметки или выполнять любые действия в приложении — ты только читаешь и анализируешь данные. Если пользователь просит добавить что-то — скажи что это нужно сделать вручную в соответствующем разделе приложения.`;

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function getSystemPrompt() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const dateStr = `${WEEKDAYS[now.getDay()]}, ${dd}.${mm}.${now.getFullYear()}, ${hh}:${min}`;
  return `Текущая дата и время: ${dateStr}.\n${BASE_SYSTEM_PROMPT}`;
}

/**
 * Determine model based on request.
 * Ultra users can request gpt-5.2 via useGpt52=true.
 * Pro users always get gpt-5-nano.
 */
function getModel(req) {
  const useGpt52 = req.validatedBody?.useGpt52 || req.body?.useGpt52;
  if (req.licenseTier === 'ultra' && useGpt52) {
    return 'gpt-5.2';
  }
  return 'gpt-5-nano';
}

// Chat with streaming
router.post(
  '/message',
  authenticateToken,
  requireLicense,
  tierRateLimit,
  chatLimiter,
  validate(chatMessageSchema),
  async (req, res) => {
    try {
      const { message, conversationHistory } = req.validatedBody;
      const model = getModel(req);

      const messages = [
        { role: 'system', content: getSystemPrompt() },
        ...conversationHistory,
        { role: 'user', content: message },
      ];

      // Set headers for SSE streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Model', model);

      const stream = await openai.chat.completions.create({
        model,
        messages,
        stream: true,
        max_tokens: model === 'gpt-5.2' ? 2000 : 500,
        temperature: 0.5,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('Chat error:', error.message);

      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process chat message' });
      } else {
        res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
        res.end();
      }
    }
  }
);

// Non-streaming chat (for quick responses)
router.post(
  '/quick',
  authenticateToken,
  requireLicense,
  tierRateLimit,
  chatLimiter,
  validate(chatMessageSchema),
  async (req, res) => {
    try {
      const { message, conversationHistory } = req.validatedBody;
      const model = getModel(req);

      const maxMsgChars = model === 'gpt-5.2' ? 80_000 : 8_000;
      const trimmedMessage = message.length > maxMsgChars
        ? message.slice(0, maxMsgChars) + '\n\n[контекст обрезан]'
        : message;

      const messages = [
        { role: 'system', content: getSystemPrompt() },
        ...conversationHistory,
        { role: 'user', content: trimmedMessage },
      ];

      const maxTokens = model === 'gpt-5.2' ? 4000 : 1500;
      const baseTemp = 0.5;

      let completion = await openai.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: baseTemp,
      });

      let content = completion.choices[0]?.message?.content || null;

      // If model returned empty — retry once with higher temperature to break out of degenerate state
      if (!content) {
        console.warn('Quick chat: empty content, retrying with higher temperature. Model:', model, 'finish_reason:', completion.choices[0]?.finish_reason);
        completion = await openai.chat.completions.create({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: Math.min(baseTemp + 0.3, 1.0),
        });
        content = completion.choices[0]?.message?.content || null;
      }

      res.json({
        content,
        model,
        usage: completion.usage,
      });
    } catch (error) {
      console.error('Quick chat error:', error.message, error.status, error.code);
      res.status(500).json({ error: 'Failed to process message' });
    }
  }
);

module.exports = router;
