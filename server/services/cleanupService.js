const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { absPath, thumbPath } = require('./fileService');
const { getOnlineUserIds } = require('../ws');
const config = require('../../config');

// ---- stats ----
function getStats() {
  const db = getDb();
  const totalUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const totalMessages = db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
  const storageRow = db
    .prepare(`SELECT scope, COALESCE(SUM(size), 0) AS bytes FROM files GROUP BY scope`)
    .all();
  const storage = { chat: 0, share: 0 };
  for (const r of storageRow) storage[r.scope] = r.bytes;

  return {
    onlineUsers: getOnlineUserIds().length,
    totalUsers,
    totalMessages,
    storage: {
      chatBytes: storage.chat,
      shareBytes: storage.share,
      totalBytes: storage.chat + storage.share
    }
  };
}

// ---- messages cleanup ----
function buildMessageWhere({ beforeTimestamp, userId }) {
  const conds = [];
  const params = [];
  if (beforeTimestamp) {
    conds.push('created_at < ?');
    params.push(parseInt(beforeTimestamp, 10));
  }
  if (userId) {
    conds.push('(from_user_id = ? OR to_user_id = ?)');
    params.push(userId, userId);
  }
  return {
    where: conds.length ? 'WHERE ' + conds.join(' AND ') : '',
    params
  };
}

function previewMessageCleanup({ beforeTimestamp, userId }) {
  const { where, params } = buildMessageWhere({ beforeTimestamp, userId });
  if (!where) {
    const e = new Error('refuse to clean all messages without filter');
    e.status = 400; e.code = 'no_filter'; throw e;
  }
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM messages ${where}`).get(...params);
  return { count: row.n };
}

function executeMessageCleanup({ beforeTimestamp, userId }) {
  const { where, params } = buildMessageWhere({ beforeTimestamp, userId });
  if (!where) {
    const e = new Error('refuse to clean all messages without filter');
    e.status = 400; e.code = 'no_filter'; throw e;
  }
  const db = getDb();
  let deleted = 0;
  const tx = db.transaction(() => {
    const info = db.prepare(`DELETE FROM messages ${where}`).run(...params);
    deleted = info.changes;
    // 修复 conversations.last_message_id：被删的最后一条要重新指向剩余的最后一条；若没剩则删 conversation
    repairConversations();
  });
  tx();
  return { deleted };
}

function repairConversations() {
  const db = getDb();
  const convs = db.prepare('SELECT id, user_a_id, user_b_id, last_message_id FROM conversations').all();
  for (const c of convs) {
    if (!c.last_message_id) continue;
    const exists = db.prepare('SELECT 1 FROM messages WHERE id = ?').get(c.last_message_id);
    if (exists) continue;
    const last = db.prepare(
      `SELECT id, created_at FROM messages
       WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
       ORDER BY id DESC LIMIT 1`
    ).get(c.user_a_id, c.user_b_id, c.user_b_id, c.user_a_id);
    if (last) {
      db.prepare('UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?')
        .run(last.id, last.created_at, c.id);
    } else {
      db.prepare('DELETE FROM conversations WHERE id = ?').run(c.id);
    }
  }
}

// ---- files cleanup ----
function buildFileWhere({ beforeTimestamp, minSizeBytes, scope }) {
  const conds = [];
  const params = [];
  if (beforeTimestamp) {
    conds.push('created_at < ?');
    params.push(parseInt(beforeTimestamp, 10));
  }
  if (minSizeBytes) {
    conds.push('size >= ?');
    params.push(parseInt(minSizeBytes, 10));
  }
  if (scope) {
    const scopes = Array.isArray(scope) ? scope : [scope];
    const filtered = scopes.filter((s) => s === 'chat' || s === 'share');
    if (filtered.length === 0) {
      const e = new Error('invalid scope'); e.status = 400; e.code = 'invalid_scope'; throw e;
    }
    conds.push(`scope IN (${filtered.map(() => '?').join(',')})`);
    params.push(...filtered);
  }
  return {
    where: conds.length ? 'WHERE ' + conds.join(' AND ') : '',
    params
  };
}

function previewFileCleanup({ beforeTimestamp, minSizeBytes, scope }) {
  const { where, params } = buildFileWhere({ beforeTimestamp, minSizeBytes, scope });
  if (!where) {
    const e = new Error('refuse to clean all files without filter');
    e.status = 400; e.code = 'no_filter'; throw e;
  }
  const db = getDb();
  const summary = db.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS totalBytes FROM files ${where}`
  ).get(...params);
  const samples = db.prepare(
    `SELECT file_id, filename, size, scope, created_at FROM files ${where}
     ORDER BY size DESC LIMIT 50`
  ).all(...params).map((r) => ({
    fileId: r.file_id, filename: r.filename, size: r.size, scope: r.scope, createdAt: r.created_at
  }));
  return { count: summary.count, totalBytes: summary.totalBytes, samples };
}

function executeFileCleanup({ beforeTimestamp, minSizeBytes, scope }) {
  const { where, params } = buildFileWhere({ beforeTimestamp, minSizeBytes, scope });
  if (!where) {
    const e = new Error('refuse to clean all files without filter');
    e.status = 400; e.code = 'no_filter'; throw e;
  }
  const db = getDb();
  const targets = db.prepare(
    `SELECT id, file_id, scope, path, has_thumbnail, filename FROM files ${where}`
  ).all(...params);

  let deletedRows = 0, deletedBytes = 0, replacedMessages = 0;

  const tx = db.transaction(() => {
    for (const f of targets) {
      // 1) 删磁盘文件 + 缩略图
      try {
        const abs = absPath(f.path);
        const stat = fs.statSync(abs);
        deletedBytes += stat.size;
        fs.unlinkSync(abs);
      } catch {}
      if (f.has_thumbnail) {
        try { fs.unlinkSync(thumbPath(absPath(f.path))); } catch {}
      }

      // 2) 对 chat 范围：把消息 content 改占位
      if (f.scope === 'chat') {
        const placeholder = JSON.stringify({ deleted: true, filename: f.filename });
        const info = db.prepare(
          `UPDATE messages SET content = ?
           WHERE (type = 'image' OR type = 'file') AND content LIKE ?`
        ).run(placeholder, `%"${f.file_id}"%`);
        replacedMessages += info.changes;
      }

      // 3) 删 files 行
      db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
      deletedRows += 1;
    }
  });
  tx();
  return { deleted: deletedRows, freedBytes: deletedBytes, replacedMessages };
}

module.exports = {
  getStats,
  previewMessageCleanup,
  executeMessageCleanup,
  previewFileCleanup,
  executeFileCleanup
};
