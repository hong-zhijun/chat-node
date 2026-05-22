const express = require('express');
const router = express.Router();

const { getDb } = require('../db');
const { requireUser } = require('../auth');

// GET /api/fillers  → 返回所有 filler 文案（登录用户可访问）
router.get('/', requireUser, (req, res) => {
  const rows = getDb()
    .prepare('SELECT id, content FROM ai_fillers ORDER BY id ASC')
    .all();
  res.json({ ok: true, data: rows });
});

module.exports = router;
