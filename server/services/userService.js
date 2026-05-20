const { getDb } = require('../db');
const { generateUserId, generateLoginKey } = require('../utils/id');

const USER_ID_RE = /^[0-9]{6}$/;

function findByLoginKey(loginKey) {
  return getDb()
    .prepare('SELECT id, user_id, name, status FROM users WHERE login_key = ?')
    .get(loginKey);
}

function findByUserId(userId) {
  return getDb()
    .prepare('SELECT id, user_id, name, status, created_at FROM users WHERE user_id = ?')
    .get(userId);
}

function listUsers() {
  return getDb()
    .prepare(
      'SELECT user_id, name, login_key, status, created_at, bark_key FROM users ORDER BY created_at DESC'
    )
    .all();
}

function createUser({ name, userId, loginKey } = {}) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    const e = new Error('name is required');
    e.status = 400;
    e.code = 'invalid_name';
    throw e;
  }
  const db = getDb();

  let finalUserId = userId;
  if (finalUserId) {
    if (!USER_ID_RE.test(finalUserId)) {
      const e = new Error('userId must be 6 digits');
      e.status = 400;
      e.code = 'invalid_user_id';
      throw e;
    }
    if (findByUserId(finalUserId)) {
      const e = new Error('userId already exists');
      e.status = 409;
      e.code = 'user_id_taken';
      throw e;
    }
  } else {
    finalUserId = uniqueGeneratedUserId(db);
  }

  const finalLoginKey = loginKey || generateLoginKey();
  if (
    db.prepare('SELECT 1 FROM users WHERE login_key = ?').get(finalLoginKey)
  ) {
    const e = new Error('loginKey already exists');
    e.status = 409;
    e.code = 'login_key_taken';
    throw e;
  }

  const now = Date.now();
  db.prepare(
    `INSERT INTO users (user_id, name, login_key, status, created_at)
     VALUES (?, ?, ?, 1, ?)`
  ).run(finalUserId, name.trim(), finalLoginKey, now);

  return {
    userId: finalUserId,
    name: name.trim(),
    loginKey: finalLoginKey,
    status: 1,
    createdAt: now
  };
}

function uniqueGeneratedUserId(db) {
  for (let i = 0; i < 20; i++) {
    const candidate = generateUserId();
    if (!db.prepare('SELECT 1 FROM users WHERE user_id = ?').get(candidate)) {
      return candidate;
    }
  }
  const e = new Error('failed to allocate user_id');
  e.status = 500;
  e.code = 'user_id_alloc_failed';
  throw e;
}

function updateUser(userId, { name, status, regenerateLoginKey, barkKey }) {
  const db = getDb();
  const u = findByUserId(userId);
  if (!u) {
    const e = new Error('user not found');
    e.status = 404;
    e.code = 'user_not_found';
    throw e;
  }

  const sets = [];
  const params = [];
  if (typeof name === 'string' && name.trim()) {
    sets.push('name = ?');
    params.push(name.trim());
  }
  if (status === 0 || status === 1) {
    sets.push('status = ?');
    params.push(status);
  }
  let newLoginKey = null;
  if (regenerateLoginKey) {
    newLoginKey = generateLoginKey();
    sets.push('login_key = ?');
    params.push(newLoginKey);
  }
  // barkKey: 传空字符串或 null 表示清除，传字符串则更新
  if (barkKey !== undefined) {
    sets.push('bark_key = ?');
    params.push(barkKey && barkKey.trim() ? barkKey.trim() : null);
  }
  if (sets.length === 0) return { userId };

  params.push(userId);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`).run(...params);

  // 禁用时把该用户所有 session 撤销
  if (status === 0) {
    db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').run(userId);
  }

  return { userId, loginKey: newLoginKey };
}

function deleteUser(userId) {
  const db = getDb();
  const u = findByUserId(userId);
  if (!u) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM messages WHERE from_user_id = ? OR to_user_id = ?').run(userId, userId);
    db.prepare('DELETE FROM conversations WHERE user_a_id = ? OR user_b_id = ?').run(userId, userId);
    db.prepare('DELETE FROM conversation_hidden WHERE user_id = ? OR peer_id = ?').run(userId, userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
  });
  tx();
  return true;
}

module.exports = {
  findByLoginKey,
  findByUserId,
  listUsers,
  createUser,
  updateUser,
  deleteUser
};
