const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const payrollRouter = Router();

const managerRoles = ['OWNER', 'ADMIN', 'MANAGER'];
const ownerAdminRoles = ['OWNER', 'ADMIN'];

const createPeriodSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const putEntrySchema = z
  .object({
    overtimePay: z.coerce.number().nonnegative().optional(),
    bonuses: z.coerce.number().nonnegative().optional(),
    tips: z.coerce.number().nonnegative().optional(),
    deductions: z.coerce.number().nonnegative().optional(),
    notes: z.union([z.string().trim().min(1), z.null()]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo',
  });

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseDateOnly(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dateOnlyString(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function mxDayString(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function hoursBetween(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Number((ms / 3_600_000).toFixed(2));
}

async function getMembershipForPeriod({ userId, periodId }) {
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) return { period: null, membership: null };
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId: period.businessId } },
  });
  return { period, membership };
}

// Cálculo EN VIVO por empleado activo del negocio para un periodo DRAFT.
async function computeLiveRows(period) {
  const startStr = dateOnlyString(period.startDate);
  const endStr = dateOnlyString(period.endDate);

  const employees = await prisma.employee.findMany({
    where: { businessId: period.businessId, active: true },
    orderBy: [{ name: 'asc' }],
  });
  const employeeIds = employees.map((e) => e.id);

  // Ventana UTC holgada (MX = UTC-6); se recorta por día MX en JS.
  const gte = parseDateOnly(startStr);
  gte.setUTCDate(gte.getUTCDate() - 1);
  const lt = parseDateOnly(endStr);
  lt.setUTCDate(lt.getUTCDate() + 2);

  const records = employeeIds.length
    ? await prisma.attendanceRecord.findMany({
        where: { employeeId: { in: employeeIds }, clockIn: { gte, lt } },
        select: { employeeId: true, clockIn: true, clockOut: true },
      })
    : [];

  const savedEntries = await prisma.payrollEntry.findMany({ where: { periodId: period.id } });
  const savedByEmployee = new Map(savedEntries.map((e) => [e.employeeId, e]));

  const attByEmployee = new Map();
  for (const rec of records) {
    const day = mxDayString(rec.clockIn);
    if (day < startStr || day > endStr) continue;
    if (!attByEmployee.has(rec.employeeId)) attByEmployee.set(rec.employeeId, []);
    attByEmployee.get(rec.employeeId).push(rec);
  }

  const rows = employees.map((emp) => {
    const recs = attByEmployee.get(emp.id) || [];
    const days = new Set(recs.map((r) => mxDayString(r.clockIn)));
    const daysWorked = days.size;
    const hours = Number(recs.reduce((s, r) => s + hoursBetween(r.clockIn, r.clockOut), 0).toFixed(2));
    const dailyRate = emp.dailyRate != null ? Number(emp.dailyRate) : 0;
    const basePay = toMoney(daysWorked * dailyRate);
    const saved = savedByEmployee.get(emp.id);
    const overtimePay = saved ? Number(saved.overtimePay) : 0;
    const bonuses = saved ? Number(saved.bonuses) : 0;
    const tips = saved ? Number(saved.tips) : 0;
    const deductions = saved ? Number(saved.deductions) : 0;
    const total = toMoney(basePay + overtimePay + bonuses + tips - deductions);
    return {
      employeeId: emp.id,
      employee: { id: emp.id, name: emp.name, position: emp.position, locationId: emp.locationId, payType: emp.payType, dailyRate: dailyRate || null },
      daysWorked,
      regularHours: hours,
      basePay,
      overtimePay: toMoney(overtimePay),
      bonuses: toMoney(bonuses),
      tips: toMoney(tips),
      deductions: toMoney(deductions),
      total,
      notes: saved ? saved.notes : null,
    };
  });

  const periodTotal = toMoney(rows.reduce((s, r) => s + r.total, 0));
  return { rows, periodTotal, employees };
}

// Detalle de un periodo CLOSED: lee los entries congelados (no recalcula).
async function frozenRows(period) {
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId: period.id },
    include: { employee: { select: { id: true, name: true, position: true, locationId: true, payType: true, dailyRate: true } } },
    orderBy: { employee: { name: 'asc' } },
  });
  const rows = entries.map((e) => ({
    employeeId: e.employeeId,
    employee: { id: e.employee.id, name: e.employee.name, position: e.employee.position, locationId: e.employee.locationId, payType: e.employee.payType, dailyRate: e.employee.dailyRate != null ? Number(e.employee.dailyRate) : null },
    daysWorked: Number(e.daysWorked),
    regularHours: Number(e.regularHours),
    basePay: toMoney(e.basePay),
    overtimePay: toMoney(e.overtimePay),
    bonuses: toMoney(e.bonuses),
    tips: toMoney(e.tips),
    deductions: toMoney(e.deductions),
    total: toMoney(e.total),
    notes: e.notes,
  }));
  const periodTotal = toMoney(rows.reduce((s, r) => s + r.total, 0));
  return { rows, periodTotal };
}

function serializePeriod(period, extra = {}) {
  return {
    id: period.id,
    businessId: period.businessId,
    startDate: dateOnlyString(period.startDate),
    endDate: dateOnlyString(period.endDate),
    status: period.status,
    closedAt: period.closedAt,
    ...extra,
  };
}

// ============================================================
// 5. CREAR PERIODO
// ============================================================
payrollRouter.post(
  '/businesses/:businessId/payroll-periods',
  authMiddleware,
  requireRole((req) => req.params.businessId, ownerAdminRoles),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = createPeriodSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }
      const startDate = parseDateOnly(parsed.data.startDate);
      const endDate = parseDateOnly(parsed.data.endDate);
      if (endDate.getTime() < startDate.getTime()) {
        res.status(400).json({ ok: false, error: 'endDate no puede ser anterior a startDate' });
        return;
      }
      // Sin solapamiento: existe periodo con start <= nuevoEnd Y end >= nuevoStart.
      const overlap = await prisma.payrollPeriod.findFirst({
        where: { businessId, startDate: { lte: endDate }, endDate: { gte: startDate } },
      });
      if (overlap) {
        res.status(409).json({ ok: false, error: 'El periodo se solapa con otro existente', overlapId: overlap.id });
        return;
      }
      const period = await prisma.payrollPeriod.create({
        data: { businessId, startDate, endDate, status: 'DRAFT' },
      });
      res.status(201).json({ ok: true, period: serializePeriod(period) });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================
// 6. LISTAR PERIODOS
// ============================================================
payrollRouter.get(
  '/businesses/:businessId/payroll-periods',
  authMiddleware,
  requireRole((req) => req.params.businessId, []),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const periods = await prisma.payrollPeriod.findMany({
        where: { businessId },
        orderBy: { startDate: 'desc' },
      });
      const items = [];
      for (const period of periods) {
        const { periodTotal } = period.status === 'CLOSED' ? await frozenRows(period) : await computeLiveRows(period);
        items.push(serializePeriod(period, { total: periodTotal }));
      }
      res.status(200).json({ ok: true, items });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================
// 7. DETALLE (calculado en vivo si DRAFT, congelado si CLOSED)
// ============================================================
payrollRouter.get('/payroll-periods/:periodId', authMiddleware, async (req, res, next) => {
  try {
    const { periodId } = req.params;
    const { period, membership } = await getMembershipForPeriod({ userId: req.userId, periodId });
    if (!period) {
      res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
      return;
    }
    if (!membership) {
      res.status(403).json({ ok: false, error: 'No autorizado para ver este periodo' });
      return;
    }
    const { rows, periodTotal } = period.status === 'CLOSED' ? await frozenRows(period) : await computeLiveRows(period);
    res.status(200).json({ ok: true, period: serializePeriod(period, { total: periodTotal }), rows });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 8. GUARDAR CAMPOS MANUALES (upsert entry) — solo DRAFT
// ============================================================
payrollRouter.put('/payroll-periods/:periodId/entries/:employeeId', authMiddleware, async (req, res, next) => {
  try {
    const { periodId, employeeId } = req.params;
    const { period, membership } = await getMembershipForPeriod({ userId: req.userId, periodId });
    if (!period) {
      res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para editar nómina' });
      return;
    }
    if (period.status === 'CLOSED') {
      res.status(409).json({ ok: false, error: 'El periodo está cerrado; reábrelo para editar' });
      return;
    }
    const parsed = putEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, businessId: true } });
    if (!employee || employee.businessId !== period.businessId) {
      res.status(404).json({ ok: false, error: 'Empleado no encontrado para este negocio' });
      return;
    }
    const manual = {};
    if (parsed.data.overtimePay !== undefined) manual.overtimePay = toMoney(parsed.data.overtimePay);
    if (parsed.data.bonuses !== undefined) manual.bonuses = toMoney(parsed.data.bonuses);
    if (parsed.data.tips !== undefined) manual.tips = toMoney(parsed.data.tips);
    if (parsed.data.deductions !== undefined) manual.deductions = toMoney(parsed.data.deductions);
    if (parsed.data.notes !== undefined) manual.notes = parsed.data.notes;

    // basePay/total se congelan al cerrar; en DRAFT quedan en 0 como placeholder.
    const entry = await prisma.payrollEntry.upsert({
      where: { periodId_employeeId: { periodId, employeeId } },
      update: manual,
      create: { periodId, employeeId, basePay: 0, total: 0, ...manual },
    });
    res.status(200).json({ ok: true, entry });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 9a. CERRAR PERIODO — congela entries + crea Expense(s) de Sueldos por location
// ============================================================
payrollRouter.post('/payroll-periods/:periodId/close', authMiddleware, async (req, res, next) => {
  try {
    const { periodId } = req.params;
    const { period, membership } = await getMembershipForPeriod({ userId: req.userId, periodId });
    if (!period) {
      res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
      return;
    }
    if (!membership || !ownerAdminRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'Solo OWNER/ADMIN pueden cerrar la nómina' });
      return;
    }
    if (period.status === 'CLOSED') {
      res.status(409).json({ ok: false, error: 'El periodo ya está cerrado' });
      return;
    }

    const { rows, periodTotal } = await computeLiveRows(period);

    // Sucursal de respaldo para empleados sin locationId: la primera activa del negocio.
    const fallbackLocation = await prisma.location.findFirst({
      where: { businessId: period.businessId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    if (!fallbackLocation) {
      res.status(400).json({ ok: false, error: 'El negocio no tiene sucursales para registrar el gasto' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Categoría "Sueldos" (créala si no existe).
      const category = await tx.expenseCategory.upsert({
        where: { businessId_name: { businessId: period.businessId, name: 'Sueldos' } },
        update: {},
        create: { businessId: period.businessId, name: 'Sueldos', kind: 'OPERATIVO' },
      });

      // Congela cada entry con el cálculo final.
      for (const row of rows) {
        await tx.payrollEntry.upsert({
          where: { periodId_employeeId: { periodId, employeeId: row.employeeId } },
          update: {
            daysWorked: row.daysWorked,
            regularHours: row.regularHours,
            basePay: row.basePay,
            overtimePay: row.overtimePay,
            bonuses: row.bonuses,
            tips: row.tips,
            deductions: row.deductions,
            total: row.total,
            notes: row.notes,
          },
          create: {
            periodId,
            employeeId: row.employeeId,
            daysWorked: row.daysWorked,
            regularHours: row.regularHours,
            basePay: row.basePay,
            overtimePay: row.overtimePay,
            bonuses: row.bonuses,
            tips: row.tips,
            deductions: row.deductions,
            total: row.total,
            notes: row.notes,
          },
        });
      }

      // UN Expense por location con la suma de los totales de sus empleados.
      const totalByLocation = new Map();
      for (const row of rows) {
        const locId = row.employee.locationId || fallbackLocation.id;
        totalByLocation.set(locId, toMoney((totalByLocation.get(locId) || 0) + row.total));
      }
      const expenses = [];
      const endStr = dateOnlyString(period.endDate);
      const startStr = dateOnlyString(period.startDate);
      for (const [locationId, amount] of totalByLocation.entries()) {
        if (amount <= 0) continue;
        const expense = await tx.expense.create({
          data: {
            locationId,
            categoryId: category.id,
            date: period.endDate,
            concept: `Nómina ${startStr} – ${endStr}`,
            amount,
            method: 'OTRO',
            source: 'PAYROLL',
            payrollPeriodId: period.id,
            createdById: req.userId,
          },
        });
        expenses.push(expense);
      }

      const updated = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      return { updated, expenses };
    });

    res.status(200).json({
      ok: true,
      period: serializePeriod(result.updated, { total: periodTotal }),
      expenses: result.expenses,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 9b. REABRIR — vuelve a DRAFT y borra el/los Expense(s) ligado(s)
// ============================================================
payrollRouter.post('/payroll-periods/:periodId/reopen', authMiddleware, async (req, res, next) => {
  try {
    const { periodId } = req.params;
    const { period, membership } = await getMembershipForPeriod({ userId: req.userId, periodId });
    if (!period) {
      res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
      return;
    }
    if (!membership || membership.role !== 'OWNER') {
      res.status(403).json({ ok: false, error: 'Solo el OWNER puede reabrir la nómina' });
      return;
    }
    if (period.status !== 'CLOSED') {
      res.status(409).json({ ok: false, error: 'Solo se puede reabrir un periodo cerrado' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const del = await tx.expense.deleteMany({ where: { payrollPeriodId: period.id } });
      const updated = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: { status: 'DRAFT', closedAt: null },
      });
      return { updated, deletedExpenses: del.count };
    });

    res.status(200).json({
      ok: true,
      period: serializePeriod(result.updated),
      deletedExpenses: result.deletedExpenses,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { payrollRouter };
