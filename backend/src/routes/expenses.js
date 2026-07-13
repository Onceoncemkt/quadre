const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { getLineAssignedMoneyAccountId, getAccountFeeFactor } = require('./moneyAccounts');

const expensesRouter = Router();

const ownerAdminRoles = ['OWNER', 'ADMIN'];
const managerRoles = ['OWNER', 'ADMIN', 'MANAGER'];
const categoryKinds = ['COSTO_VENTA', 'OPERATIVO', 'REMODELACION', 'FINANCIERO'];

const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(categoryKinds),
});

const createExpenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().trim().min(1),
  concept: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  method: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO']),
  counterpartyId: z.string().trim().min(1).optional(),
  moneyAccountId: z.string().trim().min(1).optional(),
  paidFromCash: z.boolean().optional(),
  notes: z.string().optional(),
});

function parseDateOnly(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}


function getMexicoTodayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function parseMonthString(monthString) {
  const valid = /^\d{4}-\d{2}$/.test(monthString);
  if (!valid) return null;
  const [year, month] = monthString.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
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

expensesRouter.get(
  '/businesses/:businessId/expense-categories',
  authMiddleware,
  requireRole((req) => req.params.businessId),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const items = await prisma.expenseCategory.findMany({
        where: { businessId },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      });
      res.status(200).json({ ok: true, items });
    } catch (error) {
      next(error);
    }
  },
);

expensesRouter.post(
  '/businesses/:businessId/expense-categories',
  authMiddleware,
  requireRole((req) => req.params.businessId, ownerAdminRoles),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = createExpenseCategorySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const category = await prisma.expenseCategory.create({
        data: {
          businessId,
          name: parsed.data.name,
          kind: parsed.data.kind,
        },
      });
      res.status(201).json({ ok: true, category });
    } catch (error) {
      if (error?.code === 'P2002') {
        res.status(409).json({ ok: false, error: 'Esa categoría ya existe en este negocio' });
        return;
      }
      next(error);
    }
  },
);

expensesRouter.post('/locations/:locationId/expenses', authMiddleware, async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const parsed = createExpenseSchema.safeParse(req.body);
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
      res.status(403).json({ ok: false, error: 'No autorizado para registrar gastos en esta sucursal' });
      return;
    }

    const expenseDate = parseDateOnly(parsed.data.date);
    if (!expenseDate) {
      res.status(400).json({ ok: false, error: 'Fecha inválida' });
      return;
    }

    const category = await prisma.expenseCategory.findUnique({
      where: { id: parsed.data.categoryId },
      select: { id: true, businessId: true, name: true, kind: true },
    });
    if (!category || category.businessId !== location.businessId) {
      res.status(400).json({ ok: false, error: 'Categoría inválida para este negocio' });
      return;
    }

    if (parsed.data.counterpartyId) {
      const counterparty = await prisma.counterparty.findUnique({
        where: { id: parsed.data.counterpartyId },
        select: { id: true, businessId: true },
      });
      if (!counterparty || counterparty.businessId !== location.businessId) {
        res.status(400).json({ ok: false, error: 'Proveedor inválido para este negocio' });
        return;
      }
    }

    const isMoneyMethod = parsed.data.method === 'TARJETA' || parsed.data.method === 'TRANSFERENCIA'
    if (parsed.data.moneyAccountId && !isMoneyMethod) {
      res
        .status(400)
        .json({ ok: false, error: 'moneyAccountId solo se permite cuando el método es TARJETA o TRANSFERENCIA' });
      return;
    }
    if (parsed.data.moneyAccountId) {
      const moneyAccount = await prisma.moneyAccount.findUnique({
        where: { id: parsed.data.moneyAccountId },
        select: { id: true, businessId: true, active: true },
      });
      if (!moneyAccount || moneyAccount.businessId !== location.businessId || !moneyAccount.active) {
        res.status(400).json({ ok: false, error: 'Cuenta inválida para este negocio' });
        return;
      }
    }

    const expense = await prisma.expense.create({
      data: {
        locationId,
        categoryId: parsed.data.categoryId,
        counterpartyId: parsed.data.counterpartyId || null,
        moneyAccountId: parsed.data.moneyAccountId || null,
        date: expenseDate,
        concept: parsed.data.concept,
        amount: Number(parsed.data.amount.toFixed(2)),
        method: parsed.data.method,
        paidFromCash: Boolean(parsed.data.paidFromCash),
        source: 'MANUAL',
        createdById: req.userId,
      },
      include: {
        category: true,
        counterparty: true,
        moneyAccount: true,
      },
    });

    res.status(201).json({ ok: true, expense });
  } catch (error) {
    next(error);
  }
});

expensesRouter.get('/locations/:locationId/expenses', authMiddleware, async (req, res, next) => {
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
      res.status(403).json({ ok: false, error: 'No autorizado para ver gastos en esta sucursal' });
      return;
    }

    const todayMexico = getMexicoTodayString();
    const monthStartDefault = parseDateOnly(`${todayMexico.slice(0, 7)}-01`);
    const monthEndDefault = parseDateOnly(todayMexico);
    const from = req.query.from ? parseDateOnly(String(req.query.from)) : monthStartDefault;
    const to = req.query.to ? parseDateOnly(String(req.query.to)) : monthEndDefault;
    if (!from || !to) {
      res.status(400).json({ ok: false, error: 'Parámetros from/to inválidos' });
      return;
    }
    if (to < from) {
      res.status(400).json({ ok: false, error: 'El rango de fechas es inválido' });
      return;
    }

    const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
    const items = await prisma.expense.findMany({
      where: {
        locationId,
        date: {
          gte: from,
          lte: to,
        },
        ...(categoryId ? { categoryId } : {}),
      },
      include: {
        category: true,
        counterparty: true,
        moneyAccount: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    res.status(200).json({ ok: true, items });
  } catch (error) {
    next(error);
  }
});

expensesRouter.delete('/expenses/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        location: {
          select: { businessId: true },
        },
      },
    });
    if (!expense) {
      res.status(404).json({ ok: false, error: 'Gasto no encontrado' });
      return;
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_businessId: {
          userId: req.userId,
          businessId: expense.location.businessId,
        },
      },
    });
    if (!membership || !ownerAdminRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para eliminar este gasto' });
      return;
    }

    if (expense.source !== 'MANUAL') {
      res
        .status(409)
        .json({ ok: false, error: 'Solo se pueden eliminar manualmente gastos de origen MANUAL' });
      return;
    }

    await prisma.expense.delete({ where: { id } });
    res.status(200).json({ ok: true, deleted: true });
  } catch (error) {
    next(error);
  }
});

expensesRouter.get('/locations/:locationId/pnl', authMiddleware, async (req, res, next) => {
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
      res.status(403).json({ ok: false, error: 'No autorizado para ver P&L en esta sucursal' });
      return;
    }

    const month = req.query.month ? String(req.query.month) : getMexicoTodayString().slice(0, 7);
    const monthBounds = parseMonthString(month);
    if (!monthBounds) {
      res.status(400).json({ ok: false, error: 'month inválido. Usa formato YYYY-MM' });
      return;
    }

    const [incomeAggregate, expenses] = await Promise.all([
      prisma.closingLine.aggregate({
        _sum: { net: true },
        where: {
          closing: {
            shift: {
              locationId,
              voidedAt: null,
              date: {
                gte: monthBounds.start,
                lt: monthBounds.end,
              },
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: {
          locationId,
          date: {
            gte: monthBounds.start,
            lt: monthBounds.end,
          },
        },
        include: {
          category: {
            select: { id: true, name: true, kind: true },
          },
        },
      }),
    ]);

    const ingresos = Number(Number(incomeAggregate._sum.net || 0).toFixed(2));
    let costoVenta = 0;
    let operativos = 0;
    let financieros = 0;
    const groupedByCategory = new Map();

    for (const expense of expenses) {
      const amount = Number(Number(expense.amount || 0).toFixed(2));
      if (expense.category.kind === 'COSTO_VENTA') costoVenta += amount;
      if (expense.category.kind === 'OPERATIVO') operativos += amount;
      if (expense.category.kind === 'FINANCIERO') financieros += amount;

      const previous = groupedByCategory.get(expense.category.id) || 0;
      groupedByCategory.set(expense.category.id, Number((previous + amount).toFixed(2)));
    }

    costoVenta = Number(costoVenta.toFixed(2));
    operativos = Number(operativos.toFixed(2));
    financieros = Number(financieros.toFixed(2));

    // Comisión bancaria de terminal: gasto financiero derivado de las ventas con tarjeta
    // (no es un Expense capturado; se calcula de las líneas × el factor de la cuenta destino).
    const [feeAccounts, feeChannelMaps, feeCardLines, feeBusiness] = await Promise.all([
      prisma.moneyAccount.findMany({ where: { businessId: location.businessId } }),
      prisma.channelAccountMap.findMany({ where: { businessId: location.businessId }, select: { channel: true, moneyAccountId: true } }),
      prisma.closingLine.findMany({
        where: { closing: { shift: { locationId, voidedAt: null, date: { gte: monthBounds.start, lt: monthBounds.end } } } },
        select: { channel: true, method: true, net: true },
      }),
      prisma.business.findUnique({ where: { id: location.businessId }, select: { defaultMoneyAccountId: true } }),
    ]);
    const feeChannelMap = new Map(feeChannelMaps.map((m) => [m.channel, m.moneyAccountId]));
    const feeAccountById = new Map(feeAccounts.map((a) => [a.id, a]));
    let comisionTerminal = 0;
    for (const line of feeCardLines) {
      const acctId = getLineAssignedMoneyAccountId({ line, channelMapByChannel: feeChannelMap, defaultMoneyAccountId: feeBusiness?.defaultMoneyAccountId });
      if (!acctId) continue;
      const factor = getAccountFeeFactor(feeAccountById.get(acctId) || {});
      if (factor > 0) comisionTerminal += Number(line.net || 0) * factor;
    }
    comisionTerminal = Number(comisionTerminal.toFixed(2));
    financieros = Number((financieros + comisionTerminal).toFixed(2));

    const utilidadBruta = Number((ingresos - costoVenta).toFixed(2));
    const utilidadOperativa = Number((utilidadBruta - operativos - financieros).toFixed(2));
    const margen = ingresos === 0 ? 0 : Number((utilidadOperativa / ingresos).toFixed(4));

    const desgloseCategorias = [...groupedByCategory.entries()]
      .map(([categoryId, total]) => {
        const category = expenses.find((expense) => expense.category.id === categoryId)?.category;
        return {
          categoria: category?.name || 'Sin categoría',
          kind: category?.kind || 'OPERATIVO',
          total: Number(total.toFixed(2)),
        };
      })
      .sort((a, b) => b.total - a.total);

    if (comisionTerminal > 0) {
      desgloseCategorias.push({ categoria: 'Comisión terminal', kind: 'FINANCIERO', total: comisionTerminal });
      desgloseCategorias.sort((a, b) => b.total - a.total);
    }

    res.status(200).json({
      ok: true,
      month,
      ingresos,
      costoVenta,
      operativos,
      financieros,
      comisionTerminal,
      utilidadBruta,
      utilidadOperativa,
      margen,
      desgloseCategorias,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { expensesRouter };
