const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const multer = require('multer');

const config = require('../../config');
const { requireUser } = require('../auth');
const fileService = require('../services/fileService');

const router = express.Router();

const TMP_DIR = path.join(os.tmpdir(), 'chat-node-uploads');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB

const upload = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(file.originalname || ''));
    }
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

// POST /api/files/upload?scope=chat|share
router.post('/upload', requireUser, (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_error';
      return res.status(400).json({ ok: false, error: { code, message: err.message } });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: { code: 'no_file', message: 'No file uploaded' } });
    }
    const scope = req.query.scope || 'chat';
    if (!['chat', 'share'].includes(scope)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ ok: false, error: { code: 'invalid_scope', message: 'scope must be chat|share' } });
    }

    // multer 在 Windows 上 originalname 编码常为 latin1。修正为 utf8。
    let originalName = req.file.originalname || 'file';
    try { originalName = Buffer.from(originalName, 'latin1').toString('utf8'); } catch {}

    try {
      const saved = await fileService.saveUpload({
        ownerUserId: req.auth.userId,
        scope,
        originalName,
        mime: req.file.mimetype || 'application/octet-stream',
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

// GET /api/files/:fileId
router.get('/:fileId', requireUser, (req, res) => {
  const file = fileService.findByFileId(req.params.fileId);
  if (!file) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'File not found' } });
  if (!fileService.canAccess(file, req.auth.userId)) {
    return res.status(403).json({ ok: false, error: { code: 'forbidden', message: 'Access denied' } });
  }
  const abs = fileService.absPath(file.path);
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ ok: false, error: { code: 'not_found_on_disk', message: 'File missing' } });
  }
  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`
  );
  res.setHeader('Content-Length', String(file.size));
  fs.createReadStream(abs).pipe(res);
});

// GET /api/files/:fileId/thumbnail
router.get('/:fileId/thumbnail', requireUser, (req, res) => {
  const file = fileService.findByFileId(req.params.fileId);
  if (!file) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'File not found' } });
  if (!fileService.canAccess(file, req.auth.userId)) {
    return res.status(403).json({ ok: false, error: { code: 'forbidden', message: 'Access denied' } });
  }
  if (!file.has_thumbnail) {
    return res.status(404).json({ ok: false, error: { code: 'no_thumbnail', message: 'No thumbnail' } });
  }
  const abs = fileService.thumbPath(fileService.absPath(file.path));
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ ok: false, error: { code: 'not_found_on_disk', message: 'Thumbnail missing' } });
  }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(abs).pipe(res);
});

module.exports = router;
