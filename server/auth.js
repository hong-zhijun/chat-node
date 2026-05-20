const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('./db');

function signUserToken(userId, tokenId) {
  return jwt.sign({ userId, tokenId, type: 'user' }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
}

function signAdminToken() {
  return jwt.sign({ type: 'admin' }, config.jwtSecret, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (e) {
    return null;
  }
}

function extractToken(req) {
  const h = req.headers['authorization'];
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  // img/video 标签等浏览器原生请求无法设置 header，改从 query 参数读取
  if (req.query && req.query.token) return req.query.token;
  return null;
}

function requireUser(req, res, next) {
  const token = extractToken(req);
  const payload = token && verifyToken(token);
  if (!payload || payload.type !== 'user') {
    return res.status(401).json({ ok: false, error: { code: 'unauthorized', message: 'Invalid token' } });
  }

  const db = getDb();
  const sess = db.prepare('SELECT revoked FROM sessions WHERE token_id = ?').get(payload.tokenId);
  if (!sess || sess.revoked) {
    return res.status(401).json({ ok: false, error: { code: 'unauthorized', message: 'Session revoked' } });
  }
  db.prepare('UPDATE sessions SET last_active_at = ? WHERE token_id = ?').run(Date.now(), payload.tokenId);

  req.auth = { userId: payload.userId, tokenId: payload.tokenId };
  next();
}

function requireAdmin(req, res, next) {
  const token = extractToken(req);
  const payload = token && verifyToken(token);
  if (!payload || payload.type !== 'admin') {
    return res.status(401).json({ ok: false, error: { code: 'unauthorized', message: 'Admin only' } });
  }
  req.auth = { type: 'admin' };
  next();
}

module.exports = {
  signUserToken,
  signAdminToken,
  verifyToken,
  extractToken,
  requireUser,
  requireAdmin
};
