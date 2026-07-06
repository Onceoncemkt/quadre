require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);

app.set('trust proxy', 1);
app.use(express.json());

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const isQuadre = /^https:\/\/([a-z0-9-]+\.)?quadre\.mx$/i.test(origin);
  const isVercel = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

  return isLocalhost || isQuadre || isVercel;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin no permitido'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);

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

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/waitlist', waitlistLimiter, async (req, res, next) => {
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

app.use((err, _req, res, _next) => {
  if (err && err.message === 'CORS origin no permitido') {
    res.status(403).json({ ok: false, error: err.message });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

async function start() {
  try {
    await prisma.$connect();
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Quadre backend escuchando en puerto ${port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo iniciar el backend:', error);
    process.exit(1);
  }
}

start();
