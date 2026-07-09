const { prisma } = require('../lib/prisma');

function resolveBusinessIdValue(req, businessId) {
  if (typeof businessId === 'function') return businessId(req);
  if (businessId) return businessId;
  return req.params.businessId || req.body.businessId || req.query.businessId;
}

function requireRole(businessId, roles = []) {
  return async (req, res, next) => {
    try {
      const businessIdValue = resolveBusinessIdValue(req, businessId);
      if (!businessIdValue) {
        res.status(400).json({ ok: false, error: 'businessId requerido para validar rol' });
        return;
      }

      const membership = await prisma.membership.findUnique({
        where: {
          userId_businessId: {
            userId: req.userId,
            businessId: businessIdValue,
          },
        },
      });

      if (!membership || (roles.length && !roles.includes(membership.role))) {
        res.status(403).json({ ok: false, error: 'No autorizado para esta acción' });
        return;
      }

      req.membership = membership;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { requireRole };
