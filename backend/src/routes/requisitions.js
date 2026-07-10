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
  defaultCounterpartyId: z.string().trim().min(1).optional(),
});

const updateItemSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    unit: z.enum(['PZA', 'KG', 'G', 'LT', 'ML', 'CAJA', 'PAQUETE', 'BOTELLA']).optional(),
    category: z.union([z.string().trim().min(1), z.null()]).optional(),
    lastPrice: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
    defaultCounterpartyId: z.union([z.string().trim().min(1), z.null()]).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

const updateCounterpartySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z.union([z.string().trim().min(1), z.null()]).optional(),
    paymentTerms: z.union([z.string().trim().min(1), z.null()]).optional(),
    notes: z.union([z.string().trim().min(1), z.null()]).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

const createCounterpartySchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['SUPPLIER', 'LENDER']).optional(),
  phone: z.string().trim().min(1).optional(),
  paymentTerms: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
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
const patchRequisitionSchema = z.object({
  counterpartyId: z.string().trim().min(1),
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
      if (parsed.data.defaultCounterpartyId) {
        const counterparty = await prisma.counterparty.findUnique({
          where: { id: parsed.data.defaultCounterpartyId },
          select: { id: true, businessId: true, active: true },
        });
        if (!counterparty || counterparty.businessId !== businessId || !counterparty.active) {
          res.status(400).json({ ok: false, error: 'Proveedor habitual inválido para este negocio' });
          return;
        }
      }

      const item = await prisma.item.create({
        data: {
          businessId,
          name: parsed.data.name,
          unit: parsed.data.unit,
          category: parsed.data.category,
          lastPrice:
            typeof parsed.data.lastPrice === 'number' ? Number(parsed.data.lastPrice.toFixed(2)) : null,
          defaultCounterpartyId: parsed.data.defaultCounterpartyId || null,
        },
        include: {
          defaultCounterparty: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
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

requisitionsRouter.delete(
  '/businesses/:businessId/items/:itemId',
  authMiddleware,
  requireRole((req) => req.params.businessId, managerRoles),
  async (req, res, next) => {
    try {
      const { businessId, itemId } = req.params;
      const existing = await prisma.item.findUnique({
        where: { id: itemId },
        select: { id: true, businessId: true },
      });
      if (!existing || existing.businessId !== businessId) {
        res.status(404).json({ ok: false, error: 'Insumo no encontrado para este negocio' });
        return;
      }

      const usage = await prisma.item.findUnique({
        where: { id: itemId },
        select: {
          _count: {
            select: {
              lines: true,
              priceHistory: true,
            },
          },
        },
      });
      const hasHistory = Boolean((usage?._count.lines || 0) + (usage?._count.priceHistory || 0));

      if (!hasHistory) {
        await prisma.item.delete({ where: { id: itemId } });
        res.status(200).json({ ok: true, deleted: true, deactivated: false, message: 'Insumo eliminado' });
        return;
      }

      await prisma.item.update({
        where: { id: itemId },
        data: { active: false, defaultCounterpartyId: null },
      });
      res.status(200).json({
        ok: true,
        deleted: false,
        deactivated: true,
        message: 'Se desactivó porque tiene historial — ya no aparecerá en nuevas requisiciones',
      });
    } catch (error) {
      next(error);
    }
  },
);

requisitionsRouter.delete(
  '/businesses/:businessId/counterparties/:id',
  authMiddleware,
  requireRole((req) => req.params.businessId, managerRoles),
  async (req, res, next) => {
    try {
      const { businessId, id } = req.params;
      const existing = await prisma.counterparty.findUnique({
        where: { id },
        select: { id: true, businessId: true },
      });
      if (!existing || existing.businessId !== businessId) {
        res.status(404).json({ ok: false, error: 'Proveedor no encontrado para este negocio' });
        return;
      }

      const usage = await prisma.counterparty.findUnique({
        where: { id },
        select: {
          _count: {
            select: {
              purchases: true,
              requisitions: true,
              defaultForItems: true,
              priceHistory: true,
            },
          },
        },
      });
      const hasHistory = Boolean(
        (usage?._count.purchases || 0) +
          (usage?._count.requisitions || 0) +
          (usage?._count.defaultForItems || 0) +
          (usage?._count.priceHistory || 0),
      );

      if (!hasHistory) {
        await prisma.counterparty.delete({ where: { id } });
        res.status(200).json({ ok: true, deleted: true, deactivated: false, message: 'Proveedor eliminado' });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.item.updateMany({
          where: { businessId, defaultCounterpartyId: id },
          data: { defaultCounterpartyId: null },
        });
        await tx.counterparty.update({
          where: { id },
          data: { active: false },
        });
      });

      res.status(200).json({
        ok: true,
        deleted: false,
        deactivated: true,
        message: 'Se desactivó porque tiene historial — ya no aparecerá en nuevas requisiciones',
      });
    } catch (error) {
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
      const includeAll = String(req.query.all || '').toLowerCase() === 'true';
      const items = await prisma.item.findMany({
        where: { businessId, ...(includeAll ? {} : { active: true }) },
        include: {
          defaultCounterparty: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      res.status(200).json({ ok: true, items });
    } catch (error) {
      next(error);
    }
  },
);

requisitionsRouter.patch(
  '/businesses/:businessId/items/:itemId',
  authMiddleware,
  requireRole((req) => req.params.businessId, managerRoles),
  async (req, res, next) => {
    try {
      const { businessId, itemId } = req.params;
      const parsed = updateItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const itemExists = await prisma.item.findUnique({
        where: { id: itemId },
        select: { id: true, businessId: true },
      });
      if (!itemExists || itemExists.businessId !== businessId) {
        res.status(404).json({ ok: false, error: 'Insumo no encontrado para este negocio' });
        return;
      }

      if (parsed.data.defaultCounterpartyId) {
        const counterparty = await prisma.counterparty.findUnique({
          where: { id: parsed.data.defaultCounterpartyId },
          select: { id: true, businessId: true, active: true },
        });
        if (!counterparty || counterparty.businessId !== businessId || !counterparty.active) {
          res.status(400).json({ ok: false, error: 'Proveedor habitual inválido para este negocio' });
          return;
        }
      }

      const item = await prisma.item.update({
        where: { id: itemId },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.unit !== undefined ? { unit: parsed.data.unit } : {}),
          ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
          ...(parsed.data.lastPrice !== undefined
            ? {
                lastPrice:
                  typeof parsed.data.lastPrice === 'number'
                    ? Number(parsed.data.lastPrice.toFixed(2))
                    : null,
              }
            : {}),
          ...(parsed.data.defaultCounterpartyId !== undefined
            ? { defaultCounterpartyId: parsed.data.defaultCounterpartyId }
            : {}),
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        },
        include: {
          defaultCounterparty: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      });

      res.status(200).json({ ok: true, item });
    } catch (error) {
      if (error?.code === 'P2002') {
        res.status(409).json({ ok: false, error: 'Ese insumo ya existe en este negocio' });
        return;
      }
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
          paymentTerms: parsed.data.paymentTerms,
          notes: parsed.data.notes,
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
      const includeAll = String(req.query.all || '').toLowerCase() === 'true';
      const counterparties = await prisma.counterparty.findMany({
        where: { businessId, ...(includeAll ? {} : { active: true }) },
        orderBy: { name: 'asc' },
      });

      res.status(200).json({ ok: true, counterparties });
    } catch (error) {
      next(error);
    }
  },
);

requisitionsRouter.patch(
  '/businesses/:businessId/counterparties/:id',
  authMiddleware,
  requireRole((req) => req.params.businessId, managerRoles),
  async (req, res, next) => {
    try {
      const { businessId, id } = req.params;
      const parsed = updateCounterpartySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const existing = await prisma.counterparty.findUnique({
        where: { id },
        select: { id: true, businessId: true },
      });

      if (!existing || existing.businessId !== businessId) {
        res.status(404).json({ ok: false, error: 'Proveedor no encontrado para este negocio' });
        return;
      }

      const counterparty = await prisma.counterparty.update({
        where: { id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
          ...(parsed.data.paymentTerms !== undefined ? { paymentTerms: parsed.data.paymentTerms } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        },
      });

      res.status(200).json({ ok: true, counterparty });
    } catch (error) {
      if (error?.code === 'P2002') {
        res.status(409).json({ ok: false, error: 'Ese proveedor ya existe en este negocio' });
        return;
      }
      next(error);
    }
  },
);

requisitionsRouter.post('/locations/:locationId/requisitions', authMiddleware, async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const parsed = createRequisitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const { location, membership } = await getMembershipForLocation({
      userId: req.userId,
      locationId,
    });

    if (!location) {
      res.status(404).json({ ok: false, error: 'Location no encontrada' });
      return;
    }

    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para crear requisiciones en esta sucursal' });
      return;
    }

    if (parsed.data.counterpartyId) {
      const counterparty = await prisma.counterparty.findUnique({
        where: { id: parsed.data.counterpartyId },
        select: { id: true, businessId: true, active: true },
      });

      if (!counterparty || counterparty.businessId !== location.businessId || !counterparty.active) {
        res.status(400).json({ ok: false, error: 'Proveedor inválido para este negocio' });
        return;
      }
    }

    const itemIds = [...new Set(parsed.data.lines.map((line) => line.itemId))];
    const items = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        businessId: location.businessId,
        active: true,
      },
      select: {
        id: true,
        lastPrice: true,
        defaultCounterpartyId: true,
      },
    });
    const itemsMap = new Map(items.map((item) => [item.id, item]));
    const missingItem = itemIds.find((itemId) => !itemsMap.has(itemId));
    if (missingItem) {
      res.status(400).json({ ok: false, error: 'Hay líneas con items inválidos para este negocio' });
      return;
    }

    const normalizedLines = parsed.data.lines.map((line) => {
      const item = itemsMap.get(line.itemId);
      const unitPrice =
        typeof line.unitPrice === 'number'
          ? Number(line.unitPrice.toFixed(2))
          : Number(Number(item.lastPrice || 0).toFixed(2));
      const qty = Number(Number(line.qty).toFixed(3));
      return {
        itemId: line.itemId,
        qty,
        unitPrice,
      };
    });

    let requisitionCounterpartyId = parsed.data.counterpartyId || null;
    if (!requisitionCounterpartyId) {
      const defaultCounterparties = normalizedLines
        .map((line) => itemsMap.get(line.itemId)?.defaultCounterpartyId || null)
        .filter(Boolean);
      if (defaultCounterparties.length === normalizedLines.length) {
        const uniqueCounterparties = [...new Set(defaultCounterparties)];
        if (uniqueCounterparties.length === 1) {
          requisitionCounterpartyId = uniqueCounterparties[0];
        }
      }
    }

    const estimatedTotal = Number(
      normalizedLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0).toFixed(2),
    );

    const requisition = await prisma.$transaction(async (tx) => {
      const latestFolio = await tx.requisition.findFirst({
        where: {
          location: {
            businessId: location.businessId,
          },
        },
        orderBy: { folio: 'desc' },
        select: { folio: true },
      });
      const nextFolio = (latestFolio?.folio || 0) + 1;

      return tx.requisition.create({
        data: {
          locationId,
          counterpartyId: requisitionCounterpartyId,
          folio: nextFolio,
          status: 'PENDING_APPROVAL',
          requestedById: req.userId,
          estimatedTotal,
          notes: parsed.data.notes,
          lines: {
            create: normalizedLines.map((line) => ({
              itemId: line.itemId,
              qty: line.qty,
              unitPrice: line.unitPrice,
            })),
          },
        },
        include: {
          lines: true,
        },
      });
    });

    res.status(201).json({ ok: true, requisition });
  } catch (error) {
    next(error);
  }
});

requisitionsRouter.post('/requisitions/:id/approve', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { requisition, membership } = await getMembershipForRequisition({
      userId: req.userId,
      requisitionId: id,
    });

    if (!requisition) {
      res.status(404).json({ ok: false, error: 'Requisición no encontrada' });
      return;
    }

    if (!membership || !approverRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para aprobar requisiciones' });
      return;
    }

    if (requisition.status !== 'PENDING_APPROVAL' && requisition.status !== 'DRAFT') {
      res.status(409).json({ ok: false, error: 'La requisición no está pendiente de aprobación' });
      return;
    }

    const approved = await prisma.requisition.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: req.userId,
        approvedAt: new Date(),
      },
    });

    res.status(200).json({ ok: true, requisition: approved });
  } catch (error) {
    next(error);
  }
});
requisitionsRouter.patch('/requisitions/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = patchRequisitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const { requisition, membership } = await getMembershipForRequisition({
      userId: req.userId,
      requisitionId: id,
    });

    if (!requisition) {
      res.status(404).json({ ok: false, error: 'Requisición no encontrada' });
      return;
    }

    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para actualizar requisiciones' });
      return;
    }

    if (requisition.status === 'RECEIVED' || requisition.status === 'CANCELLED') {
      res.status(409).json({ ok: false, error: 'No se puede cambiar proveedor en requisiciones recibidas o canceladas' });
      return;
    }

    const counterparty = await prisma.counterparty.findUnique({
      where: { id: parsed.data.counterpartyId },
      select: { id: true, businessId: true, active: true },
    });
    if (!counterparty || counterparty.businessId !== requisition.location.businessId || !counterparty.active) {
      res.status(400).json({ ok: false, error: 'Proveedor inválido para este negocio' });
      return;
    }

    const updated = await prisma.requisition.update({
      where: { id },
      data: { counterpartyId: counterparty.id },
      include: {
        lines: {
          include: {
            item: true,
          },
        },
        counterparty: true,
      },
    });

    res.status(200).json({ ok: true, requisition: updated });
  } catch (error) {
    next(error);
  }
});

requisitionsRouter.post('/requisitions/:id/receive', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = receiveRequisitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const { requisition, membership } = await getMembershipForRequisition({
      userId: req.userId,
      requisitionId: id,
    });

    if (!requisition) {
      res.status(404).json({ ok: false, error: 'Requisición no encontrada' });
      return;
    }

    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para recibir requisiciones' });
      return;
    }

    if (requisition.status === 'RECEIVED') {
      res.status(409).json({ ok: false, error: 'La requisición ya fue recibida' });
      return;
    }

    if (!['APPROVED', 'ORDERED'].includes(requisition.status)) {
      res.status(409).json({ ok: false, error: 'Solo se pueden recibir requisiciones aprobadas u ordenadas' });
      return;
    }

    const counterpartyId = parsed.data.counterpartyId || requisition.counterpartyId;
    if (!counterpartyId) {
      res.status(400).json({ ok: false, error: 'counterpartyId es obligatorio para recibir esta requisición' });
      return;
    }

    const counterparty = await prisma.counterparty.findUnique({
      where: { id: counterpartyId },
      select: { id: true, businessId: true },
    });
    if (!counterparty || counterparty.businessId !== requisition.location.businessId) {
      res.status(400).json({ ok: false, error: 'Proveedor inválido para este negocio' });
      return;
    }

    const incomingLineMap = new Map(parsed.data.lines.map((line) => [line.lineId, line]));
    if (incomingLineMap.size !== requisition.lines.length) {
      res.status(400).json({ ok: false, error: 'Debes enviar exactamente una línea de recepción por línea requisitada' });
      return;
    }

    const invalidLine = requisition.lines.find((line) => !incomingLineMap.has(line.id));
    if (invalidLine) {
      res.status(400).json({ ok: false, error: 'Hay líneas de recepción que no pertenecen a la requisición' });
      return;
    }

    const today = getMexicoTodayDate();
    const normalized = requisition.lines.map((line) => {
      const incoming = incomingLineMap.get(line.id);
      const receivedQty = Number(Number(incoming.receivedQty).toFixed(3));
      const actualPrice = Number(Number(incoming.actualPrice).toFixed(2));
      return {
        lineId: line.id,
        itemId: line.itemId,
        receivedQty,
        actualPrice,
      };
    });

    const receivedTotal = Number(
      normalized.reduce((sum, line) => sum + line.receivedQty * line.actualPrice, 0).toFixed(2),
    );

    const result = await prisma.$transaction(async (tx) => {
      await Promise.all(
        normalized.map((line) =>
          tx.requisitionLine.update({
            where: { id: line.lineId },
            data: {
              receivedQty: line.receivedQty,
              actualPrice: line.actualPrice,
            },
          }),
        ),
      );

      await tx.requisition.update({
        where: { id },
        data: {
          counterpartyId,
          receivedTotal,
          status: 'RECEIVED',
          receivedAt: new Date(),
        },
      });

      await Promise.all(
        normalized.map((line) =>
          tx.item.update({
            where: { id: line.itemId },
            data: {
              lastPrice: line.actualPrice,
            },
          }),
        ),
      );

      await tx.itemPriceHistory.createMany({
        data: normalized.map((line) => ({
          itemId: line.itemId,
          counterpartyId,
          date: today,
          unitPrice: line.actualPrice,
        })),
      });

      const purchase = await tx.purchase.create({
        data: {
          counterpartyId,
          locationId: requisition.locationId,
          kind: 'GOODS',
          date: today,
          total: receivedTotal,
          status: 'PENDING',
          requisitionId: requisition.id,
          notes: requisition.notes || null,
        },
      });

      const insumosCategory = await tx.expenseCategory.findUnique({
        where: {
          businessId_name: {
            businessId: requisition.location.businessId,
            name: 'Insumos',
          },
        },
      });

      if (!insumosCategory) {
        throw new Error('No existe la categoría "Insumos" para este negocio');
      }

      const expense = await tx.expense.create({
        data: {
          locationId: requisition.locationId,
          categoryId: insumosCategory.id,
          counterpartyId,
          date: today,
          concept: `Recepción requisición #${requisition.folio}`,
          amount: receivedTotal,
          method: 'OTRO',
          source: 'REQUISITION',
          purchaseId: purchase.id,
          createdById: req.userId,
        },
      });

      return { purchase, expense };
    });

    const fullRequisition = await prisma.requisition.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            item: true,
          },
        },
        location: true,
        counterparty: true,
      },
    });

    res.status(200).json({
      ok: true,
      requisition: fullRequisition,
      purchase: result.purchase,
      expense: result.expense,
    });
  } catch (error) {
    if (error?.message?.includes('categoría "Insumos"')) {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }
    next(error);
  }
});

requisitionsRouter.post('/requisitions/:id/cancel', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { requisition, membership } = await getMembershipForRequisition({
      userId: req.userId,
      requisitionId: id,
    });

    if (!requisition) {
      res.status(404).json({ ok: false, error: 'Requisición no encontrada' });
      return;
    }

    if (!membership || !approverRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para cancelar requisiciones' });
      return;
    }

    if (requisition.status === 'RECEIVED') {
      res.status(409).json({ ok: false, error: 'No se puede cancelar una requisición recibida' });
      return;
    }

    const cancelled = await prisma.requisition.update({
      where: { id },
      data: {
        status: 'CANCELLED',
      },
    });

    res.status(200).json({ ok: true, requisition: cancelled });
  } catch (error) {
    next(error);
  }
});

requisitionsRouter.get('/locations/:locationId/requisitions', authMiddleware, async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const status = req.query.status ? String(req.query.status) : undefined;

    const { location, membership } = await getMembershipForLocation({
      userId: req.userId,
      locationId,
    });

    if (!location) {
      res.status(404).json({ ok: false, error: 'Location no encontrada' });
      return;
    }

    if (!membership) {
      res.status(403).json({ ok: false, error: 'No autorizado para ver requisiciones en esta sucursal' });
      return;
    }

    if (
      status &&
      !['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED'].includes(status)
    ) {
      res.status(400).json({ ok: false, error: 'Status inválido' });
      return;
    }

    const requisitions = await prisma.requisition.findMany({
      where: {
        locationId,
        ...(status ? { status } : {}),
      },
      include: {
        lines: {
          include: {
            item: true,
          },
        },
        counterparty: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const userIds = [
      ...new Set(
        requisitions
          .flatMap((requisition) => [requisition.requestedById, requisition.approvedById])
          .filter(Boolean),
      ),
    ];

    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const usersMap = new Map(users.map((user) => [user.id, user.name]));

    res.status(200).json({
      ok: true,
      items: requisitions.map((requisition) => ({
        ...requisition,
        requestedBy: requisition.requestedById
          ? {
              id: requisition.requestedById,
              name: usersMap.get(requisition.requestedById) || 'Usuario',
            }
          : null,
        approvedBy: requisition.approvedById
          ? {
              id: requisition.approvedById,
              name: usersMap.get(requisition.approvedById) || 'Usuario',
            }
          : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { requisitionsRouter };
