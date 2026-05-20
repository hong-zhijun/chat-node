const express = require('express');
const router = express.Router();
const { requireUser } = require('../auth');
const messageService = require('../services/messageService');

// GET /api/conversations
router.get('/', requireUser, (req, res) => {
  const list = messageService.listConversations(req.auth.userId);
  res.json({ ok: true, data: list });
});

// DELETE /api/conversations/:peerId  —— 仅自己侧隐藏
router.delete('/:peerId', requireUser, (req, res) => {
  messageService.hideConversation(req.auth.userId, req.params.peerId);
  res.json({ ok: true, data: { hidden: true } });
});

module.exports = router;
