const { z } = require('zod');

const chatMessageSchema = z.object({
  message: z.string().min(1).max(100000),
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(10000),
    })
  ).max(50).optional().default([]),
  useGpt52: z.boolean().optional().default(false),
});

const structureNoteSchema = z.object({
  content: z.string().min(1).max(10000),
  language: z.enum(['ru', 'en']).optional().default('ru'),
});

const transformNoteSchema = z.object({
  content: z.string().min(1).max(10000),
  action: z.enum(['structure', 'expand', 'shorten', 'style']),
  style: z.enum(['friendly', 'business', 'email', 'post']).optional(),
  language: z.enum(['ru', 'en']).optional().default('ru'),
});

const authSchema = z.object({
  deviceId: z.string().min(1).max(255),
});

const licenseActivateSchema = z.object({
  licenseKey: z.string().min(1).max(50),
  deviceId: z.string().max(255).optional(),
});

function validate(schema) {
  return (req, res, next) => {
    try {
      req.validatedBody = schema.parse(req.body);
      next();
    } catch (err) {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.errors?.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }
  };
}

module.exports = { validate, chatMessageSchema, structureNoteSchema, transformNoteSchema, authSchema, licenseActivateSchema };
