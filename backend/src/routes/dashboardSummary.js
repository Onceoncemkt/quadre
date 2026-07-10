const { Router } = require('express');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

const dashboardSummaryRouter = Router();

function parseDateOnly(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

async function getMembershipForLocation({ userId, locationId }) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      businessId: true,
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

function summarizeClosings(closings) {
  let ventasNetas = 0;
  let faltantes = 0;

  for (const closing of closings) {
    const netByClosing = (closing.lines || []).reduce((sum, line) => sum + Number(line.net || 0), 0);
    ventasNetas += netByClosing;

    const diff = Number(closing.difference || 0);
    if (diff < 0) faltantes += diff;
  }

  return {
    ventasNetas: Number(ventasNetas.toFixed(2)),
    faltantes: Number(faltantes.toFixed(2)),
  };
}

dashboardSummaryRouter.get('/locations/:locationId/dashboard-summary', authMiddleware, async (req, res, next) => {
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
      res.status(403).json({ ok: false, error: 'No autorizado para ver dashboard en esta sucursal' });
      return;
    }

    const todayString = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const todayStart = parseDateOnly(todayString);
    if (!todayStart) {
      res.status(500).json({ ok: false, error: 'No se pudo calcular el día actual' });
      return;
    }
    const tomorrowStart = addDays(todayStart, 1);
    const monthStart = parseDateOnly(`${todayString.slice(0, 7)}-01`);
    if (!monthStart) {
      res.status(500).json({ ok: false, error: 'No se pudo calcular el inicio de mes' });
      return;
    }
    const nextMonthStart = addMonths(monthStart, 1);

    const [todayClosings, monthClosings] = await Promise.all([
      prisma.shiftClosing.findMany({
        where: {
          shift: {
            locationId,
            voidedAt: null,
            date: {
              gte: todayStart,
              lt: tomorrowStart,
            },
          },
        },
        include: {
          lines: true,
        },
      }),
      prisma.shiftClosing.findMany({
        where: {
          shift: {
            locationId,
            voidedAt: null,
            date: {
              gte: monthStart,
              lt: nextMonthStart,
            },
          },
        },
        include: {
          lines: true,
        },
      }),
    ]);

    const todaySummary = summarizeClosings(todayClosings);
    const monthSummary = summarizeClosings(monthClosings);

    res.status(200).json({
      ok: true,
      hoy: {
        ventasNetas: todaySummary.ventasNetas,
        faltantes: todaySummary.faltantes,
      },
      mes: {
        ventasNetas: monthSummary.ventasNetas,
        faltantes: monthSummary.faltantes,
        cierres: monthClosings.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { dashboardSummaryRouter };
