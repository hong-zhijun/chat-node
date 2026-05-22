const express = require('express');
const router = express.Router();

const config = require('../../config');
const { signAdminToken, requireAdmin } = require('../auth');
const userService = require('../services/userService');
const cleanupService = require('../services/cleanupService');
const configService = require('../services/configService');
const { getOnlineUserIds } = require('../ws');

// POST /api/admin/login  body: { adminKey }
router.post('/login', (req, res) => {
  const { adminKey } = req.body || {};
  if (!adminKey || typeof adminKey !== 'string') {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'invalid_request', message: 'adminKey required' } });
  }
  if (adminKey !== config.adminKey) {
    return res
      .status(401)
      .json({ ok: false, error: { code: 'invalid_credentials', message: 'Invalid admin key' } });
  }
  const token = signAdminToken();
  res.json({ ok: true, data: { token } });
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  res.json({ ok: true, data: cleanupService.getStats() });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const onlineSet = new Set(getOnlineUserIds());
  const rows = userService.listUsers().map((u) => ({
    userId: u.user_id,
    name: u.name,
    loginKey: u.login_key,
    status: u.status,
    createdAt: u.created_at,
    online: onlineSet.has(u.user_id),
    barkKey: u.bark_key || null
  }));
  res.json({ ok: true, data: rows });
});

// POST /api/admin/users  body: { name, userId?, loginKey? }
router.post('/users', requireAdmin, (req, res, next) => {
  try {
    const { name, userId, loginKey } = req.body || {};
    const created = userService.createUser({ name, userId, loginKey });
    res.json({ ok: true, data: created });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/admin/users/:userId  body: { name?, status?, regenerateLoginKey?, barkKey? }
router.patch('/users/:userId', requireAdmin, (req, res, next) => {
  try {
    const { name, status, regenerateLoginKey, barkKey, resetKey } = req.body || {};
    const result = userService.updateUser(req.params.userId, {
      name,
      status,
      regenerateLoginKey: !!(regenerateLoginKey || resetKey),
      barkKey
    });
    res.json({ ok: true, data: result });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', requireAdmin, (req, res) => {
  const ok = userService.deleteUser(req.params.userId);
  if (!ok) {
    return res
      .status(404)
      .json({ ok: false, error: { code: 'user_not_found', message: 'User not found' } });
  }
  res.json({ ok: true, data: { deleted: true } });
});

// 系统配置
router.get('/config', requireAdmin, (req, res) => {
  res.json({ ok: true, data: configService.getAll() });
});

router.patch('/config', requireAdmin, (req, res, next) => {
  try {
    configService.setMany(req.body || {});
    res.json({ ok: true, data: configService.getAll() });
  } catch (e) { next(e); }
});

// 清理：消息
router.post('/cleanup/messages/preview', requireAdmin, (req, res, next) => {
  try {
    const { beforeTimestamp, userId } = req.body || {};
    res.json({ ok: true, data: cleanupService.previewMessageCleanup({ beforeTimestamp, userId }) });
  } catch (e) { next(e); }
});
router.post('/cleanup/messages/execute', requireAdmin, (req, res, next) => {
  try {
    const { beforeTimestamp, userId } = req.body || {};
    res.json({ ok: true, data: cleanupService.executeMessageCleanup({ beforeTimestamp, userId }) });
  } catch (e) { next(e); }
});

// 清理：文件
router.post('/cleanup/files/preview', requireAdmin, (req, res, next) => {
  try {
    const { beforeTimestamp, minSizeBytes, scope } = req.body || {};
    res.json({ ok: true, data: cleanupService.previewFileCleanup({ beforeTimestamp, minSizeBytes, scope }) });
  } catch (e) { next(e); }
});
router.post('/cleanup/files/execute', requireAdmin, (req, res, next) => {
  try {
    const { beforeTimestamp, minSizeBytes, scope } = req.body || {};
    res.json({ ok: true, data: cleanupService.executeFileCleanup({ beforeTimestamp, minSizeBytes, scope }) });
  } catch (e) { next(e); }
});

// ── AI Filler 文案管理 ────────────────────────────────────────────────────

// GET /api/admin/fillers
router.get('/fillers', requireAdmin, (req, res) => {
  const rows = require('../db').getDb()
    .prepare('SELECT id, content, created_at FROM ai_fillers ORDER BY id ASC')
    .all();
  res.json({ ok: true, data: rows });
});

// POST /api/admin/fillers  body: { content }
router.post('/fillers', requireAdmin, (req, res) => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ ok: false, error: { code: 'invalid_request', message: 'content required' } });
  }
  const now = Date.now();
  const result = require('../db').getDb()
    .prepare('INSERT INTO ai_fillers (content, created_at) VALUES (?, ?)')
    .run(content.trim(), now);
  res.json({ ok: true, data: { id: result.lastInsertRowid, content: content.trim(), created_at: now } });
});

// DELETE /api/admin/fillers/:id
router.delete('/fillers/:id', requireAdmin, (req, res) => {
  const result = require('../db').getDb()
    .prepare('DELETE FROM ai_fillers WHERE id = ?')
    .run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Filler not found' } });
  }
  res.json({ ok: true, data: { deleted: true } });
});

module.exports = router;
