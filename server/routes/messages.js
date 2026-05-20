const express = require('express');
const router = express.Router();
const config = require('../../config');
const { requireUser } = require('../auth');
const messageService = require('../services/messageService');

// GET /api/messages?peerId=&before=&limit=
router.get('/', requireUser, (req, res) => {
  const { peerId, before, limit } = req.query;
  if (!peerId) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'invalid_request', message: 'peerId required' } });
  }
  const list = messageService.listHistory({
    selfUserId: req.auth.userId,
    peerUserId: peerId,
    before,
    limit
  });
  res.json({ ok: true, data: list });
});

// GET /api/messages/missed?afterId=
router.get('/missed', requireUser, (req, res) => {
  const { afterId } = req.query;
  const list = messageService.listMissed({
    selfUserId: req.auth.userId,
    afterId
  });
  res.json({ ok: true, data: list });
});

// POST /api/messages/recall  body: { messageId }
router.post('/recall', requireUser, (req, res, next) => {
  try {
    const id = parseInt(req.body && req.body.messageId, 10);
    if (!id) {
      return res
        .status(400)
        .json({ ok: false, error: { code: 'invalid_request', message: 'messageId required' } });
    }
    const m = messageService.recallMessage({
      selfUserId: req.auth.userId,
      messageId: id,
      windowMs: config.recallWindowMs
    });
    // 通过 WS 推送给双方所有连接
    try {
      const { sendTo } = require('../ws');
      const payload = { type: 'recall', messageId: m.id };
      sendTo(m.toUserId, payload);
      sendTo(m.fromUserId, payload);
    } catch {}
    res.json({ ok: true, data: { messageId: m.id, recalled: true } });
  } catch (e) {
    next(e);
  }
});

// POST /api/messages/read  body: { peerId, lastReadMessageId }
router.post('/read', requireUser, (req, res) => {
  const { peerId, lastReadMessageId } = req.body || {};
  const lastId = parseInt(lastReadMessageId, 10);
  if (!peerId || !lastId) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'invalid_request', message: 'peerId and lastReadMessageId required' } });
  }
  const changed = messageService.markRead({
    selfUserId: req.auth.userId,
    peerUserId: peerId,
    lastReadMessageId: lastId
  });
  if (changed > 0) {
    try {
      const { sendTo } = require('../ws');
      sendTo(peerId, { type: 'read', peerId: req.auth.userId, lastReadMessageId: lastId });
    } catch {}
  }
  res.json({ ok: true, data: { updated: changed } });
});

module.exports = router;
