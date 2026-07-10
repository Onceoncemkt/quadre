const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const moneyAccountsRouter = Router();
const ownerAdminRoles = ['OWNER', 'ADMIN'];

const createMoneyAccountSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(['BANK', 'CASH_VAULT', 'OTHER']).optional(),
  initialBalance: z.coerce.number().optional(),
});

const patchMoneyAccountSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    kind: z.enum(['BANK', 'CASH_VAULT', 'OTHER']).optional(),
    initialBalance: z.coerce.number().optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

const patchDefaultMoneyAccountSchema = z.object({
  moneyAccountId: z.union([z.string().trim().min(1), z.null()]).optional(),
});

function parseDateOnly(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getMexicoTodayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function getMonthBounds(dateString) {
  const [yearString, monthString] = dateString.slice(0, 7).split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  if (!year || !month) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function formatDdMm(date) {
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

moneyAccountsRouter.post(
  '/businesses/:businessId/money-accounts',
  authMiddleware,
  requireRole((req) => req.params.businessId, ownerAdminRoles),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = createMoneyAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const moneyAccount = await prisma.moneyAccount.create({
        data: {
          businessId,
          name: parsed.data.name,
          kind: parsed.data.kind || 'BANK',
          initialBalance: toMoney(parsed.data.initialBalance || 0),
        },
      });
      res.status(201).json({ ok: true, moneyAccount });
    } catch (error) {
      next(error);
    }
  },
);

moneyAccountsRouter.patch(
  '/businesses/:businessId/money-accounts/:moneyAccountId',
  authMiddleware,
  requireRole((req) => req.params.businessId, ownerAdminRoles),
  async (req, res, next) => {
    try {
      const { businessId, moneyAccountId } = req.params;
      const parsed = patchMoneyAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const existing = await prisma.moneyAccount.findUnique({
        where: { id: moneyAccountId },
        select: { id: true, businessId: true },
      });
      if (!existing || existing.businessId !== businessId) {
        res.status(404).json({ ok: false, error: 'Cuenta no encontrada para este negocio' });
        return;
      }

      const moneyAccount = await prisma.moneyAccount.update({
        where: { id: moneyAccountId },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
          ...(parsed.data.initialBalance !== undefined
            ? { initialBalance: toMoney(parsed.data.initialBalance) }
            : {}),
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        },
      });
      res.status(200).json({ ok: true, moneyAccount });
    } catch (error) {
      next(error);
    }
  },
);

moneyAccountsRouter.patch(
  '/businesses/:businessId/default-money-account',
  authMiddleware,
  requireRole((req) => req.params.businessId, ownerAdminRoles),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = patchDefaultMoneyAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const moneyAccountId = parsed.data.moneyAccountId || null;
      if (moneyAccountId) {
        const moneyAccount = await prisma.moneyAccount.findUnique({
          where: { id: moneyAccountId },
          select: { id: true, businessId: true, active: true },
        });
        if (!moneyAccount || moneyAccount.businessId !== businessId || !moneyAccount.active) {
          res.status(400).json({ ok: false, error: 'Cuenta inválida para este negocio' });
          return;
        }
      }

      const business = await prisma.business.update({
        where: { id: businessId },
        data: {
          defaultMoneyAccountId: moneyAccountId,
        },
        select: {
          id: true,
          defaultMoneyAccountId: true,
        },
      });

      res.status(200).json({ ok: true, business });
    } catch (error) {
      next(error);
    }
  },
);

moneyAccountsRouter.get(
  '/businesses/:businessId/money-accounts',
  authMiddleware,
  requireRole((req) => req.params.businessId),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const month = req.query.month ? String(req.query.month) : getMexicoTodayString().slice(0, 7);
      const monthBounds = getMonthBounds(`${month}-01`);

      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          defaultMoneyAccountId: true,
        },
      });
      if (!business) {
        res.status(404).json({ ok: false, error: 'Business no encontrado' });
        return;
      }

      const accounts = await prisma.moneyAccount.findMany({
        where: { businessId },
        orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      });

      const [salesLines, expenses, counterpartyPayments] = await Promise.all([
        prisma.closingLine.findMany({
          where: {
            method: { in: ['TARJETA', 'TRANSFERENCIA'] },
            closing: {
              shift: {
                location: {
                  businessId,
                },
              },
            },
          },
          include: {
            closing: {
              select: {
                closedAt: true,
                shift: {
                  select: {
                    date: true,
                  },
                },
              },
            },
          },
          orderBy: [{ closing: { shift: { date: 'desc' } } }, { id: 'desc' }],
        }),
        prisma.expense.findMany({
          where: {
            moneyAccountId: { not: null },
            method: { in: ['TARJETA', 'TRANSFERENCIA'] },
            location: { businessId },
          },
          select: {
            id: true,
            moneyAccountId: true,
            date: true,
            amount: true,
            concept: true,
            createdAt: true,
          },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        }),
        prisma.counterpartyPayment.findMany({
          where: {
            moneyAccountId: { not: null },
            method: { in: ['TARJETA', 'TRANSFERENCIA'] },
            counterparty: { businessId },
          },
          include: {
            counterparty: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        }),
      ]);

      const salesMovements = salesLines.map((line) => {
        const date = line.closing.shift.date;
        return {
          id: line.id,
          type: 'SALE_INFLOW',
          typeLabel: 'Entrada venta',
          concept: `Venta turno ${formatDdMm(date)}`,
          date,
          amount: toMoney(line.net),
          createdAt: line.closing.closedAt || date,
        };
      });

      const items = accounts.map((account) => {
        const entries = business.defaultMoneyAccountId === account.id ? salesMovements : [];
        const accountExpenses = expenses
          .filter((expense) => expense.moneyAccountId === account.id)
          .map((expense) => ({
            id: expense.id,
            type: 'EXPENSE_OUTFLOW',
            typeLabel: 'Salida gasto',
            concept: `Gasto: ${expense.concept}`,
            date: expense.date,
            amount: toMoney(expense.amount),
            createdAt: expense.createdAt,
          }));
        const accountSupplierPayments = counterpartyPayments
          .filter((payment) => payment.moneyAccountId === account.id)
          .map((payment) => ({
            id: payment.id,
            type: 'SUPPLIER_PAYMENT_OUTFLOW',
            typeLabel: 'Salida pago a proveedor',
            concept: `Pago a proveedor: ${payment.counterparty.name}`,
            date: payment.date,
            amount: toMoney(payment.amount),
            createdAt: payment.createdAt,
          }));

        const allMovements = [...entries, ...accountExpenses, ...accountSupplierPayments];
        const movements = (monthBounds
          ? allMovements.filter((movement) => {
              const date = new Date(movement.date);
              return date >= monthBounds.start && date < monthBounds.end;
            })
          : allMovements
        ).sort((a, b) => {
          const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        const entriesTotal = toMoney(entries.reduce((sum, entry) => sum + entry.amount, 0));
        const outflowsTotal = toMoney(
          accountExpenses.reduce((sum, movement) => sum + movement.amount, 0) +
            accountSupplierPayments.reduce((sum, movement) => sum + movement.amount, 0),
        );

        const monthEntries = monthBounds
          ? toMoney(
              entries.reduce((sum, entry) => {
                const date = new Date(entry.date);
                return date >= monthBounds.start && date < monthBounds.end ? sum + entry.amount : sum;
              }, 0),
            )
          : 0;
        const monthOutflows = monthBounds
          ? toMoney(
              [...accountExpenses, ...accountSupplierPayments].reduce((sum, movement) => {
                const date = new Date(movement.date);
                return date >= monthBounds.start && date < monthBounds.end ? sum + movement.amount : sum;
              }, 0),
            )
          : 0;

        return {
          id: account.id,
          businessId: account.businessId,
          name: account.name,
          kind: account.kind,
          initialBalance: toMoney(account.initialBalance),
          active: account.active,
          createdAt: account.createdAt,
          isDefault: business.defaultMoneyAccountId === account.id,
          entries: entriesTotal,
          outflows: outflowsTotal,
          balance: toMoney(Number(account.initialBalance || 0) + entriesTotal - outflowsTotal),
          monthEntries,
          monthOutflows,
          movements,
        };
      });

      res.status(200).json({
        ok: true,
        month,
        defaultMoneyAccountId: business.defaultMoneyAccountId,
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = { moneyAccountsRouter };
