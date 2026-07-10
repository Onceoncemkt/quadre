const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const payablesRouter = Router();
const ownerAdminRoles = ['OWNER', 'ADMIN'];

const createPurchaseSchema = z.object({
  counterpartyId: z.string().trim().min(1),
  kind: z.enum(['GOODS', 'SERVICE', 'LOAN']),
  reference: z.string().trim().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  total: z.coerce.number().positive(),
  notes: z.string().optional(),
  locationId: z.string().trim().min(1).optional(),
});

const createPurchasePaymentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().positive(),
  method: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'APP', 'OTRO']),
  moneyAccountId: z.string().trim().min(1).optional(),
  envelopeId: z.string().trim().min(1).optional(),
  evidenceUrl: z.string().url().optional(),
  notes: z.string().optional(),
  locationId: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1).optional(),
});

function parseDateOnly(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getMexicoTodayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getEnvelopeSavedAmount(envelope) {
  return Number(
    (envelope.deposits || [])
      .filter((deposit) => !envelope.lastPaidAt || deposit.date.getTime() > envelope.lastPaidAt.getTime())
      .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0)
      .toFixed(2),
  );
}

async function getPurchaseWithMembership({ userId, purchaseId }) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      counterparty: {
        select: {
          id: true,
          businessId: true,
          name: true,
          type: true,
        },
      },
    },
  });
  if (!purchase) return { purchase: null, membership: null };

  const membership = await prisma.membership.findUnique({
    where: {
      userId_businessId: {
        userId,
        businessId: purchase.counterparty.businessId,
      },
    },
  });

  return { purchase, membership };
}

payablesRouter.get(
  '/businesses/:businessId/payables',
  authMiddleware,
  requireRole((req) => req.params.businessId),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const today = parseDateOnly(getMexicoTodayString());
      const purchases = await prisma.purchase.findMany({
        where: {
          counterparty: {
            businessId,
            active: true,
          },
          status: {
            in: ['PENDING', 'PARTIAL'],
          },
        },
        include: {
          counterparty: {
            select: {
              id: true,
              name: true,
              type: true,
              phone: true,
              paymentTerms: true,
              notes: true,
              active: true,
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { date: 'desc' }],
      });


      const byCounterparty = new Map();
      let totalPorPagar = 0;
      let vencidos = 0;

      purchases.forEach((purchase) => {
        const saldo = toMoney(Number(purchase.total || 0) - Number(purchase.paidAmount || 0));
        if (saldo <= 0) return;

        const dueDate = purchase.dueDate ? new Date(purchase.dueDate) : null;
        if (dueDate && dueDate.getTime() < today.getTime()) {
          vencidos += saldo;
        }
        totalPorPagar += saldo;

        const existing = byCounterparty.get(purchase.counterpartyId) || {
          counterparty: {
            id: purchase.counterparty.id,
            name: purchase.counterparty.name,
            type: purchase.counterparty.type,
            phone: purchase.counterparty.phone,
            paymentTerms: purchase.counterparty.paymentTerms,
            notes: purchase.counterparty.notes,
          },
          saldo: 0,
          purchases: [],
        };

        existing.saldo = toMoney(existing.saldo + saldo);
        existing.purchases.push({
          id: purchase.id,
          createdById: purchase.createdById || null,
          kind: purchase.kind,
          reference: purchase.reference,
          date: purchase.date,
          dueDate: purchase.dueDate,
          total: purchase.total,
          paidAmount: purchase.paidAmount,
          status: purchase.status,
        });

        byCounterparty.set(purchase.counterpartyId, existing);
      });

      const createdByIds = [
        ...new Set(
          purchases
            .map((purchase) => purchase.createdById)
            .filter((userId) => typeof userId === 'string' && userId.length),
        ),
      ];
      const createdByUsers = createdByIds.length
        ? await prisma.user.findMany({
            where: { id: { in: createdByIds } },
            select: { id: true, name: true },
          })
        : [];
      const createdByMap = new Map(createdByUsers.map((user) => [user.id, user.name]));
      Array.from(byCounterparty.values()).forEach((item) => {
        item.purchases = item.purchases.map((purchase) => ({
          ...purchase,
          createdBy: purchase.createdById
            ? {
                id: purchase.createdById,
                name: createdByMap.get(purchase.createdById) || 'Usuario',
              }
            : null,
        }));
      });

      res.status(200).json({
        ok: true,
        items: Array.from(byCounterparty.values()),
        totalPorPagar: toMoney(totalPorPagar),
        vencidos: toMoney(vencidos),
      });
    } catch (error) {
      next(error);
    }
  },
);

payablesRouter.post(
  '/businesses/:businessId/purchases',
  authMiddleware,
  requireRole((req) => req.params.businessId),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = createPurchaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const date = parseDateOnly(parsed.data.date);
      const dueDate = parsed.data.dueDate ? parseDateOnly(parsed.data.dueDate) : null;
      if (!date || (parsed.data.dueDate && !dueDate)) {
        res.status(400).json({ ok: false, error: 'Fecha inválida' });
        return;
      }

      const counterparty = await prisma.counterparty.findUnique({
        where: { id: parsed.data.counterpartyId },
        select: { id: true, businessId: true, active: true },
      });
      if (!counterparty || counterparty.businessId !== businessId || !counterparty.active) {
        res.status(400).json({ ok: false, error: 'counterpartyId inválido para este negocio' });
        return;
      }

      if (parsed.data.locationId) {
        const location = await prisma.location.findUnique({
          where: { id: parsed.data.locationId },
          select: { id: true, businessId: true },
        });
        if (!location || location.businessId !== businessId) {
          res.status(400).json({ ok: false, error: 'locationId inválido para este negocio' });
          return;
        }
      }

      const purchase = await prisma.purchase.create({
        data: {
          counterpartyId: parsed.data.counterpartyId,
          locationId: parsed.data.locationId || null,
          createdById: req.userId,
          kind: parsed.data.kind,
          reference: parsed.data.reference?.trim() || null,
          date,
          dueDate,
          total: toMoney(parsed.data.total),
          paidAmount: 0,
          status: 'PENDING',
          notes: parsed.data.notes?.trim() || null,
        },
      });

      res.status(201).json({ ok: true, purchase });
    } catch (error) {
      next(error);
    }
  },
);

payablesRouter.post('/purchases/:id/payments', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = createPurchasePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const { purchase, membership } = await getPurchaseWithMembership({ userId: req.userId, purchaseId: id });
    if (!purchase) {
      res.status(404).json({ ok: false, error: 'Adeudo no encontrado' });
      return;
    }
    if (!membership) {
      res.status(403).json({ ok: false, error: 'No autorizado para registrar pagos' });
      return;
    }

    if (purchase.status === 'PAID' || purchase.status === 'CANCELLED') {
      res.status(409).json({ ok: false, error: 'Este adeudo ya no admite pagos' });
      return;
    }

    const paymentDate = parseDateOnly(parsed.data.date);
    if (!paymentDate) {
      res.status(400).json({ ok: false, error: 'Fecha inválida' });
      return;
    }

    const saldo = toMoney(Number(purchase.total || 0) - Number(purchase.paidAmount || 0));
    const amount = toMoney(parsed.data.amount);
    if (amount > saldo) {
      res.status(400).json({ ok: false, error: 'El monto excede el saldo del adeudo' });
      return;
    }

    const isMoneyMethod = parsed.data.method === 'TARJETA' || parsed.data.method === 'TRANSFERENCIA';
    if (parsed.data.moneyAccountId && !isMoneyMethod) {
      res.status(400).json({
        ok: false,
        error: 'moneyAccountId solo se permite cuando el método es TARJETA o TRANSFERENCIA',
      });
      return;
    }

    let moneyAccountId = null;
    if (isMoneyMethod && parsed.data.moneyAccountId) {
      const moneyAccount = await prisma.moneyAccount.findUnique({
        where: { id: parsed.data.moneyAccountId },
        select: { id: true, businessId: true, active: true },
      });
      if (!moneyAccount || moneyAccount.businessId !== purchase.counterparty.businessId || !moneyAccount.active) {
        res.status(400).json({ ok: false, error: 'Cuenta inválida para este negocio' });
        return;
      }
      moneyAccountId = moneyAccount.id;
    }

    let envelopeForWithdrawal = null;
    if (parsed.data.envelopeId) {
      if (parsed.data.method !== 'EFECTIVO') {
        res.status(400).json({
          ok: false,
          error: 'envelopeId solo se permite cuando el método es EFECTIVO',
        });
        return;
      }
      const envelope = await prisma.envelope.findUnique({
        where: { id: parsed.data.envelopeId },
        include: {
          deposits: { orderBy: { date: 'asc' } },
        },
      });
      if (!envelope || envelope.businessId !== purchase.counterparty.businessId || !envelope.active) {
        res.status(400).json({ ok: false, error: 'Sobre inválido para este negocio' });
        return;
      }
      const availableEnvelope = getEnvelopeSavedAmount(envelope);
      if (amount > availableEnvelope) {
        res.status(400).json({ ok: false, error: 'Saldo insuficiente en el sobre seleccionado' });
        return;
      }
      envelopeForWithdrawal = envelope;
    }

    let locationIdForExpense = null;
    let categoryIdForExpense = null;
    if (purchase.kind === 'LOAN') {
      locationIdForExpense = parsed.data.locationId || purchase.locationId || null;
      if (!locationIdForExpense) {
        res.status(400).json({ ok: false, error: 'locationId es obligatorio para registrar el gasto del préstamo' });
        return;
      }

      const location = await prisma.location.findUnique({
        where: { id: locationIdForExpense },
        select: { id: true, businessId: true },
      });
      if (!location || location.businessId !== purchase.counterparty.businessId) {
        res.status(400).json({ ok: false, error: 'locationId inválido para este negocio' });
        return;
      }

      if (parsed.data.categoryId) {
        const category = await prisma.expenseCategory.findUnique({
          where: { id: parsed.data.categoryId },
          select: { id: true, businessId: true },
        });
        if (!category || category.businessId !== purchase.counterparty.businessId) {
          res.status(400).json({ ok: false, error: 'categoryId inválido para este negocio' });
          return;
        }
        categoryIdForExpense = category.id;
      } else {
        const defaultCategory = await prisma.expenseCategory.upsert({
          where: {
            businessId_name: {
              businessId: purchase.counterparty.businessId,
              name: 'Otros gastos',
            },
          },
          update: { kind: 'OPERATIVO' },
          create: {
            businessId: purchase.counterparty.businessId,
            name: 'Otros gastos',
            kind: 'OPERATIVO',
          },
          select: { id: true },
        });
        categoryIdForExpense = defaultCategory.id;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.counterpartyPayment.create({
        data: {
          counterpartyId: purchase.counterpartyId,
          purchaseId: purchase.id,
          moneyAccountId,
          createdById: req.userId,
          date: paymentDate,
          amount,
          method: parsed.data.method,
          evidenceUrl: parsed.data.evidenceUrl?.trim() || null,
          notes: parsed.data.notes?.trim() || null,
        },
      });

      const nextPaidAmount = toMoney(Number(purchase.paidAmount || 0) + amount);
      const nextSaldo = toMoney(Number(purchase.total || 0) - nextPaidAmount);
      const nextStatus = nextSaldo <= 0 ? 'PAID' : 'PARTIAL';

      const updatedPurchase = await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          paidAmount: nextPaidAmount,
          status: nextStatus,
        },
      });

      let expense = null;
      if (purchase.kind === 'LOAN') {
        expense = await tx.expense.create({
          data: {
            locationId: locationIdForExpense,
            categoryId: categoryIdForExpense,
            counterpartyId: purchase.counterpartyId,
            date: paymentDate,
            concept: purchase.reference
              ? `Abono préstamo: ${purchase.reference}`
              : `Abono préstamo: ${purchase.counterparty.name}`,
            amount,
            method: parsed.data.method,
            moneyAccountId,
            source: 'LOAN_PAYMENT',
            paidFromCash: false,
            evidenceUrl: parsed.data.evidenceUrl?.trim() || null,
            createdById: req.userId,
          },
        });
      }

      let envelopeMovement = null;
      if (envelopeForWithdrawal) {
        const referenceLabel = (purchase.reference || '').trim() || purchase.id.slice(-6);
        const withdrawalNote = `Pago a ${purchase.counterparty.name} · adeudo #${referenceLabel}`;
        envelopeMovement = await tx.envelopeDeposit.create({
          data: {
            envelopeId: envelopeForWithdrawal.id,
            date: paymentDate,
            amount: Number((amount * -1).toFixed(2)),
            note: `WITHDRAW:${withdrawalNote}`,
          },
        });
      }

      return { payment, purchase: updatedPurchase, expense, envelopeMovement };
    });

    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

payablesRouter.get('/purchases/:id/payments', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { purchase, membership } = await getPurchaseWithMembership({ userId: req.userId, purchaseId: id });
    if (!purchase) {
      res.status(404).json({ ok: false, error: 'Adeudo no encontrado' });
      return;
    }
    if (!membership) {
      res.status(403).json({ ok: false, error: 'No autorizado para ver pagos de este adeudo' });
      return;
    }

    const items = await prisma.counterpartyPayment.findMany({
      where: { purchaseId: id },
      include: {
        moneyAccount: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    const createdByIds = [
      ...new Set(
        items
          .map((payment) => payment.createdById)
          .filter((userId) => typeof userId === 'string' && userId.length),
      ),
    ];
    const createdByUsers = createdByIds.length
      ? await prisma.user.findMany({
          where: { id: { in: createdByIds } },
          select: { id: true, name: true },
        })
      : [];
    const createdByMap = new Map(createdByUsers.map((user) => [user.id, user.name]));
    const itemsWithCreatedBy = items.map((payment) => ({
      ...payment,
      createdBy: payment.createdById
        ? {
            id: payment.createdById,
            name: createdByMap.get(payment.createdById) || 'Usuario',
          }
        : null,
    }));

    res.status(200).json({ ok: true, items: itemsWithCreatedBy });
  } catch (error) {
    next(error);
  }
});

module.exports = { payablesRouter };
