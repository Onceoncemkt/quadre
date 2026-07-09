const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { hashPassword, signAuthToken, verifyPassword } = require('../lib/auth');
const { generateUniqueBusinessSlug } = require('../lib/slug');

const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  businessName: z.string().trim().min(1),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese email' });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const slug = await generateUniqueBusinessSlug(prisma, parsed.data.businessName);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: parsed.data.name,
          email,
          passwordHash,
        },
      });

      const business = await tx.business.create({
        data: {
          name: parsed.data.businessName,
          slug,
          status: 'TRIAL',
          trialEndsAt,
        },
      });

      const location = await tx.location.create({
        data: {
          businessId: business.id,
          name: parsed.data.businessName,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          businessId: business.id,
          role: 'OWNER',
        },
      });

      return { user, business, location };
    });

    const token = signAuthToken({ userId: created.user.id });

    res.status(201).json({
      ok: true,
      token,
      user: {
        id: created.user.id,
        name: created.user.name,
        email: created.user.email,
      },
      business: {
        id: created.business.id,
        name: created.business.name,
        slug: created.business.slug,
        status: created.business.status,
        trialEndsAt: created.business.trialEndsAt,
        location: {
          id: created.location.id,
          name: created.location.name,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            location: true,
            business: {
              include: {
                locations: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
      return;
    }

    const isValid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
      return;
    }

    const token = signAuthToken({ userId: user.id });

    res.status(200).json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      memberships: user.memberships,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { authRouter };
