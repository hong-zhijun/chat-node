const express = require('express');
const router = express.Router();

const { getDb } = require('../db');
const { signUserToken, requireUser } = require('../auth');
const { generateTokenId } = require('../utils/id');
const userService = require('../services/userService');

// POST /api/auth/login  body: { loginKey, deviceLabel? }
router.post('/login', (req, res) => {
  const { loginKey, deviceLabel } = req.body || {};
  if (!loginKey || typeof loginKey !== 'string') {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'invalid_request', message: 'loginKey required' } });
  }

  const user = userService.findByLoginKey(loginKey);
  if (!user) {
    return res
      .status(401)
      .json({ ok: false, error: { code: 'invalid_credentials', message: 'Invalid login key' } });
  }
  if (user.status !== 1) {
    return res
      .status(403)
      .json({ ok: false, error: { code: 'user_disabled', message: 'User is disabled' } });
  }

  const tokenId = generateTokenId();
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO sessions (token_id, user_id, device_label, created_at, last_active_at, revoked)
       VALUES (?, ?, ?, ?, ?, 0)`
    )
    .run(tokenId, user.user_id, deviceLabel || null, now, now);

  const token = signUserToken(user.user_id, tokenId);
  res.json({
    ok: true,
    data: {
      token,
      user: {
        userId: user.user_id,
        name: user.name,
        notifyBlink: user.notify_blink ?? 1,
        notifyUnread: user.notify_unread ?? 1,
        showFiller: user.show_filler ?? 1
      }
    }
  });
});

// POST /api/auth/logout
router.post('/logout', requireUser, (req, res) => {
  getDb().prepare('UPDATE sessions SET revoked = 1 WHERE token_id = ?').run(req.auth.tokenId);
  // 主动关闭该 token 对应的 WS 连接
  try {
    const { closeConnectionsByTokenId } = require('../ws');
    closeConnectionsByTokenId(req.auth.tokenId);
  } catch {}
  res.json({ ok: true, data: { loggedOut: true } });
});

// GET /api/auth/me
router.get('/me', requireUser, (req, res) => {
  const u = userService.findByUserId(req.auth.userId);
  if (!u) {
    return res
      .status(404)
      .json({ ok: false, error: { code: 'user_not_found', message: 'User not found' } });
  }
  res.json({
    ok: true,
    data: {
      userId: u.user_id,
      name: u.name,
      notifyBlink: u.notify_blink ?? 1,
      notifyUnread: u.notify_unread ?? 1,
      showFiller: u.show_filler ?? 1
    }
  });
});

// PATCH /api/auth/settings  body: { notifyBlink?, notifyUnread?, showFiller? }
router.patch('/settings', requireUser, (req, res) => {
  const { notifyBlink, notifyUnread, showFiller } = req.body || {};
  userService.updateMySettings(req.auth.userId, {
    notifyBlink: notifyBlink === 0 || notifyBlink === 1 ? notifyBlink : undefined,
    notifyUnread: notifyUnread === 0 || notifyUnread === 1 ? notifyUnread : undefined,
    showFiller: showFiller === 0 || showFiller === 1 ? showFiller : undefined
  });
  res.json({ ok: true, data: { notifyBlink, notifyUnread, showFiller } });
});

module.exports = router;
