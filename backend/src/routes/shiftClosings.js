const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

const shiftClosingsRouter = Router();

const allowedRoles = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const ownerAdminRoles = new Set(['OWNER', 'ADMIN']);
const defaultFeeByChannel = {
  PISO: 0,
  EVENTO: 0,
  OTRO: 0,
  RAPPI: 34.8,
  UBER_EATS: 34.8,
  DIDI_FOOD: 34.8,
};

const createShiftClosingSchema = z.object({
  date: z.string().min(1),
  type: z.enum(['MATUTINO', 'VESPERTINO', 'NOCTURNO', 'UNICO']),
  openingCash: z.coerce.number().finite(),
  cashWithdrawn: z.coerce.number().finite(),
  countedCash: z.coerce.number().finite(),
  cashBreakdown: z.record(z.string(), z.coerce.number().int().nonnegative()).optional(),
  ticketCount: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        channel: z.enum(['PISO', 'RAPPI', 'UBER_EATS', 'DIDI_FOOD', 'EVENTO', 'OTRO']),
        method: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'APP', 'OTRO']),
        gross: z.coerce.number().nonnegative(),
        feePct: z.coerce.number().nonnegative().optional(),
      }),
    )
    .min(1),
});
const voidShiftSchema = z.object({
  reason: z.string().trim().min(1, 'Motivo obligatorio'),
});

function toMoney(value) {
  return Number(value).toFixed(2);
}

function parseDateOnly(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getCashBreakdownTotal(cashBreakdown) {
  return Number(
    Object.entries(cashBreakdown || {})
      .reduce((sum, [denominationKey, quantity]) => {
        const denomination = Number.parseFloat(String(denominationKey));
        if (!Number.isFinite(denomination)) return sum;
        return sum + denomination * Number(quantity || 0);
      }, 0)
      .toFixed(2),
  );
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

async function getMembershipForShift({ userId, shiftId }) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      locationId: true,
      date: true,
      type: true,
      voidedAt: true,
      location: {
        select: {
          businessId: true,
        },
      },
    },
  });

  if (!shift) return { shift: null, membership: null };

  const membership = await prisma.membership.findUnique({
    where: {
      userId_businessId: {
        userId,
        businessId: shift.location.businessId,
      },
    },
  });

  return { shift, membership };
}

shiftClosingsRouter.post('/locations/:locationId/shift-closings', authMiddleware, async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const parsed = createShiftClosingSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'Payload inválido',
        details: parsed.error.flatten(),
      });
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

    if (!membership || !allowedRoles.has(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para cerrar turno en esta sucursal' });
      return;
    }

    const shiftDate = parseDateOnly(parsed.data.date);
    if (!shiftDate) {
      res.status(400).json({ ok: false, error: 'Fecha inválida' });
      return;
    }
    const existingActiveShift = await prisma.shift.findFirst({
      where: {
        locationId,
        date: shiftDate,
        type: parsed.data.type,
        voidedAt: null,
      },
      select: { id: true },
    });
    if (existingActiveShift) {
      res.status(409).json({
        ok: false,
        error: 'Ya existe un cierre para esa sucursal, fecha y turno',
      });
      return;
    }

    const normalizedLines = parsed.data.lines.map((line) => {
      const feePct = line.feePct ?? defaultFeeByChannel[line.channel];
      const feeAmount = Number(((line.gross * feePct) / 100).toFixed(2));
      const net = Number((line.gross - feeAmount).toFixed(2));
      return {
        channel: line.channel,
        method: line.method,
        gross: Number(line.gross),
        feePct,
        feeAmount,
        net,
      };
    });

    const efectivoVentas = normalizedLines
      .filter((line) => line.method === 'EFECTIVO')
      .reduce((sum, line) => sum + line.gross, 0);

    const expectedCash = Number(
      (parsed.data.openingCash + efectivoVentas - parsed.data.cashWithdrawn).toFixed(2),
    );
    const difference = Number((parsed.data.countedCash - expectedCash).toFixed(2));
    const cashBreakdown = parsed.data.cashBreakdown || null;
    if (cashBreakdown) {
      const breakdownTotal = getCashBreakdownTotal(cashBreakdown);
      const countedCash = Number(Number(parsed.data.countedCash).toFixed(2));
      const gap = Math.abs(breakdownTotal - countedCash);
      if (gap > 0.01) {
        res.status(400).json({
          ok: false,
          error: `El desglose por denominaciones suma ${toMoney(
            breakdownTotal,
          )} y no coincide con countedCash ${toMoney(countedCash)}`,
        });
        return;
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({
        data: {
          locationId,
          date: shiftDate,
          type: parsed.data.type,
          status: 'CLOSED',
          closedById: req.userId,
        },
      });

      const closing = await tx.shiftClosing.create({
        data: {
          shiftId: shift.id,
          openingCash: toMoney(parsed.data.openingCash),
          expectedCash: toMoney(expectedCash),
          countedCash: toMoney(parsed.data.countedCash),
          cashBreakdown,
          difference: toMoney(difference),
          cashWithdrawn: toMoney(parsed.data.cashWithdrawn),
          ticketCount: parsed.data.ticketCount,
          notes: parsed.data.notes,
          evidenceUrls: [],
          lines: {
            create: normalizedLines.map((line) => ({
              channel: line.channel,
              method: line.method,
              gross: toMoney(line.gross),
              feePct: toMoney(line.feePct),
              feeAmount: toMoney(line.feeAmount),
              net: toMoney(line.net),
            })),
          },
        },
        include: {
          lines: true,
          shift: true,
        },
      });

      return { shift, closing };
    });

    res.status(201).json({
      ok: true,
      closing: created.closing,
      cashStatus: difference >= 0 ? 'CUADRO' : 'FALTANTE',
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      res.status(409).json({
        ok: false,
        error: 'Ya existe un cierre para esa sucursal, fecha y turno',
      });
      return;
    }
    next(error);
  }
});

shiftClosingsRouter.get('/locations/:locationId/shift-closings', authMiddleware, async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { location, membership } = await getMembershipForLocation({
      userId: req.userId,
      locationId,
    });

    if (!location) {
      res.status(404).json({ ok: false, error: 'Location no encontrada' });
      return;
    }

    if (!membership) {
      res.status(403).json({ ok: false, error: 'No autorizado para ver cierres en esta sucursal' });
      return;
    }

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 13);

    const from = req.query.from ? parseDateOnly(String(req.query.from)) : defaultFrom;
    const to = req.query.to ? parseDateOnly(String(req.query.to)) : now;

    if (!from || !to) {
      res.status(400).json({ ok: false, error: 'Parámetros from/to inválidos' });
      return;
    }

    const shiftClosings = await prisma.shiftClosing.findMany({
      where: {
        shift: {
          locationId,
          date: {
            gte: from,
            lte: to,
          },
        },
      },
      include: {
        shift: {
          select: {
            id: true,
            date: true,
            type: true,
            closedById: true,
            voidedAt: true,
            voidReason: true,
            voidedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        lines: true,
      },
      orderBy: {
        shift: {
          date: 'desc',
        },
      },
    });

    const closedByIds = [...new Set(shiftClosings.map((closing) => closing.shift.closedById).filter(Boolean))];
    const closedByUsers = closedByIds.length
      ? await prisma.user.findMany({
          where: { id: { in: closedByIds } },
          select: { id: true, name: true },
        })
      : [];
    const closedByMap = new Map(closedByUsers.map((user) => [user.id, user.name]));

    const items = shiftClosings.map((closing) => ({
      ...closing,
      closedBy: closing.shift.closedById
        ? {
            id: closing.shift.closedById,
            name: closedByMap.get(closing.shift.closedById) || 'Usuario',
          }
        : null,
    }));

    res.status(200).json({ ok: true, items });
  } catch (error) {
    next(error);
  }
});

shiftClosingsRouter.post('/shifts/:id/void', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = voidShiftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const { shift, membership } = await getMembershipForShift({
      userId: req.userId,
      shiftId: id,
    });
    if (!shift) {
      res.status(404).json({ ok: false, error: 'Turno no encontrado' });
      return;
    }
    if (!membership || !ownerAdminRoles.has(membership.role)) {
      res.status(403).json({ ok: false, error: 'Solo OWNER/ADMIN pueden anular cierres' });
      return;
    }
    if (shift.voidedAt) {
      res.status(409).json({ ok: false, error: 'Este cierre ya está anulado' });
      return;
    }

    const hasClosing = await prisma.shiftClosing.findUnique({
      where: { shiftId: id },
      select: { id: true },
    });
    if (!hasClosing) {
      res.status(404).json({ ok: false, error: 'No existe cierre para este turno' });
      return;
    }

    const voidedShift = await prisma.shift.update({
      where: { id },
      data: {
        voidedAt: new Date(),
        voidedById: req.userId,
        voidReason: parsed.data.reason.trim(),
      },
      select: {
        id: true,
        locationId: true,
        date: true,
        type: true,
        voidedAt: true,
        voidReason: true,
        voidedBy: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(200).json({ ok: true, shift: voidedShift });
  } catch (error) {
    next(error);
  }
});

module.exports = { shiftClosingsRouter };
