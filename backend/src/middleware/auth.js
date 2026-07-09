const { verifyAuthToken } = require('../lib/auth');

function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ ok: false, error: 'Token Bearer requerido' });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    req.userId = payload.userId;
    next();
  } catch (_error) {
    res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
}

module.exports = { authMiddleware };
