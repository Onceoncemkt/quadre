const express = require('express');
const cors = require('cors');
const { healthRouter } = require('./routes/health');
const { waitlistRouter } = require('./routes/waitlist');
const { authRouter } = require('./routes/auth');
const { meRouter } = require('./routes/me');
const { shiftClosingsRouter } = require('./routes/shiftClosings');
const { businessMembersRouter } = require('./routes/businessMembers');

const app = express();

app.set('trust proxy', 1);
app.use(express.json());

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const isQuadre = /^https:\/\/([a-z0-9-]+\.)?quadre\.mx$/i.test(origin);
  const isVercel = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

  return isLocalhost || isQuadre || isVercel;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin no permitido'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(healthRouter);
app.use(waitlistRouter);
app.use('/auth', authRouter);
app.use(meRouter);
app.use(shiftClosingsRouter);
app.use(businessMembersRouter);

app.use((err, _req, res, _next) => {
  if (err && err.message === 'CORS origin no permitido') {
    res.status(403).json({ ok: false, error: err.message });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

module.exports = { app };
