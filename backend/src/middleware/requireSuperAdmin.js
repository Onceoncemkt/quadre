const { prisma } = require('../lib/prisma');
const { isSuperAdminEmail } = require('../lib/superAdmin');

async function requireSuperAdmin(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true },
    });

    if (!user || !isSuperAdminEmail(user.email)) {
      res.status(403).json({ ok: false, error: 'Solo super admins pueden acceder a este recurso' });
      return;
    }

    req.isSuperAdmin = true;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireSuperAdmin };
