const { Router } = require('express');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

const meRouter = Router();

meRouter.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        memberships: {
          include: {
            location: true,
            business: {
              include: {
                locations: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      return;
    }

    res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      memberships: user.memberships,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { meRouter };
