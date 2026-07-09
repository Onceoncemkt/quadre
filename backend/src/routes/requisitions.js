const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const requisitionsRouter = Router();

const managerRoles = ['OWNER', 'ADMIN', 'MANAGER'];
const approverRoles = ['OWNER', 'ADMIN'];

const createItemSchema = z.object({
  name: z.string().trim().min(1),
  unit: z.enum(['PZA', 'KG', 'G', 'LT', 'ML', 'CAJA', 'PAQUETE', 'BOTELLA']),
  category: z.string().trim().min(1).optional(),
  lastPrice: z.coerce.number().nonnegative().optional(),
});

const createCounterpartySchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['SUPPLIER', 'LENDER']).optional(),
  phone: z.string().trim().min(1).optional(),
});

const createRequisitionSchema = z.object({
  counterpartyId: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        qty: z.coerce.number().positive(),
        unitPrice: z.coerce.number().nonnegative().optional(),
      }),
    )
    .min(1),
});

const receiveRequisitionSchema = z.object({
  counterpartyId: z.string().trim().min(1).optional(),
  lines: z
    .array(
      z.object({
        lineId: z.string().trim().min(1),
        receivedQty: z.coerce.number().nonnegative(),
        actualPrice: z.coerce.number().nonnegative(),
      }),
    )
    .min(1),
});

function parseDateOnly(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getMexicoTodayDate() {
  const mxDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const parsed = parseDateOnly(mxDate);
  return parsed || new Date();
}

async function getMembershipForLocation({ userId, locationId }) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      businessId: true,
      name: true,
    },
  });

  if (!location) return { location: null, membership: null };

  const membership = await prisma.membership.findUnique({
    where: {
      userId_businessId: {
        userId,
        businessId: location.businessId,
      },
    },
  });

  return { location, membership };
}

async function getMembershipForRequisition({ userId, requisitionId }) {
  const requisition = await prisma.requisition.findUnique({
    where: { id: requisitionId },
    include: {
      location: {
        select: {
          id: true,
          businessId: true,
          name: true,
        },
      },
      counterparty: {
        select: {
          id: true,
          businessId: true,
        },
      },
      lines: {
        include: {
          item: true,
        },
      },
    },
  });

  if (!requisition) return { requisition: null, membership: null };

  const membership = await prisma.membership.findUnique({
    where: {
      userId_businessId: {
        userId,
        businessId: requisition.location.businessId,
      },
    },
  });

  return { requisition, membership };
}

requisitionsRouter.post(
  '/businesses/:businessId/items',
  authMiddleware,
  requireRole((req) => req.params.businessId, managerRoles),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = createItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const item = await prisma.item.create({
        data: {
          businessId,
          name: parsed.data.name,
          unit: parsed.data.unit,
          category: parsed.data.category,
          lastPrice:
            typeof parsed.data.lastPrice === 'number' ? Number(parsed.data.lastPrice.toFixed(2)) : null,
        },
      });

      res.status(201).json({ ok: true, item });
    } catch (error) {
      if (error?.code === 'P2002') {
        res.status(409).json({ ok: false, error: 'Ese item ya existe en este negocio' });
        return;
      }
      next(error);
    }
  },
);

requisitionsRouter.get(
  '/businesses/:businessId/items',
  authMiddleware,
  requireRole((req) => req.params.businessId),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const items = await prisma.item.findMany({
        where: { businessId, active: true },
        orderBy: { name: 'asc' },
      });

      res.status(200).json({ ok: true, items });
    } catch (error) {
      next(error);
    }
  },
);

requisitionsRouter.post(
  '/businesses/:businessId/counterparties',
  authMiddleware,
  requireRole((req) => req.params.businessId, managerRoles),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = createCounterpartySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const counterparty = await prisma.counterparty.create({
        data: {
          businessId,
          name: parsed.data.name,
          type: parsed.data.type || 'SUPPLIER',
          phone: parsed.data.phone,
        },
      });

      res.status(201).json({ ok: true, counterparty });
    } catch (error) {
      if (error?.code === 'P2002') {
        res.status(409).json({ ok: false, error: 'Ese proveedor ya existe en este negocio' });
        return;
      }
      next(error);
    }
  },
);

requisitionsRouter.get(
  '/businesses/:businessId/counterparties',
  authMiddleware,
  requireRole((req) => req.params.businessId),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const counterparties = await prisma.counterparty.findMany({
        where: { businessId, active: true },
        orderBy: { name: 'asc' },
      });

      res.status(200).json({ ok: true, counterparties });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = { requisitionsRouter };
