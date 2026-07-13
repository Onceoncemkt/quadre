const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const moneyAccountsRouter = Router();
const ownerAdminRoles = ['OWNER', 'ADMIN'];
const moneyAccountKinds = ['TERMINAL', 'CREDITO', 'DEBITO'];
const mappableChannels = ['RAPPI', 'UBER_EATS', 'DIDI_FOOD', 'PISO', 'EVENTO', 'OTRO'];
const cardMethods = ['TARJETA', 'TRANSFERENCIA'];

const createMoneyAccountSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(moneyAccountKinds).optional(),
  initialBalance: z.coerce.number().optional(),
  cardFeePct: z.coerce.number().min(0).max(100).optional(),
  cardFeeIvaPct: z.coerce.number().min(0).max(100).optional(),
});

const patchMoneyAccountSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    kind: z.enum(moneyAccountKinds).optional(),
    initialBalance: z.coerce.number().optional(),
    cardFeePct: z.coerce.number().min(0).max(100).optional(),
    cardFeeIvaPct: z.coerce.number().min(0).max(100).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

const patchDefaultMoneyAccountSchema = z.object({
  moneyAccountId: z.union([z.string().trim().min(1), z.null()]).optional(),
});

const putChannelAccountMapSchema = z.object({
  items: z.array(
    z.object({
      channel: z.enum(mappableChannels),
      moneyAccountId: z.union([z.string().trim().min(1), z.null()]),
    }),
  ),
});

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

function formatDdMm(date) {
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function toDayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function formatChannelLabel(channel) {
  if (channel === 'RAPPI') return 'Rappi';
  if (channel === 'UBER_EATS') return 'Uber Eats';
  if (channel === 'DIDI_FOOD') return 'Didi Food';
  if (channel === 'PISO') return 'Piso';
  if (channel === 'EVENTO') return 'Evento';
  return 'Otro';
}

function getAccountBalance({ kind, initialBalance, entries, outflows }) {
  if (kind === 'CREDITO') {
    return toMoney(initialBalance + outflows - entries);
  }
  return toMoney(initialBalance + entries - outflows);
}

// Factor efectivo de comisión bancaria de la terminal (ej. 2.75% × 1.16 = 0.0319).
function getAccountFeeFactor(account) {
  const pct = Number(account.cardFeePct || 0);
  if (pct <= 0) return 0;
  const iva = Number(account.cardFeeIvaPct || 0);
  return (pct / 100) * (1 + iva / 100);
}

function getLineAssignedMoneyAccountId({ line, channelMapByChannel, defaultMoneyAccountId }) {
  // REGLA DE HIERRO: el efectivo vive en el arqueo, nunca en una MoneyAccount,
  // esté o no mapeado su canal (ej. PISO->Clip no debe arrastrar el efectivo).
  if (line.method === 'EFECTIVO') return null;
  const mappedId = channelMapByChannel.get(line.channel) || null;
  if (mappedId) return mappedId;
  if (cardMethods.includes(line.method) && defaultMoneyAccountId) return defaultMoneyAccountId;
  return null;
}

function buildSalesWhereClause({ businessId, monthBounds, mappedChannels }) {
  const baseWhere = {
    closing: {
      shift: {
        voidedAt: null,
        location: { businessId },
        ...(monthBounds
          ? {
              date: {
                gte: monthBounds.start,
                lt: monthBounds.end,
              },
            }
          : {}),
      },
    },
  };

  if (!mappedChannels.length) {
    return {
      ...baseWhere,
      method: { in: cardMethods },
    };
  }

  // REGLA DE HIERRO: EFECTIVO nunca entra a una cuenta. El branch por canal
  // mapeado captura tarjeta/transferencia/APP de ese canal, pero jamás su efectivo.
  return {
    ...baseWhere,
    method: { not: 'EFECTIVO' },
    OR: [{ method: { in: cardMethods } }, { channel: { in: mappedChannels } }],
  };
}

async function getBusinessMembership({ userId, businessId }) {
  return prisma.membership.findUnique({
    where: {
      userId_businessId: {
        userId,
        businessId,
      },
    },
    select: {
      id: true,
    },
  });
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
          kind: parsed.data.kind || 'TERMINAL',
          initialBalance: toMoney(parsed.data.initialBalance || 0),
          ...(parsed.data.cardFeePct !== undefined ? { cardFeePct: toMoney(parsed.data.cardFeePct) } : {}),
          ...(parsed.data.cardFeeIvaPct !== undefined ? { cardFeeIvaPct: toMoney(parsed.data.cardFeeIvaPct) } : {}),
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
        res.status(404).json({ ok: false, error: 'Tarjeta no encontrada para este negocio' });
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
          ...(parsed.data.cardFeePct !== undefined ? { cardFeePct: toMoney(parsed.data.cardFeePct) } : {}),
          ...(parsed.data.cardFeeIvaPct !== undefined ? { cardFeeIvaPct: toMoney(parsed.data.cardFeeIvaPct) } : {}),
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
          select: { id: true, businessId: true, active: true, kind: true },
        });
        if (!moneyAccount || moneyAccount.businessId !== businessId || !moneyAccount.active) {
          res.status(400).json({ ok: false, error: 'Tarjeta inválida para este negocio' });
          return;
        }
        if (moneyAccount.kind !== 'TERMINAL') {
          res.status(400).json({ ok: false, error: 'La tarjeta default debe ser tipo TERMINAL' });
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
  '/businesses/:businessId/channel-account-map',
  authMiddleware,
  requireRole((req) => req.params.businessId, ownerAdminRoles),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const [business, maps] = await Promise.all([
        prisma.business.findUnique({
          where: { id: businessId },
          select: { id: true, defaultMoneyAccountId: true },
        }),
        prisma.channelAccountMap.findMany({
          where: { businessId },
          select: { channel: true, moneyAccountId: true },
        }),
      ]);

      if (!business) {
        res.status(404).json({ ok: false, error: 'Business no encontrado' });
        return;
      }

      const mapByChannel = new Map(maps.map((item) => [item.channel, item.moneyAccountId]));
      const items = mappableChannels.map((channel) => ({
        channel,
        moneyAccountId: mapByChannel.get(channel) || null,
      }));

      res.status(200).json({
        ok: true,
        defaultMoneyAccountId: business.defaultMoneyAccountId,
        items,
      });
    } catch (error) {
      next(error);
    }
  },
);

moneyAccountsRouter.put(
  '/businesses/:businessId/channel-account-map',
  authMiddleware,
  requireRole((req) => req.params.businessId, ownerAdminRoles),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const parsed = putChannelAccountMapSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: 'Payload inválido', details: parsed.error.flatten() });
        return;
      }

      const deduped = new Map();
      parsed.data.items.forEach((item) => {
        deduped.set(item.channel, item.moneyAccountId || null);
      });

      const referencedMoneyAccountIds = [...new Set([...deduped.values()].filter(Boolean))];
      if (referencedMoneyAccountIds.length) {
        const accounts = await prisma.moneyAccount.findMany({
          where: {
            id: { in: referencedMoneyAccountIds },
            businessId,
            active: true,
          },
          select: { id: true },
        });
        const existingIds = new Set(accounts.map((item) => item.id));
        const missingIds = referencedMoneyAccountIds.filter((id) => !existingIds.has(id));
        if (missingIds.length) {
          res.status(400).json({ ok: false, error: 'Hay cuentas inválidas o inactivas en el mapeo' });
          return;
        }
      }

      await prisma.$transaction(async (tx) => {
        for (const [channel, moneyAccountId] of deduped.entries()) {
          if (!moneyAccountId) {
            await tx.channelAccountMap.deleteMany({
              where: {
                businessId,
                channel,
              },
            });
            continue;
          }
          await tx.channelAccountMap.upsert({
            where: {
              businessId_channel: {
                businessId,
                channel,
              },
            },
            update: {
              moneyAccountId,
            },
            create: {
              businessId,
              channel,
              moneyAccountId,
            },
          });
        }
      });

      const maps = await prisma.channelAccountMap.findMany({
        where: { businessId },
        select: { channel: true, moneyAccountId: true },
      });
      const mapByChannel = new Map(maps.map((item) => [item.channel, item.moneyAccountId]));
      res.status(200).json({
        ok: true,
        items: mappableChannels.map((channel) => ({
          channel,
          moneyAccountId: mapByChannel.get(channel) || null,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

moneyAccountsRouter.delete(
  '/businesses/:businessId/money-accounts/:moneyAccountId',
  authMiddleware,
  requireRole((req) => req.params.businessId, ownerAdminRoles),
  async (req, res, next) => {
    try {
      const { businessId, moneyAccountId } = req.params;
      const [account, business, mapsForBusiness] = await Promise.all([
        prisma.moneyAccount.findUnique({
          where: { id: moneyAccountId },
          select: {
            id: true,
            businessId: true,
            name: true,
            active: true,
            kind: true,
          },
        }),
        prisma.business.findUnique({
          where: { id: businessId },
          select: { id: true, defaultMoneyAccountId: true },
        }),
        prisma.channelAccountMap.findMany({
          where: { businessId },
          select: { channel: true, moneyAccountId: true },
        }),
      ]);
      if (!account || account.businessId !== businessId) {
        res.status(404).json({ ok: false, error: 'Tarjeta no encontrada para este negocio' });
        return;
      }
      if (!business) {
        res.status(404).json({ ok: false, error: 'Business no encontrado' });
        return;
      }

      const mappedChannelsForAccount = mapsForBusiness
        .filter((map) => map.moneyAccountId === account.id)
        .map((map) => map.channel);
      const allMappedChannels = mapsForBusiness.map((map) => map.channel);

      const [expenseCount, paymentCount, mappedSalesCount, defaultFallbackSalesCount] = await Promise.all([
        prisma.expense.count({
          where: {
            moneyAccountId: account.id,
          },
        }),
        prisma.counterpartyPayment.count({
          where: {
            moneyAccountId: account.id,
          },
        }),
        mappedChannelsForAccount.length
          ? prisma.closingLine.count({
              where: {
                channel: { in: mappedChannelsForAccount },
                method: { not: 'EFECTIVO' }, // REGLA DE HIERRO: el efectivo no cuenta como venta ruteada
                closing: {
                  shift: {
                    voidedAt: null,
                    location: {
                      businessId,
                    },
                  },
                },
              },
            })
          : Promise.resolve(0),
        business.defaultMoneyAccountId === account.id && account.kind === 'TERMINAL'
          ? prisma.closingLine.count({
              where: {
                method: { in: cardMethods },
                ...(allMappedChannels.length ? { channel: { notIn: allMappedChannels } } : {}),
                closing: {
                  shift: {
                    voidedAt: null,
                    location: {
                      businessId,
                    },
                  },
                },
              },
            })
          : Promise.resolve(0),
      ]);

      const hasHistory =
        expenseCount > 0 ||
        paymentCount > 0 ||
        mappedSalesCount > 0 ||
        defaultFallbackSalesCount > 0;
      const wasDefault = business.defaultMoneyAccountId === account.id;

      const result = await prisma.$transaction(async (tx) => {
        if (wasDefault) {
          await tx.business.update({
            where: { id: businessId },
            data: { defaultMoneyAccountId: null },
          });
        }
        await tx.channelAccountMap.deleteMany({
          where: { businessId, moneyAccountId: account.id },
        });

        if (hasHistory) {
          const updated = await tx.moneyAccount.update({
            where: { id: account.id },
            data: { active: false },
            select: { id: true, name: true, active: true },
          });
          return {
            action: 'DEACTIVATED',
            moneyAccount: updated,
          };
        }

        await tx.moneyAccount.delete({
          where: { id: account.id },
        });
        return {
          action: 'DELETED',
          moneyAccount: {
            id: account.id,
            name: account.name,
            active: false,
          },
        };
      });

      res.status(200).json({
        ok: true,
        ...result,
        hadHistory: hasHistory,
        history: {
          expenses: expenseCount,
          payments: paymentCount,
          mappedSales: mappedSalesCount,
          defaultFallbackSales: defaultFallbackSalesCount,
        },
        defaultCleared: wasDefault,
      });
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
      const monthBounds = parseMonthString(month);
      if (!monthBounds) {
        res.status(400).json({ ok: false, error: 'Parámetro month inválido. Usa formato YYYY-MM' });
        return;
      }

      const [business, accounts, channelMaps] = await Promise.all([
        prisma.business.findUnique({
          where: { id: businessId },
          select: {
            id: true,
            defaultMoneyAccountId: true,
          },
        }),
        prisma.moneyAccount.findMany({
          where: { businessId },
          orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
        }),
        prisma.channelAccountMap.findMany({
          where: { businessId },
          select: { channel: true, moneyAccountId: true },
        }),
      ]);
      if (!business) {
        res.status(404).json({ ok: false, error: 'Business no encontrado' });
        return;
      }

      const mappedChannels = channelMaps.map((item) => item.channel);
      const channelMapByChannel = new Map(channelMaps.map((item) => [item.channel, item.moneyAccountId]));

      const [salesLines, expenses, counterpartyPayments] = await Promise.all([
        prisma.closingLine.findMany({
          where: buildSalesWhereClause({ businessId, monthBounds, mappedChannels }),
          select: {
            method: true,
            channel: true,
            net: true,
          },
        }),
        prisma.expense.findMany({
          where: {
            moneyAccountId: { not: null },
            location: { businessId },
            date: {
              gte: monthBounds.start,
              lt: monthBounds.end,
            },
          },
          select: {
            moneyAccountId: true,
            amount: true,
          },
        }),
        prisma.counterpartyPayment.findMany({
          where: {
            moneyAccountId: { not: null },
            counterparty: { businessId },
            date: {
              gte: monthBounds.start,
              lt: monthBounds.end,
            },
          },
          select: {
            moneyAccountId: true,
            amount: true,
          },
        }),
      ]);

      const monthEntriesByAccount = new Map();
      salesLines.forEach((line) => {
        const assignedAccountId = getLineAssignedMoneyAccountId({
          line,
          channelMapByChannel,
          defaultMoneyAccountId: business.defaultMoneyAccountId,
        });
        if (!assignedAccountId) return;
        monthEntriesByAccount.set(
          assignedAccountId,
          toMoney((monthEntriesByAccount.get(assignedAccountId) || 0) + Number(line.net || 0)),
        );
      });

      const items = accounts.map((account) => {
        const monthEntries = toMoney(monthEntriesByAccount.get(account.id) || 0);
        const monthExpenseOutflows = toMoney(
          expenses
            .filter((expense) => expense.moneyAccountId === account.id)
            .reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
        );
        const monthSupplierOutflows = toMoney(
          counterpartyPayments
            .filter((payment) => payment.moneyAccountId === account.id)
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        );
        // Comisión bancaria de la terminal sobre las ventas con tarjeta del mes.
        const feeFactor = getAccountFeeFactor(account);
        const monthCommission = toMoney(monthEntries * feeFactor);
        const monthOutflows = toMoney(monthExpenseOutflows + monthSupplierOutflows + monthCommission);
        const monthNet = toMoney(monthEntries - monthOutflows);
        const balance = getAccountBalance({
          kind: account.kind,
          initialBalance: Number(account.initialBalance || 0),
          entries: monthEntries,
          outflows: monthOutflows,
        });

        return {
          id: account.id,
          businessId: account.businessId,
          name: account.name,
          kind: account.kind,
          initialBalance: toMoney(account.initialBalance),
          cardFeePct: toMoney(account.cardFeePct),
          cardFeeIvaPct: toMoney(account.cardFeeIvaPct),
          active: account.active,
          createdAt: account.createdAt,
          isDefault: business.defaultMoneyAccountId === account.id,
          monthEntries,
          monthCommission,
          monthOutflows,
          monthNet,
          balance,
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

moneyAccountsRouter.get('/money-accounts/:moneyAccountId/movements', authMiddleware, async (req, res, next) => {
  try {
    const { moneyAccountId } = req.params;
    const month = req.query.month ? String(req.query.month) : getMexicoTodayString().slice(0, 7);
    const monthBounds = parseMonthString(month);
    if (!monthBounds) {
      res.status(400).json({ ok: false, error: 'Parámetro month inválido. Usa formato YYYY-MM' });
      return;
    }

    const account = await prisma.moneyAccount.findUnique({
      where: { id: moneyAccountId },
      include: {
        business: {
          select: {
            id: true,
            defaultMoneyAccountId: true,
          },
        },
      },
    });
    if (!account) {
      res.status(404).json({ ok: false, error: 'Tarjeta no encontrada' });
      return;
    }

    const membership = await getBusinessMembership({ userId: req.userId, businessId: account.businessId });
    if (!membership) {
      res.status(403).json({ ok: false, error: 'No autorizado para ver movimientos de esta tarjeta' });
      return;
    }

    const channelMaps = await prisma.channelAccountMap.findMany({
      where: { businessId: account.businessId },
      select: { channel: true, moneyAccountId: true },
    });
    const mappedChannels = channelMaps.map((item) => item.channel);
    const channelMapByChannel = new Map(channelMaps.map((item) => [item.channel, item.moneyAccountId]));

    const [salesLines, expenses, counterpartyPayments] = await Promise.all([
      prisma.closingLine.findMany({
        where: buildSalesWhereClause({
          businessId: account.businessId,
          monthBounds,
          mappedChannels,
        }),
        select: {
          id: true,
          channel: true,
          method: true,
          net: true,
          closing: {
            select: {
              closedAt: true,
              shift: {
                select: {
                  date: true,
                  type: true,
                  closedById: true,
                },
              },
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: {
          moneyAccountId,
          date: {
            gte: monthBounds.start,
            lt: monthBounds.end,
          },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          concept: true,
          createdAt: true,
          createdById: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.counterpartyPayment.findMany({
        where: {
          moneyAccountId,
          date: {
            gte: monthBounds.start,
            lt: monthBounds.end,
          },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          createdAt: true,
          createdById: true,
          counterparty: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const filteredSalesLines = salesLines.filter((line) => {
      const assignedAccountId = getLineAssignedMoneyAccountId({
        line,
        channelMapByChannel,
        defaultMoneyAccountId: account.business.defaultMoneyAccountId,
      });
      return assignedAccountId === account.id;
    });

    const userIds = [
      ...new Set([
        ...filteredSalesLines.map((line) => line.closing.shift.closedById).filter(Boolean),
        ...expenses.map((expense) => expense.createdById).filter(Boolean),
        ...counterpartyPayments.map((payment) => payment.createdById).filter(Boolean),
      ]),
    ];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    const saleMovements = filteredSalesLines.map((line) => {
      const shiftDate = line.closing.shift.date;
      const createdById = line.closing.shift.closedById;
      return {
        id: `shift-sale-${line.id}`,
        date: shiftDate,
        createdAt: line.closing.closedAt || shiftDate,
        description: `Ventas ${formatChannelLabel(line.channel)} · turno ${line.closing.shift.type} · ${formatDdMm(shiftDate)}`,
        type: 'entrada',
        amount: toMoney(line.net),
        createdBy: createdById ? userMap.get(createdById) || null : null,
      };
    });

    const expenseMovements = expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      date: expense.date,
      createdAt: expense.createdAt,
      description: `Gasto: ${expense.concept}${expense.category?.name ? ` (${expense.category.name})` : ''}`,
      type: 'salida',
      amount: toMoney(expense.amount),
      createdBy: expense.createdById ? userMap.get(expense.createdById) || null : null,
    }));

    const paymentMovements = counterpartyPayments.map((payment) => ({
      id: `counterparty-payment-${payment.id}`,
      date: payment.date,
      createdAt: payment.createdAt,
      description: `Pago a ${payment.counterparty?.name || 'acreedor'}`,
      type: 'salida',
      amount: toMoney(payment.amount),
      createdBy: payment.createdById ? userMap.get(payment.createdById) || null : null,
    }));

    // Comisión bancaria de la terminal: egreso derivado por día = bruto tarjeta × factor.
    const feeFactor = getAccountFeeFactor(account);
    const commissionMovements = [];
    if (feeFactor > 0) {
      const salesByDay = new Map();
      filteredSalesLines.forEach((line) => {
        const dayKey = toDayKey(line.closing.shift.date);
        salesByDay.set(dayKey, (salesByDay.get(dayKey) || 0) + Number(line.net || 0));
      });
      for (const [dayKey, bruto] of salesByDay.entries()) {
        const amount = toMoney(bruto * feeFactor);
        if (amount <= 0) continue;
        const dayDate = new Date(`${dayKey}T00:00:00.000Z`);
        commissionMovements.push({
          id: `terminal-fee-${dayKey}`,
          date: dayDate,
          createdAt: dayDate,
          description: `Comisión terminal (${Number(account.cardFeePct)}% + IVA) · ${formatDdMm(dayDate)}`,
          type: 'salida',
          amount,
          createdBy: null,
        });
      }
    }

    const movements = [...saleMovements, ...commissionMovements, ...expenseMovements, ...paymentMovements].sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      const createdAtDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (createdAtDiff !== 0) return createdAtDiff;
      return b.id.localeCompare(a.id);
    });

    const totals = movements.reduce(
      (acc, movement) => {
        if (movement.type === 'entrada') {
          acc.entries += movement.amount;
        } else {
          acc.outflows += movement.amount;
        }
        return acc;
      },
      { entries: 0, outflows: 0 },
    );

    const groupedByDayMap = new Map();
    movements.forEach((movement) => {
      const dayKey = toDayKey(movement.date);
      const current = groupedByDayMap.get(dayKey) || {
        date: dayKey,
        entries: 0,
        outflows: 0,
        net: 0,
        movements: [],
      };
      if (movement.type === 'entrada') {
        current.entries = toMoney(current.entries + movement.amount);
      } else {
        current.outflows = toMoney(current.outflows + movement.amount);
      }
      current.net = toMoney(current.entries - current.outflows);
      current.movements.push(movement);
      groupedByDayMap.set(dayKey, current);
    });

    const groupedByDay = [...groupedByDayMap.values()].sort((a, b) => b.date.localeCompare(a.date));

    res.status(200).json({
      ok: true,
      month,
      account: {
        id: account.id,
        businessId: account.businessId,
        name: account.name,
        kind: account.kind,
        isDefault: account.business.defaultMoneyAccountId === account.id,
      },
      totals: {
        entries: toMoney(totals.entries),
        outflows: toMoney(totals.outflows),
        net: toMoney(totals.entries - totals.outflows),
      },
      groupedByDay,
      movements,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { moneyAccountsRouter, getLineAssignedMoneyAccountId, getAccountFeeFactor };