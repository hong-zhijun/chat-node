const express = require('express');
const router = express.Router();
const { requireUser } = require('../auth');
const fileService = require('../services/fileService');

// GET /api/share?before=&limit=&q=
router.get('/', requireUser, (req, res) => {
  const list = fileService.listShare({
    before: req.query.before,
    limit: req.query.limit,
    q: req.query.q
  });
  res.json({ ok: true, data: list });
});

// DELETE /api/share/:fileId  —— 上传者或管理员
router.delete('/:fileId', requireUser, (req, res, next) => {
  try {
    fileService.deleteShareFile({
      fileId: req.params.fileId,
      requesterUserId: req.auth.userId,
      isAdmin: false
    });
    res.json({ ok: true, data: { deleted: true } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
