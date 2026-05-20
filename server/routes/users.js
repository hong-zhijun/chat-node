const express = require('express');
const router = express.Router();
const { requireUser } = require('../auth');
const userService = require('../services/userService');

// GET /api/users/:userId
router.get('/:userId', requireUser, (req, res) => {
  const u = userService.findByUserId(req.params.userId);
  if (!u || u.status !== 1) {
    return res
      .status(404)
      .json({ ok: false, error: { code: 'user_not_found', message: 'User not found' } });
  }
  res.json({ ok: true, data: { userId: u.user_id, name: u.name } });
});

module.exports = router;
