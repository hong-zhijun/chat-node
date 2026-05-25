const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');

const config = require('../../config');
const { signAdminToken, requireAdmin } = require('../auth');
const userService = require('../services/userService');
const cleanupService = require('../services/cleanupService');
const configService = require('../services/configService');
const fileService = require('../services/fileService');
const { getOnlineUserIds } = require('../ws');

// Multer 实例（供贴纸上传用）
const ADMIN_TMP_DIR = path.join(os.tmpdir(), 'chat-node-uploads');
if (!fs.existsSync(ADMIN_TMP_DIR)) fs.mkdirSync(ADMIN_TMP_DIR, { recursive: true });
const stickerUpload = multer({
  storage: multer.diskStorage({
    destination: ADMIN_TMP_DIR,
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(file.originalname || ''));
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 } // 表情包限制 20MB
});

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

// ── 表情包管理 ────────────────────────────────────────────────────────────

// GET /api/admin/stickers — 列出全部贴纸
router.get('/stickers', requireAdmin, (req, res) => {
  const rows = require('../db').getDb()
    .prepare('SELECT file_id, filename, mime, width, height, has_thumbnail, created_at FROM files WHERE scope = ? ORDER BY created_at DESC')
    .all('sticker');
  res.json({ ok: true, data: rows });
});

// POST /api/admin/stickers — 上传贴纸（multipart/form-data, field: file）
router.post('/stickers', requireAdmin, (req, res, next) => {
  stickerUpload.single('file')(req, res, async (err) => {
    if (err) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_error';
      return res.status(400).json({ ok: false, error: { code, message: err.message } });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: { code: 'no_file', message: 'No file uploaded' } });
    }
    const mime = req.file.mimetype || '';
    if (!mime.startsWith('image/')) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ ok: false, error: { code: 'not_an_image', message: '仅支持图片/GIF 格式' } });
    }
    let originalName = req.file.originalname || 'sticker';
    try { originalName = Buffer.from(originalName, 'latin1').toString('utf8'); } catch {}
    try {
      const saved = await fileService.saveUpload({
        ownerUserId: 'admin',
        scope: 'sticker',
        originalName,
        mime,
        tmpPath: req.file.path,
        size: req.file.size
      });
      res.json({ ok: true, data: saved });
    } catch (e) {
      try { fs.unlinkSync(req.file.path); } catch {}
      next(e);
    }
  });
});

// DELETE /api/admin/stickers/:fileId — 删除贴纸
router.delete('/stickers/:fileId', requireAdmin, (req, res) => {
  const db = require('../db').getDb();
  const file = db.prepare('SELECT * FROM files WHERE file_id = ? AND scope = ?').get(req.params.fileId, 'sticker');
  if (!file) {
    return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Sticker not found' } });
  }
  // 删磁盘文件 + 缩略图
  try { fs.unlinkSync(fileService.absPath(file.path)); } catch {}
  try { fs.unlinkSync(fileService.thumbPath(fileService.absPath(file.path))); } catch {}
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  res.json({ ok: true, data: { deleted: true } });
});

// GET /api/admin/stickers/:fileId/thumbnail — 管理员专用缩略图（admin token）
router.get('/stickers/:fileId/thumbnail', requireAdmin, (req, res) => {
  const file = require('../db').getDb()
    .prepare('SELECT * FROM files WHERE file_id = ? AND scope = ?').get(req.params.fileId, 'sticker');
  if (!file) return res.status(404).json({ ok: false, error: { code: 'not_found' } });
  if (!file.has_thumbnail) return res.status(404).json({ ok: false, error: { code: 'no_thumbnail' } });
  const abs = fileService.thumbPath(fileService.absPath(file.path));
  if (!fs.existsSync(abs)) return res.status(404).json({ ok: false, error: { code: 'not_found_on_disk' } });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(abs).pipe(res);
});

// GET /api/admin/stickers/:fileId/image — 管理员专用原图（admin token）
router.get('/stickers/:fileId/image', requireAdmin, (req, res) => {
  const file = require('../db').getDb()
    .prepare('SELECT * FROM files WHERE file_id = ? AND scope = ?').get(req.params.fileId, 'sticker');
  if (!file) return res.status(404).json({ ok: false, error: { code: 'not_found' } });
  const abs = fileService.absPath(file.path);
  if (!fs.existsSync(abs)) return res.status(404).json({ ok: false, error: { code: 'not_found_on_disk' } });
  res.setHeader('Content-Type', file.mime || 'image/png');
  res.setHeader('Content-Length', String(file.size));
  fs.createReadStream(abs).pipe(res);
});

module.exports = router;
