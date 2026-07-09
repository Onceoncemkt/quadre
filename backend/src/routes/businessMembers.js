const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { hashPassword } = require('../lib/auth');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const businessMembersRouter = Router();

const createMemberSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']),
  locationId: z.string().trim().min(1).nullable().optional(),
});

businessMembersRouter.post(
  '/businesses/:businessId/members',
  authMiddleware,
  requireRole((req) => req.params.businessId, ['OWNER', 'ADMIN']),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = createMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const payload = parsed.data;
      const email = payload.email.toLowerCase();
      const locationId = payload.locationId ?? null;

      if (locationId) {
        const location = await prisma.location.findUnique({
          where: { id: locationId },
          select: { id: true, businessId: true },
        });
        if (!location || location.businessId !== businessId) {
          res.status(400).json({ ok: false, error: 'Sucursal inválida para este negocio' });
          return;
        }
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        const existingMembership = await prisma.membership.findUnique({
          where: {
            userId_businessId: {
              userId: existingUser.id,
              businessId,
            },
          },
        });

        if (existingMembership) {
          res.status(409).json({ ok: false, error: 'Ese usuario ya pertenece a este negocio' });
          return;
        }

        const membership = await prisma.membership.create({
          data: {
            userId: existingUser.id,
            businessId,
            role: payload.role,
            locationId,
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            location: { select: { id: true, name: true } },
          },
        });

        res.status(201).json({
          ok: true,
          member: {
            id: membership.id,
            name: membership.user.name,
            email: membership.user.email,
            role: membership.role,
            locationId: membership.locationId,
            locationName: membership.location?.name || null,
          },
        });
        return;
      }

      const passwordHash = await hashPassword(payload.password);
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: payload.name,
            email,
            passwordHash,
          },
          select: { id: true, name: true, email: true },
        });

        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            businessId,
            role: payload.role,
            locationId,
          },
          include: {
            location: { select: { id: true, name: true } },
          },
        });

        return { user, membership };
      });

      res.status(201).json({
        ok: true,
        member: {
          id: created.membership.id,
          name: created.user.name,
          email: created.user.email,
          role: created.membership.role,
          locationId: created.membership.locationId,
          locationName: created.membership.location?.name || null,
        },
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        res.status(409).json({ ok: false, error: 'Ese usuario ya pertenece a este negocio' });
        return;
      }
      next(error);
    }
  },
);

businessMembersRouter.get(
  '/businesses/:businessId/members',
  authMiddleware,
  requireRole((req) => req.params.businessId),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const memberships = await prisma.membership.findMany({
        where: { businessId },
        include: {
          user: { select: { name: true, email: true } },
          location: { select: { name: true } },
        },
      });

      res.status(200).json({
        ok: true,
        items: memberships.map((membership) => ({
          id: membership.id,
          name: membership.user.name,
          email: membership.user.email,
          role: membership.role,
          locationId: membership.locationId,
          locationName: membership.location?.name || null,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = { businessMembersRouter };
