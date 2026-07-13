const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const employeesRouter = Router();

const managerRoles = ['OWNER', 'ADMIN', 'MANAGER'];
const payTypes = ['DAILY', 'HOURLY', 'FIXED'];

const createEmployeeSchema = z.object({
  name: z.string().trim().min(1),
  position: z.string().trim().min(1),
  payType: z.enum(payTypes).optional(),
  dailyRate: z.coerce.number().nonnegative().optional(),
  hourlyRate: z.coerce.number().nonnegative().optional(),
  biometricId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});

const updateEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    position: z.string().trim().min(1).optional(),
    payType: z.enum(payTypes).optional(),
    dailyRate: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
    hourlyRate: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
    biometricId: z.union([z.string().trim().min(1), z.null()]).optional(),
    locationId: z.union([z.string().trim().min(1), z.null()]).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

const createAttendanceSchema = z.object({
  clockIn: z.string().trim().min(1),
  clockOut: z.string().trim().min(1).optional(),
  shiftId: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

const patchAttendanceSchema = z
  .object({
    clockIn: z.string().trim().min(1).optional(),
    clockOut: z.union([z.string().trim().min(1), z.null()]).optional(),
    shiftId: z.union([z.string().trim().min(1), z.null()]).optional(),
    notes: z.union([z.string().trim().min(1), z.null()]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

const importAttendanceSchema = z.object({
  offsetHours: z.coerce.number().optional(),
  rows: z
    .array(
      z.object({
        biometricId: z.string().trim().min(1),
        timestamp: z.string().trim().min(1),
      }),
    )
    .min(1),
});

const TARDINESS_MINUTES = 5; // hardcodeado por ahora (spec: configurable a futuro)

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

// Día local en America/Mexico_City como 'YYYY-MM-DD' (autoridad para agrupar).
function mxDayString(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function hoursBetween(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Number((ms / 3_600_000).toFixed(2));
}

async function getMembershipForLocation({ userId, locationId }) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, businessId: true, name: true },
  });
  if (!location) return { location: null, membership: null };
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId: location.businessId } },
  });
  return { location, membership };
}

async function getMembershipForEmployee({ userId, employeeId }) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return { employee: null, membership: null };
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId: employee.businessId } },
  });
  return { employee, membership };
}

async function getMembershipForAttendance({ userId, attendanceId }) {
  const attendance = await prisma.attendanceRecord.findUnique({
    where: { id: attendanceId },
    include: { employee: { select: { id: true, businessId: true } } },
  });
  if (!attendance) return { attendance: null, membership: null };
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId: attendance.employee.businessId } },
  });
  return { attendance, membership };
}

function serializeEmployee(employee) {
  return {
    id: employee.id,
    businessId: employee.businessId,
    locationId: employee.locationId,
    name: employee.name,
    position: employee.position,
    payType: employee.payType,
    dailyRate: employee.dailyRate != null ? toMoney(employee.dailyRate) : null,
    hourlyRate: employee.hourlyRate != null ? toMoney(employee.hourlyRate) : null,
    biometricId: employee.biometricId,
    active: employee.active,
    hiredAt: employee.hiredAt,
  };
}

// ============================================================
// CRUD EMPLEADOS
// ============================================================

employeesRouter.post(
  '/businesses/:businessId/employees',
  authMiddleware,
  requireRole((req) => req.params.businessId, managerRoles),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = createEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }
      if (parsed.data.locationId) {
        const location = await prisma.location.findUnique({
          where: { id: parsed.data.locationId },
          select: { id: true, businessId: true },
        });
        if (!location || location.businessId !== businessId) {
          res.status(400).json({ ok: false, error: 'Sucursal inválida para este negocio' });
          return;
        }
      }

      const employee = await prisma.employee.create({
        data: {
          businessId,
          name: parsed.data.name,
          position: parsed.data.position,
          payType: parsed.data.payType || 'DAILY',
          dailyRate: typeof parsed.data.dailyRate === 'number' ? toMoney(parsed.data.dailyRate) : null,
          hourlyRate: typeof parsed.data.hourlyRate === 'number' ? toMoney(parsed.data.hourlyRate) : null,
          biometricId: parsed.data.biometricId || null,
          locationId: parsed.data.locationId || null,
          active: parsed.data.active ?? true,
        },
      });
      res.status(201).json({ ok: true, employee: serializeEmployee(employee) });
    } catch (error) {
      next(error);
    }
  },
);

employeesRouter.get(
  '/businesses/:businessId/employees',
  authMiddleware,
  requireRole((req) => req.params.businessId, []),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const includeInactive = req.query.includeInactive === 'true';
      const employees = await prisma.employee.findMany({
        where: { businessId, ...(includeInactive ? {} : { active: true }) },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      });
      res.status(200).json({ ok: true, items: employees.map(serializeEmployee) });
    } catch (error) {
      next(error);
    }
  },
);

employeesRouter.patch(
  '/businesses/:businessId/employees/:employeeId',
  authMiddleware,
  requireRole((req) => req.params.businessId, managerRoles),
  async (req, res, next) => {
    try {
      const { businessId, employeeId } = req.params;
      const parsed = updateEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }
      const existing = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, businessId: true },
      });
      if (!existing || existing.businessId !== businessId) {
        res.status(404).json({ ok: false, error: 'Empleado no encontrado para este negocio' });
        return;
      }
      if (parsed.data.locationId) {
        const location = await prisma.location.findUnique({
          where: { id: parsed.data.locationId },
          select: { id: true, businessId: true },
        });
        if (!location || location.businessId !== businessId) {
          res.status(400).json({ ok: false, error: 'Sucursal inválida para este negocio' });
          return;
        }
      }

      const data = {};
      if (parsed.data.name !== undefined) data.name = parsed.data.name;
      if (parsed.data.position !== undefined) data.position = parsed.data.position;
      if (parsed.data.payType !== undefined) data.payType = parsed.data.payType;
      if (parsed.data.dailyRate !== undefined) data.dailyRate = parsed.data.dailyRate === null ? null : toMoney(parsed.data.dailyRate);
      if (parsed.data.hourlyRate !== undefined) data.hourlyRate = parsed.data.hourlyRate === null ? null : toMoney(parsed.data.hourlyRate);
      if (parsed.data.biometricId !== undefined) data.biometricId = parsed.data.biometricId;
      if (parsed.data.locationId !== undefined) data.locationId = parsed.data.locationId;
      if (parsed.data.active !== undefined) data.active = parsed.data.active;

      const employee = await prisma.employee.update({ where: { id: employeeId }, data });
      res.status(200).json({ ok: true, employee: serializeEmployee(employee) });
    } catch (error) {
      next(error);
    }
  },
);

employeesRouter.delete(
  '/businesses/:businessId/employees/:employeeId',
  authMiddleware,
  requireRole((req) => req.params.businessId, managerRoles),
  async (req, res, next) => {
    try {
      const { businessId, employeeId } = req.params;
      const existing = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, businessId: true, _count: { select: { attendance: true, payrollEntries: true } } },
      });
      if (!existing || existing.businessId !== businessId) {
        res.status(404).json({ ok: false, error: 'Empleado no encontrado para este negocio' });
        return;
      }
      const hasHistory = Boolean(existing._count.attendance + existing._count.payrollEntries);
      if (!hasHistory) {
        await prisma.employee.delete({ where: { id: employeeId } });
        res.status(200).json({ ok: true, deleted: true, deactivated: false, message: 'Empleado eliminado' });
        return;
      }
      await prisma.employee.update({ where: { id: employeeId }, data: { active: false } });
      res.status(200).json({
        ok: true,
        deleted: false,
        deactivated: true,
        message: 'Se desactivó porque tiene asistencia o nómina — conserva su historial',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================
// ASISTENCIA MANUAL
// ============================================================

employeesRouter.post('/employees/:employeeId/attendance', authMiddleware, async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { employee, membership } = await getMembershipForEmployee({ userId: req.userId, employeeId });
    if (!employee) {
      res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para registrar asistencia' });
      return;
    }
    const parsed = createAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const clockIn = parseDateTime(parsed.data.clockIn);
    if (!clockIn) {
      res.status(400).json({ ok: false, error: 'clockIn inválido' });
      return;
    }
    let clockOut = null;
    if (parsed.data.clockOut) {
      clockOut = parseDateTime(parsed.data.clockOut);
      if (!clockOut) {
        res.status(400).json({ ok: false, error: 'clockOut inválido' });
        return;
      }
      if (clockOut.getTime() <= clockIn.getTime()) {
        res.status(400).json({ ok: false, error: 'clockOut debe ser posterior a clockIn' });
        return;
      }
    }
    if (parsed.data.shiftId) {
      const shift = await prisma.shift.findUnique({ where: { id: parsed.data.shiftId }, select: { id: true, locationId: true } });
      if (!shift) {
        res.status(400).json({ ok: false, error: 'Turno inválido' });
        return;
      }
    }

    const record = await prisma.attendanceRecord.create({
      data: {
        employeeId,
        shiftId: parsed.data.shiftId || null,
        clockIn,
        clockOut,
        source: 'MANUAL',
        notes: parsed.data.notes || null,
      },
    });
    res.status(201).json({ ok: true, attendance: record });
  } catch (error) {
    next(error);
  }
});

employeesRouter.patch('/attendance/:attendanceId', authMiddleware, async (req, res, next) => {
  try {
    const { attendanceId } = req.params;
    const { attendance, membership } = await getMembershipForAttendance({ userId: req.userId, attendanceId });
    if (!attendance) {
      res.status(404).json({ ok: false, error: 'Registro de asistencia no encontrado' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para editar asistencia' });
      return;
    }
    const parsed = patchAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const nextClockIn = parsed.data.clockIn !== undefined ? parseDateTime(parsed.data.clockIn) : attendance.clockIn;
    if (parsed.data.clockIn !== undefined && !nextClockIn) {
      res.status(400).json({ ok: false, error: 'clockIn inválido' });
      return;
    }
    let nextClockOut = attendance.clockOut;
    if (parsed.data.clockOut !== undefined) {
      if (parsed.data.clockOut === null) {
        nextClockOut = null;
      } else {
        nextClockOut = parseDateTime(parsed.data.clockOut);
        if (!nextClockOut) {
          res.status(400).json({ ok: false, error: 'clockOut inválido' });
          return;
        }
      }
    }
    if (nextClockIn && nextClockOut && nextClockOut.getTime() <= nextClockIn.getTime()) {
      res.status(400).json({ ok: false, error: 'clockOut debe ser posterior a clockIn' });
      return;
    }

    const data = { adjusted: true };
    if (parsed.data.clockIn !== undefined) data.clockIn = nextClockIn;
    if (parsed.data.clockOut !== undefined) data.clockOut = nextClockOut;
    if (parsed.data.shiftId !== undefined) data.shiftId = parsed.data.shiftId;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

    const record = await prisma.attendanceRecord.update({ where: { id: attendanceId }, data });
    res.status(200).json({ ok: true, attendance: record });
  } catch (error) {
    next(error);
  }
});

employeesRouter.delete('/attendance/:attendanceId', authMiddleware, async (req, res, next) => {
  try {
    const { attendanceId } = req.params;
    const { attendance, membership } = await getMembershipForAttendance({ userId: req.userId, attendanceId });
    if (!attendance) {
      res.status(404).json({ ok: false, error: 'Registro de asistencia no encontrado' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para eliminar asistencia' });
      return;
    }
    await prisma.attendanceRecord.delete({ where: { id: attendanceId } });
    res.status(200).json({ ok: true, deleted: true });
  } catch (error) {
    next(error);
  }
});

// GET asistencia por location, agrupada por empleado y día MX
employeesRouter.get('/locations/:locationId/attendance', authMiddleware, async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { location, membership } = await getMembershipForLocation({ userId: req.userId, locationId });
    if (!location) {
      res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
      return;
    }
    if (!membership) {
      res.status(403).json({ ok: false, error: 'No autorizado para ver asistencia de esta sucursal' });
      return;
    }
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if ((from && !dateRe.test(from)) || (to && !dateRe.test(to))) {
      res.status(400).json({ ok: false, error: 'from/to deben ser YYYY-MM-DD' });
      return;
    }

    // Empleados de esta sucursal o sin sucursal asignada (aplican a todas).
    const employees = await prisma.employee.findMany({
      where: { businessId: location.businessId, OR: [{ locationId }, { locationId: null }] },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    const employeeIds = employees.map((e) => e.id);

    // Ventana UTC holgada (MX = UTC-6); se recorta con precisión por día MX en JS.
    const gte = from ? new Date(`${from}T00:00:00.000Z`) : undefined;
    if (gte) gte.setUTCDate(gte.getUTCDate() - 1);
    const lt = to ? new Date(`${to}T00:00:00.000Z`) : undefined;
    if (lt) lt.setUTCDate(lt.getUTCDate() + 2);

    const records = employeeIds.length
      ? await prisma.attendanceRecord.findMany({
          where: {
            employeeId: { in: employeeIds },
            ...(gte || lt ? { clockIn: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {}),
          },
          orderBy: { clockIn: 'asc' },
        })
      : [];

    const byEmployee = new Map(employees.map((e) => [e.id, { employee: serializeEmployee(e), days: {}, totals: { days: 0, hours: 0 } }]));
    for (const rec of records) {
      const day = mxDayString(rec.clockIn);
      if (from && day < from) continue;
      if (to && day > to) continue;
      const bucket = byEmployee.get(rec.employeeId);
      if (!bucket) continue;
      if (!bucket.days[day]) bucket.days[day] = [];
      bucket.days[day].push({
        id: rec.id,
        clockIn: rec.clockIn,
        clockOut: rec.clockOut,
        hours: hoursBetween(rec.clockIn, rec.clockOut),
        source: rec.source,
        adjusted: rec.adjusted,
        shiftId: rec.shiftId,
        notes: rec.notes,
      });
    }
    const items = [];
    for (const bucket of byEmployee.values()) {
      const dayKeys = Object.keys(bucket.days);
      bucket.totals.days = dayKeys.length;
      bucket.totals.hours = Number(
        dayKeys.reduce((sum, d) => sum + bucket.days[d].reduce((s, r) => s + r.hours, 0), 0).toFixed(2),
      );
      items.push(bucket);
    }
    res.status(200).json({ ok: true, locationId, from, to, tardinessMinutes: TARDINESS_MINUTES, items });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// IMPORT DEL CHECADOR
// ============================================================

employeesRouter.post('/locations/:locationId/attendance/import', authMiddleware, async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { location, membership } = await getMembershipForLocation({ userId: req.userId, locationId });
    if (!location) {
      res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para importar checadas' });
      return;
    }
    const parsed = importAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const offsetHours = parsed.data.offsetHours || 0;
    const offsetMs = offsetHours * 3_600_000;

    // Empleados del negocio con biometricId → map de matcheo.
    const employees = await prisma.employee.findMany({
      where: { businessId: location.businessId, biometricId: { not: null } },
      select: { id: true, biometricId: true },
    });
    const empByBiometric = new Map(employees.map((e) => [e.biometricId, e.id]));

    // Agrupa checadas válidas por empleado+día MX, aplicando offset.
    const groups = new Map(); // key `${employeeId}|${mxDay}` -> [Date...]
    const sinEmpleado = new Set();
    for (const row of parsed.data.rows) {
      const employeeId = empByBiometric.get(row.biometricId);
      if (!employeeId) {
        sinEmpleado.add(row.biometricId);
        continue;
      }
      const raw = parseDateTime(row.timestamp);
      if (!raw) continue; // timestamp basura → se ignora
      const adjusted = new Date(raw.getTime() + offsetMs);
      const key = `${employeeId}|${mxDayString(adjusted)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(adjusted);
    }

    // Emparejamiento greedy por grupo: [in, out, in, out, ...]; huérfana final = in sin out.
    const planned = []; // { employeeId, clockIn: Date, clockOut: Date|null }
    for (const [key, stamps] of groups.entries()) {
      const employeeId = key.split('|')[0];
      stamps.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 0; i < stamps.length; i += 2) {
        planned.push({ employeeId, clockIn: stamps[i], clockOut: stamps[i + 1] || null });
      }
    }

    // Idempotencia: mismo empleado + mismo clockIn exacto → skip.
    const involvedIds = [...new Set(planned.map((p) => p.employeeId))];
    const existing = involvedIds.length
      ? await prisma.attendanceRecord.findMany({
          where: { employeeId: { in: involvedIds }, clockIn: { in: planned.map((p) => p.clockIn) } },
          select: { employeeId: true, clockIn: true },
        })
      : [];
    const existingKeys = new Set(existing.map((r) => `${r.employeeId}|${new Date(r.clockIn).toISOString()}`));

    const toCreate = planned.filter((p) => !existingKeys.has(`${p.employeeId}|${p.clockIn.toISOString()}`));
    let creados = 0;
    if (toCreate.length) {
      const result = await prisma.attendanceRecord.createMany({
        data: toCreate.map((p) => ({
          employeeId: p.employeeId,
          clockIn: p.clockIn,
          clockOut: p.clockOut,
          source: 'BIOMETRIC',
        })),
      });
      creados = result.count;
    }
    const saltados = planned.length - creados;

    res.status(200).json({
      ok: true,
      creados,
      saltados,
      sinEmpleado: [...sinEmpleado],
      offsetHours,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { employeesRouter };
