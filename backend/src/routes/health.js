const { Router } = require('express');

const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

module.exports = { healthRouter };
