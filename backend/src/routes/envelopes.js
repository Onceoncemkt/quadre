const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const envelopesRouter = Router();
const ownerAdminRoles = ['OWNER', 'ADMIN'];
const managerRoles = ['OWNER', 'ADMIN', 'MANAGER'];

const createEnvelopeSchema = z.object({
  name: z.string().trim().min(1),
  targetAmount: z.coerce.number().positive(),
  frequency: z.enum(['MONTHLY', 'ONE_TIME']),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryId: z.string().trim().min(1).optional(),
});

const createDepositSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.coerce.number().positive(),
  note: z.string().optional(),
});

const withdrawEnvelopeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.coerce.number().positive(),
  reason: z.string().trim().min(1),
});

const transferEnvelopeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toEnvelopeId: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  note: z.string().optional(),
});

const payEnvelopeSchema = z.object({
  locationId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.coerce.number().positive().optional(),
  method: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'APP', 'OTRO']),
});

function parseDateOnly(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getMexicoTodayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function getMonthDays(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function getNextDueDate({ today, frequency, dueDay, dueDate }) {
  if (frequency === 'ONE_TIME') return dueDate || today;
  const year = today.getUTCFullYear();
  const monthIndex = today.getUTCMonth();
  const currentMonthDueDay = Math.min(dueDay || 1, getMonthDays(year, monthIndex));
  const currentMonthDueDate = new Date(Date.UTC(year, monthIndex, currentMonthDueDay));
  if (currentMonthDueDate.getTime() >= today.getTime()) return currentMonthDueDate;
  const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  const nextMonthDueDay = Math.min(dueDay || 1, getMonthDays(nextYear, nextMonth));
  return new Date(Date.UTC(nextYear, nextMonth, nextMonthDueDay));
}

function getDaysDiff(fromDate, toDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / msPerDay));
}

function getEnvelopeSavedAmount(envelope) {
  return Number(
    (envelope.deposits || [])
      .filter((deposit) => !envelope.lastPaidAt || deposit.date.getTime() > envelope.lastPaidAt.getTime())
      .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0)
      .toFixed(2),
  );
}

function parseMovementFromDeposit(deposit) {
  const rawNote = (deposit.note || '').trim();
  const amount = Number(deposit.amount || 0);

  if (rawNote.startsWith('WITHDRAW:')) {
    return {
      type: 'WITHDRAW',
      note: null,
      reason: rawNote.slice('WITHDRAW:'.length).trim(),
    };
  }
  if (rawNote.startsWith('TRANSFER_OUT:')) {
    const [, targetEnvelopeId = '', transferNote = ''] = rawNote.split(':');
    return {
      type: 'TRANSFER_OUT',
      note: transferNote.trim() || `A sobre ${targetEnvelopeId}`,
      reason: null,
    };
  }
  if (rawNote.startsWith('TRANSFER_IN:')) {
    const [, sourceEnvelopeId = '', transferNote = ''] = rawNote.split(':');
    return {
      type: 'TRANSFER_IN',
      note: transferNote.trim() || `Desde sobre ${sourceEnvelopeId}`,
      reason: null,
    };
  }
  return {
    type: amount < 0 ? 'WITHDRAW' : 'DEPOSIT',
    note: rawNote || null,
    reason: null,
  };
}

async function getMembershipByBusinessId({ userId, businessId }) {
  return prisma.membership.findUnique({
    where: {
      userId_businessId: {
        userId,
        businessId,
      },
    },
  });
}

async function getEnvelopeAndMembership({ userId, envelopeId }) {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: {
      business: {
        select: { id: true },
      },
    },
  });
  if (!envelope) return { envelope: null, membership: null };
  const membership = await getMembershipByBusinessId({ userId, businessId: envelope.businessId });
  return { envelope, membership };
}

envelopesRouter.post(
  '/businesses/:id/envelopes',
  authMiddleware,
  requireRole((req) => req.params.id, ownerAdminRoles),
  async (req, res, next) => {
    try {
      const { id: businessId } = req.params;
      const parsed = createEnvelopeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      if (parsed.data.frequency === 'MONTHLY' && !parsed.data.dueDay) {
        res.status(400).json({ ok: false, error: 'dueDay es obligatorio para sobres mensuales' });
        return;
      }
      if (parsed.data.frequency === 'ONE_TIME' && !parsed.data.dueDate) {
        res.status(400).json({ ok: false, error: 'dueDate es obligatorio para sobres únicos' });
        return;
      }

      if (parsed.data.categoryId) {
        const category = await prisma.expenseCategory.findUnique({
          where: { id: parsed.data.categoryId },
          select: { id: true, businessId: true },
        });
        if (!category || category.businessId !== businessId) {
          res.status(400).json({ ok: false, error: 'Categoría inválida para este negocio' });
          return;
        }
      }

      const envelope = await prisma.envelope.create({
        data: {
          businessId,
          name: parsed.data.name,
          targetAmount: Number(parsed.data.targetAmount.toFixed(2)),
          frequency: parsed.data.frequency,
          dueDay: parsed.data.frequency === 'MONTHLY' ? parsed.data.dueDay : null,
          dueDate:
            parsed.data.frequency === 'ONE_TIME' && parsed.data.dueDate
              ? parseDateOnly(parsed.data.dueDate)
              : null,
          categoryId: parsed.data.categoryId || null,
        },
      });
      res.status(201).json({ ok: true, envelope });
    } catch (error) {
      next(error);
    }
  },
);

envelopesRouter.get(
  '/businesses/:id/envelopes',
  authMiddleware,
  requireRole((req) => req.params.id),
  async (req, res, next) => {
    try {
      const { id: businessId } = req.params;
      const today = parseDateOnly(getMexicoTodayString());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

      const envelopes = await prisma.envelope.findMany({
        where: { businessId, active: true },
        include: {
          deposits: {
            orderBy: { date: 'asc' },
          },
          category: {
            select: { id: true, name: true, kind: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const items = envelopes.map((envelope) => {
        const saved = getEnvelopeSavedAmount(envelope);
        const nextDueDate = getNextDueDate({
          today,
          frequency: envelope.frequency,
          dueDay: envelope.dueDay,
          dueDate: envelope.dueDate,
        });
        const daysLeft = getDaysDiff(today, nextDueDate);
        const target = Number(envelope.targetAmount || 0);
        const remaining = Number(Math.max(target - saved, 0).toFixed(2));
        const dailyNeeded = Number((remaining / daysLeft).toFixed(2));
        return {
          ...envelope,
          saved,
          nextDue: nextDueDate,
          daysLeft,
          remaining,
          dailyNeeded,
        };
      });

      const totalDailyNeeded = Number(items.reduce((sum, item) => sum + item.dailyNeeded, 0).toFixed(2));

      const [cashInAggregate, paidFromCashAggregate] = await Promise.all([
        prisma.closingLine.aggregate({
          _sum: { gross: true },
          where: {
            method: 'EFECTIVO',
            closing: {
              shift: {
                location: { businessId },
                voidedAt: null,
                date: {
                  gte: today,
                  lt: tomorrow,
                },
              },
            },
          },
        }),
        prisma.expense.aggregate({
          _sum: { amount: true },
          where: {
            paidFromCash: true,
            location: { businessId },
            date: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),
      ]);

      const availableCashToday = Number(
        (Number(cashInAggregate._sum.gross || 0) - Number(paidFromCashAggregate._sum.amount || 0)).toFixed(2),
      );

      res.status(200).json({
        ok: true,
        items,
        totalDailyNeeded,
        availableCashToday,
      });
    } catch (error) {
      next(error);
    }
  },
);

envelopesRouter.post('/envelopes/:id/deposits', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = createDepositSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const { envelope, membership } = await getEnvelopeAndMembership({ userId: req.userId, envelopeId: id });
    if (!envelope || !envelope.active) {
      res.status(404).json({ ok: false, error: 'Sobre no encontrado' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para abonar a este sobre' });
      return;
    }

    const date = parsed.data.date ? parseDateOnly(parsed.data.date) : parseDateOnly(getMexicoTodayString());
    if (!date) {
      res.status(400).json({ ok: false, error: 'Fecha inválida' });
      return;
    }

    const deposit = await prisma.envelopeDeposit.create({
      data: {
        envelopeId: id,
        date,
        amount: Number(parsed.data.amount.toFixed(2)),
        note: parsed.data.note,
      },
    });
    res.status(201).json({ ok: true, deposit });
  } catch (error) {
    next(error);
  }
});

envelopesRouter.post('/envelopes/:id/withdraw', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = withdrawEnvelopeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const { envelope, membership } = await getEnvelopeAndMembership({ userId: req.userId, envelopeId: id });
    if (!envelope || !envelope.active) {
      res.status(404).json({ ok: false, error: 'Sobre no encontrado' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para retirar de este sobre' });
      return;
    }

    const date = parsed.data.date ? parseDateOnly(parsed.data.date) : parseDateOnly(getMexicoTodayString());
    if (!date) {
      res.status(400).json({ ok: false, error: 'Fecha inválida' });
      return;
    }

    const envelopeWithDeposits = await prisma.envelope.findUnique({
      where: { id },
      include: { deposits: { orderBy: { date: 'asc' } } },
    });
    if (!envelopeWithDeposits) {
      res.status(404).json({ ok: false, error: 'Sobre no encontrado' });
      return;
    }

    const available = getEnvelopeSavedAmount(envelopeWithDeposits);
    const withdrawAmount = Number(parsed.data.amount.toFixed(2));
    if (withdrawAmount > available) {
      res.status(400).json({ ok: false, error: 'Saldo insuficiente en el sobre' });
      return;
    }

    const deposit = await prisma.envelopeDeposit.create({
      data: {
        envelopeId: id,
        date,
        amount: Number((withdrawAmount * -1).toFixed(2)),
        note: `WITHDRAW:${parsed.data.reason.trim()}`,
      },
    });

    res.status(201).json({ ok: true, movement: deposit });
  } catch (error) {
    next(error);
  }
});

envelopesRouter.post('/envelopes/:id/transfer', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = transferEnvelopeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    if (parsed.data.toEnvelopeId === id) {
      res.status(400).json({ ok: false, error: 'El sobre destino debe ser distinto' });
      return;
    }

    const { envelope, membership } = await getEnvelopeAndMembership({ userId: req.userId, envelopeId: id });
    if (!envelope || !envelope.active) {
      res.status(404).json({ ok: false, error: 'Sobre origen no encontrado' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para transferir entre sobres' });
      return;
    }

    const targetEnvelope = await prisma.envelope.findUnique({
      where: { id: parsed.data.toEnvelopeId },
      select: { id: true, businessId: true, active: true },
    });
    if (!targetEnvelope || !targetEnvelope.active || targetEnvelope.businessId !== envelope.businessId) {
      res.status(400).json({ ok: false, error: 'Sobre destino inválido para este negocio' });
      return;
    }

    const transferDate = parsed.data.date ? parseDateOnly(parsed.data.date) : parseDateOnly(getMexicoTodayString());
    if (!transferDate) {
      res.status(400).json({ ok: false, error: 'Fecha inválida' });
      return;
    }

    const sourceEnvelopeWithDeposits = await prisma.envelope.findUnique({
      where: { id },
      include: { deposits: { orderBy: { date: 'asc' } } },
    });
    if (!sourceEnvelopeWithDeposits) {
      res.status(404).json({ ok: false, error: 'Sobre origen no encontrado' });
      return;
    }

    const available = getEnvelopeSavedAmount(sourceEnvelopeWithDeposits);
    const transferAmount = Number(parsed.data.amount.toFixed(2));
    if (transferAmount > available) {
      res.status(400).json({ ok: false, error: 'Saldo insuficiente en el sobre origen' });
      return;
    }

    const transferNote = (parsed.data.note || '').trim();

    const result = await prisma.$transaction(async (tx) => {
      const out = await tx.envelopeDeposit.create({
        data: {
          envelopeId: id,
          date: transferDate,
          amount: Number((transferAmount * -1).toFixed(2)),
          note: `TRANSFER_OUT:${targetEnvelope.id}:${transferNote}`,
        },
      });

      const incoming = await tx.envelopeDeposit.create({
        data: {
          envelopeId: targetEnvelope.id,
          date: transferDate,
          amount: transferAmount,
          note: `TRANSFER_IN:${id}:${transferNote}`,
        },
      });

      return { out, incoming };
    });

    res.status(201).json({ ok: true, movementOut: result.out, movementIn: result.incoming });
  } catch (error) {
    next(error);
  }
});

envelopesRouter.get('/envelopes/:id/movements', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { envelope, membership } = await getEnvelopeAndMembership({ userId: req.userId, envelopeId: id });
    if (!envelope || !envelope.active) {
      res.status(404).json({ ok: false, error: 'Sobre no encontrado' });
      return;
    }
    if (!membership) {
      res.status(403).json({ ok: false, error: 'No autorizado para ver movimientos de este sobre' });
      return;
    }

    const deposits = await prisma.envelopeDeposit.findMany({
      where: { envelopeId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const items = deposits.map((deposit) => {
      const movement = parseMovementFromDeposit(deposit);
      return {
        id: deposit.id,
        envelopeId: deposit.envelopeId,
        date: deposit.date,
        amount: deposit.amount,
        type: movement.type,
        note: movement.note,
        reason: movement.reason,
        createdAt: deposit.createdAt,
      };
    });

    res.status(200).json({ ok: true, items });
  } catch (error) {
    next(error);
  }
});

envelopesRouter.post('/envelopes/:id/pay', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = payEnvelopeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const { envelope, membership } = await getEnvelopeAndMembership({ userId: req.userId, envelopeId: id });
    if (!envelope || !envelope.active) {
      res.status(404).json({ ok: false, error: 'Sobre no encontrado' });
      return;
    }
    if (!membership || !ownerAdminRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para pagar este sobre' });
      return;
    }

    const location = await prisma.location.findUnique({
      where: { id: parsed.data.locationId },
      select: { id: true, businessId: true },
    });
    if (!location || location.businessId !== envelope.businessId) {
      res.status(400).json({ ok: false, error: 'locationId inválido para este negocio' });
      return;
    }

    const paymentDate = parsed.data.date ? parseDateOnly(parsed.data.date) : parseDateOnly(getMexicoTodayString());
    if (!paymentDate) {
      res.status(400).json({ ok: false, error: 'Fecha inválida' });
      return;
    }

    const amount = Number((parsed.data.amount || Number(envelope.targetAmount || 0)).toFixed(2));
    const fallbackCategory = await prisma.expenseCategory.upsert({
      where: {
        businessId_name: {
          businessId: envelope.businessId,
          name: 'Otros gastos',
        },
      },
      update: { kind: 'OPERATIVO' },
      create: {
        businessId: envelope.businessId,
        name: 'Otros gastos',
        kind: 'OPERATIVO',
      },
      select: { id: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          locationId: parsed.data.locationId,
          categoryId: envelope.categoryId || fallbackCategory.id,
          date: paymentDate,
          concept: `Pago: ${envelope.name}`,
          amount,
          method: parsed.data.method,
          source: 'MANUAL',
          counterpartyId: null,
          paidFromCash: false,
          createdById: req.userId,
        },
      });

      const updatedEnvelope = await tx.envelope.update({
        where: { id: envelope.id },
        data: {
          lastPaidAt: new Date(),
          ...(envelope.frequency === 'ONE_TIME' ? { active: false } : {}),
        },
      });

      return { expense, envelope: updatedEnvelope };
    });

    res.status(200).json({ ok: true, expense: result.expense, envelope: result.envelope });
  } catch (error) {
    next(error);
  }
});

envelopesRouter.delete('/envelopes/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { envelope, membership } = await getEnvelopeAndMembership({ userId: req.userId, envelopeId: id });
    if (!envelope) {
      res.status(404).json({ ok: false, error: 'Sobre no encontrado' });
      return;
    }
    if (!membership || !ownerAdminRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para eliminar este sobre' });
      return;
    }

    const depositsCount = await prisma.envelopeDeposit.count({ where: { envelopeId: id } });
    if (depositsCount > 0) {
      const updated = await prisma.envelope.update({
        where: { id },
        data: { active: false },
      });
      res.status(200).json({ ok: true, deleted: false, deactivated: true, envelope: updated });
      return;
    }

    await prisma.envelope.delete({ where: { id } });
    res.status(200).json({ ok: true, deleted: true, deactivated: false });
  } catch (error) {
    next(error);
  }
});

module.exports = { envelopesRouter };
