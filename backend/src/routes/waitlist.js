const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');

const waitlistRouter = Router();

const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
  },
});

const waitlistSchema = z.object({
  name: z.string().trim().min(1, 'name es requerido'),
  email: z.string().trim().email('email inválido'),
  whatsapp: z.string().trim().min(1).optional(),
  businessName: z.string().trim().min(1).optional(),
  businessType: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
});

waitlistRouter.post('/waitlist', waitlistLimiter, async (req, res, next) => {
  try {
    const parsed = waitlistSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'Payload inválido',
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload = {
      ...parsed.data,
      email: parsed.data.email.toLowerCase(),
    };

    const existing = await prisma.waitlistLead.findUnique({
      where: { email: payload.email },
    });

    if (existing) {
      res.status(200).json({
        ok: true,
        idempotent: true,
        lead: existing,
      });
      return;
    }

    const lead = await prisma.waitlistLead.create({
      data: payload,
    });

    res.status(201).json({
      ok: true,
      idempotent: false,
      lead,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { waitlistRouter };
