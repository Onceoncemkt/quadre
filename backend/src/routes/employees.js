const { Router } = require('express');
const multer = require('multer');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { parseChecadorPdfBuffer } = require('../services/checadorPdfParser');

const employeesRouter = Router();

const managerRoles = ['OWNER', 'ADMIN', 'MANAGER'];
const payTypes = ['DAILY', 'HOURLY', 'FIXED'];
const employeeStatuses = ['ACTIVO', 'INACTIVO'];
const importInactivePolicies = ['IGNORE', 'REACTIVATE'];
const DEFAULT_IMPORTED_HOURLY_RATE = 0;
const DEFAULT_IMPORTED_POSITION = 'Por configurar';
const IMPORT_INACTIVE_POLICY_DEFAULT = 'IGNORE';

const createEmployeeSchema = z.object({
  name: z.string().trim().min(1),
  position: z.string().trim().min(1),
  payType: z.enum(payTypes).optional(),
  dailyRate: z.coerce.number().nonnegative().optional(),
  hourlyRate: z.coerce.number().nonnegative().optional(),
  biometricId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  hiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  active: z.boolean().optional(),
  status: z.enum(employeeStatuses).optional(),
  needsReview: z.boolean().optional(),
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
    hiredAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
    active: z.boolean().optional(),
    status: z.enum(employeeStatuses).optional(),
    fechaBaja: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
    needsReview: z.boolean().optional(),
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

const importAttendanceRowSchema = z
  .object({
    personId: z.string().trim().min(1).optional(),
    biometricId: z.string().trim().min(1).optional(),
    nombre: z.string().trim().optional(),
    timestamp: z.string().trim().min(1),
  })
  .refine((row) => Boolean(row.personId || row.biometricId), {
    message: 'Cada fila requiere personId o biometricId',
  });

const importAttendanceSchema = z.object({
  offsetHours: z.coerce.number().optional(),
  rows: z.array(importAttendanceRowSchema).min(1),
  inactivePolicy: z.enum(importInactivePolicies).optional(),
});

const TARDINESS_MINUTES = 6; // hardcodeado por ahora (spec: configurable a futuro)

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseDateOnlyToUtc(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeEmployeeStatus({ status, active }) {
  if (status === 'ACTIVO' || status === 'INACTIVO') return status;
  if (active === false) return 'INACTIVO';
  return 'ACTIVO';
}

function isEmployeeInactive(employee) {
  return normalizeEmployeeStatus({ status: employee.status, active: employee.active }) === 'INACTIVO';
}

function isEmployeeActive(employee) {
  return !isEmployeeInactive(employee);
}

function currentMxDateOnly() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

// Una checada entre 00:00 y 05:00 MX se trata como SALIDA (cierre de turno nocturno),
// nunca como entrada de un turno nuevo.
const MADRUGADA_CUTOFF_MIN = 5 * 60;

function mxClockMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(date));
  let hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

// Día local en America/Mexico_City como 'YYYY-MM-DD' (autoridad para agrupar).
function mxDayString(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}
function mxTimeString(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

function hoursBetween(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Number((ms / 3_600_000).toFixed(2));
}

const ALLOWED_IMPORT_MIMETYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/pdf',
]);

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const mimetype = String(file.mimetype || '').toLowerCase();
    const byMime = ALLOWED_IMPORT_MIMETYPES.has(mimetype) || mimetype.includes('pdf');
    const byExtension = /\.csv$/i.test(file.originalname || '') || /\.pdf$/i.test(file.originalname || '');
    if (byMime || byExtension) {
      callback(null, true);
      return;
    }
    callback(new Error('Archivo inválido. Solo se aceptan CSV o PDF.'));
  },
});

function importUploadSingle(req, res, next) {
  importUpload.single('file')(req, res, (error) => {
    if (error) {
      res.status(400).json({ ok: false, error: error.message || 'Archivo inválido para importación' });
      return;
    }
    next();
  });
}

function parseOffsetHours(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPdfUpload(file) {
  const mimetype = String(file?.mimetype || '').toLowerCase().trim();
  const originalname = String(file?.originalname || '').toLowerCase().trim();
  return mimetype.includes('pdf') || /\.pdf$/i.test(originalname);
}

function parseInactivePolicy(value) {
  if (value === undefined || value === null || value === '') return IMPORT_INACTIVE_POLICY_DEFAULT;
  const normalized = String(value).toUpperCase().trim();
  if (!importInactivePolicies.includes(normalized)) return null;
  return normalized;
}

function normalizeImportRows(rows) {
  return rows
    .map((row) => ({
      personId: String(row.personId || row.biometricId || '')
        .trim(),
      nombre: String(row.nombre || '')
        .replace(/\s+/g, ' ')
        .trim(),
      timestamp: String(row.timestamp || '').trim(),
    }))
    .filter((row) => row.personId && row.timestamp);
}

function parseChecadorCsvBuffer(buffer) {
  const text = String(buffer.toString('utf8') || '').replace(/^\uFEFF/, '');
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    throw new Error('El archivo está vacío');
  }
  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const cells = lines.map((line) => line.split(delimiter).map((value) => value.trim().replace(/^"|"$/g, '')));
  const header = cells[0].map((cell) => cell.toLowerCase());
  let idIndex = header.findIndex((value) => /person\s*id|id|biomet|emplead|user|clave/.test(value));
  let timestampIndex = header.findIndex((value) => /time|fecha|hora|stamp|date|check/.test(value));
  let nameIndex = header.findIndex((value) => /name|nombre/.test(value));
  let dataRows = cells.slice(1);
  if (idIndex === -1 || timestampIndex === -1) {
    idIndex = 0;
    timestampIndex = 1;
    nameIndex = cells[0].length > 2 ? 2 : -1;
    dataRows = cells;
  }
  const rows = dataRows.map((row) => ({
    personId: row[idIndex],
    nombre: nameIndex >= 0 ? row[nameIndex] || '' : '',
    timestamp: row[timestampIndex],
  }));
  const normalized = normalizeImportRows(rows);
  if (!normalized.length) {
    throw new Error('No se detectaron filas con personId y timestamp');
  }
  return normalized;
}

async function resolveImportPayload(req) {
  const offsetHours = parseOffsetHours(req.body?.offsetHours);
  if (offsetHours === null) {
    return { ok: false, status: 400, error: 'offsetHours inválido' };
  }
  const inactivePolicy = parseInactivePolicy(req.body?.inactivePolicy);
  if (!inactivePolicy) {
    return { ok: false, status: 400, error: 'inactivePolicy inválido' };
  }
  if (req.file) {
    try {
      const fileRows = isPdfUpload(req.file)
        ? await parseChecadorPdfBuffer(req.file.buffer)
        : parseChecadorCsvBuffer(req.file.buffer);
      const normalizedRows = normalizeImportRows(fileRows);
      if (!normalizedRows.length) {
        return { ok: false, status: 400, error: 'No se detectaron filas válidas en el archivo' };
      }
      return { ok: true, rows: normalizedRows, offsetHours, inactivePolicy };
    } catch (error) {
      return { ok: false, status: 400, error: error instanceof Error ? error.message : 'No se pudo parsear el archivo' };
    }
  }
  const parsed = importAttendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'Payload inválido', details: parsed.error.flatten() };
  }
  return {
    ok: true,
    rows: normalizeImportRows(parsed.data.rows),
    offsetHours: parsed.data.offsetHours || 0,
    inactivePolicy: parseInactivePolicy(parsed.data.inactivePolicy) || IMPORT_INACTIVE_POLICY_DEFAULT,
  };
}

function nameFromImportRow(row) {
  const normalized = String(row?.nombre || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized) return normalized;
  return `Empleado ${row.personId}`;
}

function buildNameByPersonId(rows) {
  const names = new Map();
  rows.forEach((row) => {
    if (!names.has(row.personId)) names.set(row.personId, nameFromImportRow(row));
  });
  return names;
}

async function prepareEmployeesForImport({ businessId, locationId, rows, inactivePolicy, applyMutations }) {
  const personIds = [...new Set(rows.map((row) => row.personId).filter(Boolean))];
  if (!personIds.length) {
    return {
      employeeByPersonId: new Map(),
      newPersonIds: new Set(),
      inactivePersonIds: new Set(),
      createdCount: 0,
      reactivatedCount: 0,
    };
  }
  const existingEmployees = await prisma.employee.findMany({
    where: { businessId, biometricId: { in: personIds } },
    select: { id: true, name: true, biometricId: true, status: true, active: true, needsReview: true },
    orderBy: [{ createdAt: 'asc' }],
  });
  const existingByPersonId = new Map();
  existingEmployees.forEach((employee) => {
    if (!employee.biometricId) return;
    if (!existingByPersonId.has(employee.biometricId)) existingByPersonId.set(employee.biometricId, employee);
  });

  const newPersonIds = new Set(personIds.filter((personId) => !existingByPersonId.has(personId)));
  let createdCount = 0;
  if (applyMutations && newPersonIds.size) {
    const namesByPersonId = buildNameByPersonId(rows);
    await prisma.employee.createMany({
      data: [...newPersonIds].map((personId) => ({
        businessId,
        locationId,
        name: namesByPersonId.get(personId) || `Empleado ${personId}`,
        position: DEFAULT_IMPORTED_POSITION,
        payType: 'HOURLY',
        hourlyRate: toMoney(DEFAULT_IMPORTED_HOURLY_RATE),
        biometricId: personId,
        status: 'ACTIVO',
        active: true,
        needsReview: true,
      })),
    });
    createdCount = newPersonIds.size;
  }

  let currentEmployees = existingEmployees;
  if (applyMutations && newPersonIds.size) {
    currentEmployees = await prisma.employee.findMany({
      where: { businessId, biometricId: { in: personIds } },
      select: { id: true, name: true, biometricId: true, status: true, active: true, needsReview: true },
      orderBy: [{ createdAt: 'asc' }],
    });
  }
  const byPersonId = new Map();
  currentEmployees.forEach((employee) => {
    if (!employee.biometricId) return;
    if (!byPersonId.has(employee.biometricId)) byPersonId.set(employee.biometricId, employee);
  });

  const inactiveBefore = [...byPersonId.entries()]
    .filter(([, employee]) => isEmployeeInactive(employee))
    .map(([personId]) => personId);
  let reactivatedCount = 0;
  if (applyMutations && inactivePolicy === 'REACTIVATE' && inactiveBefore.length) {
    await prisma.employee.updateMany({
      where: { businessId, biometricId: { in: inactiveBefore } },
      data: { status: 'ACTIVO', active: true, fechaBaja: null },
    });
    reactivatedCount = inactiveBefore.length;
    const refreshed = await prisma.employee.findMany({
      where: { businessId, biometricId: { in: personIds } },
      select: { id: true, name: true, biometricId: true, status: true, active: true, needsReview: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    byPersonId.clear();
    refreshed.forEach((employee) => {
      if (!employee.biometricId) return;
      if (!byPersonId.has(employee.biometricId)) byPersonId.set(employee.biometricId, employee);
    });
  }

  const inactivePersonIds = new Set(
    [...byPersonId.entries()].filter(([, employee]) => isEmployeeInactive(employee)).map(([personId]) => personId),
  );
  return {
    employeeByPersonId: byPersonId,
    newPersonIds,
    inactivePersonIds,
    createdCount,
    reactivatedCount,
  };
}

function buildImportPreview({ rows, employeeByPersonId, newPersonIds, inactivePersonIds, offsetMs }) {
  const previewRows = [];
  const countByPersonId = new Map();
  const inactiveWarnings = new Set();
  for (const row of rows) {
    const raw = parseDateTime(row.timestamp);
    if (!raw) continue;
    const adjusted = new Date(raw.getTime() + offsetMs);
    const employee = employeeByPersonId.get(row.personId) || null;
    const isNewEmployee = newPersonIds.has(row.personId);
    const isInactiveEmployee = inactivePersonIds.has(row.personId);
    const empleado = employee ? employee.name : nameFromImportRow(row);
    if (isInactiveEmployee) inactiveWarnings.add(empleado);
    previewRows.push({
      personId: row.personId,
      nombre: row.nombre || '',
      timestamp: adjusted.toISOString(),
      empleado,
      fecha: mxDayString(adjusted),
      hora: mxTimeString(adjusted),
      isNewEmployee,
      isInactiveEmployee,
      warning: isInactiveEmployee ? 'checadas de empleado dado de baja' : null,
      needsReview: Boolean(employee?.needsReview || isNewEmployee),
      employeeId: employee ? employee.id : null,
    });
    const current = countByPersonId.get(row.personId) || {
      personId: row.personId,
      empleado,
      count: 0,
      isNewEmployee,
      isInactiveEmployee,
    };
    current.count += 1;
    current.isNewEmployee = current.isNewEmployee || isNewEmployee;
    current.isInactiveEmployee = current.isInactiveEmployee || isInactiveEmployee;
    countByPersonId.set(row.personId, current);
  }
  const countsByEmployee = [...countByPersonId.values()].sort((a, b) => a.empleado.localeCompare(b.empleado));
  const warnings = [...inactiveWarnings].map((name) => `checadas de empleado dado de baja: ${name}`);
  return { previewRows, countsByEmployee, warnings };
}

function collectEmployeeStamps({ rows, employeeByPersonId, offsetMs, inactivePolicy }) {
  const stampsByEmployee = new Map(); // employeeId -> [Date...]
  const sinEmpleado = new Set();
  const ignoredInactive = new Set();
  let ignoredInactiveRows = 0;
  for (const row of rows) {
    const raw = parseDateTime(row.timestamp);
    if (!raw) continue;
    const employee = employeeByPersonId.get(row.personId) || null;
    if (!employee) {
      sinEmpleado.add(row.personId);
      continue;
    }
    if (isEmployeeInactive(employee) && inactivePolicy === 'IGNORE') {
      ignoredInactive.add(row.personId);
      ignoredInactiveRows += 1;
      continue;
    }
    const adjusted = new Date(raw.getTime() + offsetMs);
    if (!stampsByEmployee.has(employee.id)) stampsByEmployee.set(employee.id, []);
    stampsByEmployee.get(employee.id).push(adjusted);
  }
  return { stampsByEmployee, sinEmpleado, ignoredInactive, ignoredInactiveRows };
}

function buildAttendancePlan(stampsByEmployee) {
  const planned = []; // { employeeId, clockIn: Date, clockOut: Date|null }
  for (const [employeeId, stamps] of stampsByEmployee.entries()) {
    stamps.sort((a, b) => a.getTime() - b.getTime());
    const byDay = new Map();
    for (const stamp of stamps) {
      const day = mxDayString(stamp);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(stamp);
    }
    let carryOrphanIn = null;
    for (const day of [...byDay.keys()].sort()) {
      const dayStamps = byDay.get(day);
      let idx = 0;
      if (carryOrphanIn !== null) {
        if (dayStamps.length && mxClockMinutes(dayStamps[0]) <= MADRUGADA_CUTOFF_MIN) {
          planned.push({ employeeId, clockIn: carryOrphanIn, clockOut: dayStamps[0] });
          idx = 1;
        } else {
          planned.push({ employeeId, clockIn: carryOrphanIn, clockOut: null });
        }
        carryOrphanIn = null;
      }
      while (idx < dayStamps.length && mxClockMinutes(dayStamps[idx]) <= MADRUGADA_CUTOFF_MIN) idx += 1;
      const rest = dayStamps.slice(idx);
      for (let i = 0; i < rest.length; i += 2) {
        if (i + 1 < rest.length) planned.push({ employeeId, clockIn: rest[i], clockOut: rest[i + 1] });
        else carryOrphanIn = rest[i];
      }
    }
    if (carryOrphanIn !== null) planned.push({ employeeId, clockIn: carryOrphanIn, clockOut: null });
  }
  return planned;
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
  const status = normalizeEmployeeStatus({ status: employee.status, active: employee.active });
  return {
    id: employee.id,
    businessId: employee.businessId,
    locationId: employee.locationId,
    name: employee.name,
    position: employee.position,
    status,
    fechaBaja: employee.fechaBaja ? mxDayString(employee.fechaBaja) : null,
    payType: employee.payType,
    dailyRate: employee.dailyRate != null ? toMoney(employee.dailyRate) : null,
    hourlyRate: employee.hourlyRate != null ? toMoney(employee.hourlyRate) : null,
    needsReview: Boolean(employee.needsReview),
    biometricId: employee.biometricId,
    active: status === 'ACTIVO',
    hiredAt: employee.hiredAt ? new Date(employee.hiredAt).toISOString().slice(0, 10) : null,
    schedule: (employee.schedules || [])
      .map((entry) => ({ weekday: entry.weekday, startTime: entry.startTime }))
      .sort((a, b) => a.weekday - b.weekday),
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
          status: normalizeEmployeeStatus({ status: parsed.data.status, active: parsed.data.active }),
          fechaBaja: normalizeEmployeeStatus({ status: parsed.data.status, active: parsed.data.active }) === 'INACTIVO' ? parseDateOnlyToUtc(currentMxDateOnly()) : null,
          payType: parsed.data.payType || 'DAILY',
          dailyRate: typeof parsed.data.dailyRate === 'number' ? toMoney(parsed.data.dailyRate) : null,
          hourlyRate: typeof parsed.data.hourlyRate === 'number' ? toMoney(parsed.data.hourlyRate) : null,
          needsReview: Boolean(parsed.data.needsReview),
          biometricId: parsed.data.biometricId || null,
          locationId: parsed.data.locationId || null,
          hiredAt: parsed.data.hiredAt ? new Date(`${parsed.data.hiredAt}T00:00:00.000Z`) : null,
          active: normalizeEmployeeStatus({ status: parsed.data.status, active: parsed.data.active }) === 'ACTIVO',
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
        where: { businessId, ...(includeInactive ? {} : { status: 'ACTIVO', active: true }) },
        include: { schedules: true },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
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
      const statusFromPayload = parsed.data.status !== undefined
        ? parsed.data.status
        : parsed.data.active !== undefined
          ? (parsed.data.active ? 'ACTIVO' : 'INACTIVO')
          : undefined;
      if (parsed.data.name !== undefined) data.name = parsed.data.name;
      if (parsed.data.position !== undefined) data.position = parsed.data.position;
      if (parsed.data.payType !== undefined) data.payType = parsed.data.payType;
      if (parsed.data.dailyRate !== undefined) data.dailyRate = parsed.data.dailyRate === null ? null : toMoney(parsed.data.dailyRate);
      if (parsed.data.hourlyRate !== undefined) data.hourlyRate = parsed.data.hourlyRate === null ? null : toMoney(parsed.data.hourlyRate);
      if (parsed.data.biometricId !== undefined) data.biometricId = parsed.data.biometricId;
      if (parsed.data.locationId !== undefined) data.locationId = parsed.data.locationId;
      if (parsed.data.hiredAt !== undefined) data.hiredAt = parsed.data.hiredAt ? new Date(`${parsed.data.hiredAt}T00:00:00.000Z`) : null;
      if (statusFromPayload !== undefined) {
        data.status = statusFromPayload;
        data.active = statusFromPayload === 'ACTIVO';
        data.fechaBaja = statusFromPayload === 'INACTIVO'
          ? (parsed.data.fechaBaja ? parseDateOnlyToUtc(parsed.data.fechaBaja) : parseDateOnlyToUtc(currentMxDateOnly()))
          : null;
      } else if (parsed.data.fechaBaja !== undefined) {
        data.fechaBaja = parsed.data.fechaBaja ? parseDateOnlyToUtc(parsed.data.fechaBaja) : null;
      }
      if (parsed.data.needsReview !== undefined) data.needsReview = parsed.data.needsReview;
      if (parsed.data.hourlyRate !== undefined && parsed.data.hourlyRate !== null && Number(parsed.data.hourlyRate) > 0) data.needsReview = false;
      if (parsed.data.dailyRate !== undefined && parsed.data.dailyRate !== null && Number(parsed.data.dailyRate) > 0) data.needsReview = false;

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
        select: { id: true, businessId: true, status: true, active: true },
      });
      if (!existing || existing.businessId !== businessId) {
        res.status(404).json({ ok: false, error: 'Empleado no encontrado para este negocio' });
        return;
      }
      if (isEmployeeInactive(existing)) {
        res.status(200).json({ ok: true, deleted: false, deactivated: true, message: 'El empleado ya estaba dado de baja' });
        return;
      }
      const fechaBaja = parseDateOnlyToUtc(currentMxDateOnly()) || new Date();
      await prisma.employee.update({
        where: { id: employeeId },
        data: { status: 'INACTIVO', active: false, fechaBaja },
      });
      res.status(200).json({
        ok: true,
        deleted: false,
        deactivated: true,
        message: 'Empleado dado de baja (conserva historial)',
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
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
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
employeesRouter.post('/locations/:locationId/attendance/import/preview', authMiddleware, importUploadSingle, async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { location, membership } = await getMembershipForLocation({ userId: req.userId, locationId });
    if (!location) {
      res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para previsualizar checadas' });
      return;
    }
    const payload = await resolveImportPayload(req);
    if (!payload.ok) {
      res.status(payload.status || 400).json({ ok: false, error: payload.error, ...(payload.details ? { details: payload.details } : {}) });
      return;
    }
    const { rows, offsetHours, inactivePolicy } = payload;
    const offsetMs = offsetHours * 3_600_000;
    const importContext = await prepareEmployeesForImport({
      businessId: location.businessId,
      locationId: location.id,
      rows,
      inactivePolicy,
      applyMutations: false,
    });
    const { previewRows, countsByEmployee, warnings } = buildImportPreview({
      rows,
      employeeByPersonId: importContext.employeeByPersonId,
      newPersonIds: importContext.newPersonIds,
      inactivePersonIds: importContext.inactivePersonIds,
      offsetMs,
    });
    if (!previewRows.length) {
      res.status(400).json({ ok: false, error: 'No se detectaron timestamps válidos para previsualizar' });
      return;
    }
    previewRows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    res.status(200).json({
      ok: true,
      offsetHours,
      inactivePolicy,
      rows,
      previewRows: previewRows.map(({ employeeId, ...row }) => row),
      countsByEmployee,
      sinEmpleado: [],
      warnings,
      nuevos: [...importContext.newPersonIds],
      inactivos: [...importContext.inactivePersonIds],
    });
  } catch (error) {
    next(error);
  }
});

employeesRouter.post('/locations/:locationId/attendance/import', authMiddleware, importUploadSingle, async (req, res, next) => {
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
    const payload = await resolveImportPayload(req);
    if (!payload.ok) {
      res.status(payload.status || 400).json({ ok: false, error: payload.error, ...(payload.details ? { details: payload.details } : {}) });
      return;
    }
    const { rows, offsetHours, inactivePolicy } = payload;
    const offsetMs = offsetHours * 3_600_000;
    const importContext = await prepareEmployeesForImport({
      businessId: location.businessId,
      locationId: location.id,
      rows,
      inactivePolicy,
      applyMutations: true,
    });
    const { stampsByEmployee, sinEmpleado, ignoredInactive, ignoredInactiveRows } = collectEmployeeStamps({
      rows,
      employeeByPersonId: importContext.employeeByPersonId,
      offsetMs,
      inactivePolicy,
    });
    if (!stampsByEmployee.size && !ignoredInactiveRows) {
      res.status(400).json({ ok: false, error: 'No se detectaron timestamps válidos para importar' });
      return;
    }

    // Emparejamiento greedy ACOTADO POR DÍA (un punzado faltante solo afecta ese día).
    // Si un día cierra con entrada huérfana, una checada entre 00:00 y 05:00 del día
    // siguiente se usa como salida de ese turno nocturno.
    const planned = buildAttendancePlan(stampsByEmployee);

    // Idempotencia: mismo empleado + mismo clockIn exacto → skip.
    const involvedIds = [...new Set(planned.map((p) => p.employeeId))];
    const existing = involvedIds.length
      ? await prisma.attendanceRecord.findMany({
          where: { employeeId: { in: involvedIds }, clockIn: { in: planned.map((p) => p.clockIn) } },
          select: { employeeId: true, clockIn: true },
        })
      : [];
    const existingKeys = new Set(existing.map((record) => `${record.employeeId}|${new Date(record.clockIn).toISOString()}`));

    const toCreate = planned.filter((plan) => !existingKeys.has(`${plan.employeeId}|${plan.clockIn.toISOString()}`));
    let creados = 0;
    if (toCreate.length) {
      const result = await prisma.attendanceRecord.createMany({
        data: toCreate.map((plan) => ({
          employeeId: plan.employeeId,
          clockIn: plan.clockIn,
          clockOut: plan.clockOut,
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
      inactivePolicy,
      nuevosCreados: importContext.createdCount,
      reactivados: importContext.reactivatedCount,
      ignoradosInactivos: [...ignoredInactive],
      filasIgnoradasInactivos: ignoredInactiveRows,
      warnings: [...ignoredInactive].map((personId) => {
        const employee = importContext.employeeByPersonId.get(personId);
        return `checadas ignoradas de empleado dado de baja: ${employee ? employee.name : personId}`;
      }),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// HORARIO SEMANAL (hora pactada de entrada por día)
// ============================================================

const scheduleSchema = z.object({
  schedule: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(0).max(6),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
    )
    .max(7),
});

employeesRouter.put('/employees/:employeeId/schedule', authMiddleware, async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { employee, membership } = await getMembershipForEmployee({ userId: req.userId, employeeId });
    if (!employee) {
      res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
      return;
    }
    if (!membership || !managerRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: 'No autorizado para editar el horario' });
      return;
    }
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    // Upsert completo: un weekday sin entrada = sin horario.
    const deduped = new Map();
    for (const entry of parsed.data.schedule) deduped.set(entry.weekday, entry.startTime);

    await prisma.$transaction(async (tx) => {
      await tx.employeeSchedule.deleteMany({ where: { employeeId } });
      if (deduped.size) {
        await tx.employeeSchedule.createMany({
          data: [...deduped.entries()].map(([weekday, startTime]) => ({ employeeId, weekday, startTime })),
        });
      }
    });

    const schedule = [...deduped.entries()].map(([weekday, startTime]) => ({ weekday, startTime })).sort((a, b) => a.weekday - b.weekday);
    res.status(200).json({ ok: true, schedule });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// FINIQUITO / LIQUIDACIÓN (informativo, base LFT)
// ============================================================

const ownerAdminRoles = ['OWNER', 'ADMIN'];
const MINIMUM_WAGE_DAILY = 278.8; // salario mínimo general 2025 (para documentar el tope de prima de antigüedad)

function parseYmdUTC(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenDates(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function exactAge(from, to) {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  let months = to.getUTCMonth() - from.getUTCMonth();
  let days = to.getUTCDate() - from.getUTCDate();
  if (days < 0) {
    months -= 1;
    const lastDayPrevMonth = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 0)).getUTCDate();
    days += lastDayPrevMonth;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

// Tabla LFT 2023: año1=12, +2/año hasta 20 (año5), luego +2 cada 5 años.
function vacationDaysForYear(yearNumber) {
  if (yearNumber < 1) return 0;
  if (yearNumber <= 5) return 10 + yearNumber * 2;
  return 20 + Math.ceil((yearNumber - 5) / 5) * 2;
}

employeesRouter.get('/employees/:employeeId/settlement', authMiddleware, async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { employee, membership } = await getMembershipForEmployee({ userId: req.userId, employeeId });
    if (!employee) {
      res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
      return;
    }
    if (!membership || membership.role !== 'OWNER') {
      res.status(403).json({ ok: false, error: 'Solo el dueño (OWNER) puede calcular finiquitos' });
      return;
    }
    if (!employee.hiredAt) {
      res.status(400).json({ ok: false, error: 'El empleado no tiene fecha de ingreso capturada' });
      return;
    }

    const lastDay = req.query.lastDay ? parseYmdUTC(String(req.query.lastDay)) : null;
    const dailySalary = Number(req.query.dailySalary);
    const mode = String(req.query.mode || 'renuncia');
    const pendingDays = req.query.pendingDays != null ? Number(req.query.pendingDays) : 0;
    if (!lastDay) {
      res.status(400).json({ ok: false, error: 'lastDay debe ser YYYY-MM-DD' });
      return;
    }
    if (!Number.isFinite(dailySalary) || dailySalary <= 0) {
      res.status(400).json({ ok: false, error: 'dailySalary debe ser un número positivo' });
      return;
    }
    if (!Number.isFinite(pendingDays) || pendingDays < 0) {
      res.status(400).json({ ok: false, error: 'pendingDays debe ser un número no negativo' });
      return;
    }
    if (mode !== 'renuncia' && mode !== 'despido') {
      res.status(400).json({ ok: false, error: 'mode debe ser renuncia o despido' });
      return;
    }
    const hired = parseYmdUTC(new Date(employee.hiredAt).toISOString().slice(0, 10));
    if (lastDay.getTime() < hired.getTime()) {
      res.status(400).json({ ok: false, error: 'lastDay no puede ser anterior a la fecha de ingreso' });
      return;
    }

    const age = exactAge(hired, lastDay);
    const totalDays = daysBetweenDates(hired, lastDay);
    const yearsDecimal = totalDays / 365;

    // Vacaciones proporcionales del año en curso
    const currentYearNumber = age.years + 1;
    const vacationDaysThisYear = vacationDaysForYear(currentYearNumber);
    const anniversary = new Date(Date.UTC(hired.getUTCFullYear() + age.years, hired.getUTCMonth(), hired.getUTCDate()));
    const daysSinceAnniv = daysBetweenDates(anniversary, lastDay);
    const vacationDaysProp = vacationDaysThisYear * (daysSinceAnniv / 365);
    const vacaciones = vacationDaysProp * dailySalary;
    const primaVacacional = vacaciones * 0.25;

    // Aguinaldo proporcional (año calendario)
    const jan1 = new Date(Date.UTC(lastDay.getUTCFullYear(), 0, 1));
    const startAguinaldo = hired.getTime() > jan1.getTime() ? hired : jan1;
    const aguinaldoWorkedDays = daysBetweenDates(startAguinaldo, lastDay) + 1;
    const aguinaldoDays = (aguinaldoWorkedDays / 365) * 15;
    const aguinaldo = aguinaldoDays * dailySalary;

    // Salario Diario Integrado (SDI): diario + factor aguinaldo (15/365) + factor prima vacacional
    // (díasVacaciones × 25% / 365). Solo se usa para la indemnización por despido (90 y 20 días/año).
    const integrationFactor = 1 + 15 / 365 + (vacationDaysThisYear * 0.25) / 365;
    const dailyIntegrated = dailySalary * integrationFactor;

    const conceptos = [];
    if (pendingDays > 0) {
      conceptos.push({ key: 'diasPendientes', label: 'Días trabajados pendientes de pago', dias: Number(pendingDays.toFixed(2)), monto: toMoney(pendingDays * dailySalary) });
    }
    conceptos.push(
      { key: 'vacaciones', label: 'Vacaciones proporcionales', dias: Number(vacationDaysProp.toFixed(2)), monto: toMoney(vacaciones) },
      { key: 'primaVacacional', label: 'Prima vacacional (25%)', monto: toMoney(primaVacacional) },
      { key: 'aguinaldo', label: 'Aguinaldo proporcional', dias: Number(aguinaldoDays.toFixed(2)), monto: toMoney(aguinaldo) },
    );
    const assumptions = [
      'Cálculo informativo basado en la LFT. Verifica con tu contador antes de liquidar.',
      `Los conceptos "por año" se prorratean con la antigüedad exacta (${yearsDecimal.toFixed(3)} años).`,
    ];

    if (mode === 'despido') {
      const indem90 = 90 * dailyIntegrated;
      const veinteDiasDias = 20 * yearsDecimal;
      const veinteDias = veinteDiasDias * dailyIntegrated;
      const primaAntDias = 12 * yearsDecimal;
      const primaAnt = primaAntDias * dailySalary;
      conceptos.push(
        { key: 'indem90', label: 'Indemnización 90 días (SDI)', dias: 90, monto: toMoney(indem90) },
        { key: 'veinteDias', label: '20 días por año (SDI)', dias: Number(veinteDiasDias.toFixed(2)), monto: toMoney(veinteDias) },
        { key: 'primaAntiguedad', label: 'Prima de antigüedad (12 días/año)', dias: Number(primaAntDias.toFixed(2)), monto: toMoney(primaAnt) },
      );
      assumptions.push(
        `Indemnización (90 y 20 días/año) calculada con salario diario integrado (SDI) = diario × (1 + 15/365 + ${vacationDaysThisYear}×25%/365) = $${toMoney(dailyIntegrated)}.`,
        `Prima de antigüedad calculada con el salario diario capturado ($${dailySalary}). La LFT la topa a 2 salarios mínimos (2 × $${MINIMUM_WAGE_DAILY} = $${(2 * MINIMUM_WAGE_DAILY).toFixed(2)}/día); si el salario diario excede ese tope, el monto real sería menor.`,
      );
    }

    const total = toMoney(conceptos.reduce((sum, c) => sum + c.monto, 0));

    res.status(200).json({
      ok: true,
      employee: { id: employee.id, name: employee.name, position: employee.position, payType: employee.payType },
      hiredAt: new Date(employee.hiredAt).toISOString().slice(0, 10),
      lastDay: String(req.query.lastDay),
      mode,
      dailySalary: toMoney(dailySalary),
      dailySalaryIntegrated: toMoney(dailyIntegrated),
      pendingDays: Number(pendingDays.toFixed(2)),
      antiguedad: {
        years: age.years,
        months: age.months,
        days: age.days,
        label: `${age.years} año(s), ${age.months} mes(es), ${age.days} día(s)`,
        totalDays,
        yearsDecimal: Number(yearsDecimal.toFixed(3)),
      },
      conceptos,
      total,
      assumptions,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { employeesRouter };
