const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireUser } = require('../auth');

// GET /api/stickers  — 返回所有贴纸（登录用户可见）
router.get('/', requireUser, (req, res) => {
  const rows = getDb()
    .prepare('SELECT file_id, filename, mime, width, height, created_at FROM files WHERE scope = ? ORDER BY created_at DESC')
    .all('sticker');
  res.json({ ok: true, data: rows });
});

module.exports = router;
