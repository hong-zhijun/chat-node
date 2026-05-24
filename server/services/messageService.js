const { getDb } = require('../db');

function pairKey(a, b) {
  return a < b ? [a, b] : [b, a];
}

function buildReplyPreview(row) {
  if (!row) return null;
  let preview = '';
  if (row.recalled) {
    preview = '[消息已撤回]';
  } else if (row.type === 'text') {
    preview = (row.content || '').slice(0, 80);
  } else if (row.type === 'image') {
    preview = '[图片]';
  } else if (row.type === 'file') {
    let filename = '';
    try { filename = (JSON.parse(row.content) || {}).filename || ''; } catch {}
    preview = filename ? `[文件] ${filename}` : '[文件]';
  }
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    type: row.type,
    preview,
    recalled: !!row.recalled
  };
}

function loadReplyTo(replyToId) {
  if (!replyToId) return null;
  const row = getDb()
    .prepare('SELECT id, from_user_id, type, content, recalled FROM messages WHERE id = ?')
    .get(replyToId);
  return buildReplyPreview(row);
}

function rowToMessage(row) {
  if (!row) return null;
  let content = row.content;
  if (row.type !== 'text') {
    try { content = JSON.parse(row.content); } catch {}
  }
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    type: row.type,
    content,
    clientMsgId: row.client_msg_id,
    createdAt: row.created_at,
    recalled: !!row.recalled,
    readAt: row.read_at,
    replyTo: loadReplyTo(row.reply_to_id)
  };
}

function findByClientMsgId(clientMsgId, fromUserId, withinMs) {
  if (!clientMsgId) return null;
  const since = Date.now() - withinMs;
  const row = getDb()
    .prepare(
      `SELECT * FROM messages
       WHERE client_msg_id = ? AND from_user_id = ? AND created_at >= ?`
    )
    .get(clientMsgId, fromUserId, since);
  return rowToMessage(row);
}

function findById(id) {
  return rowToMessage(getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id));
}

function insertMessage({ fromUserId, toUserId, type, content, clientMsgId, replyToId }) {
  const db = getDb();
  const now = Date.now();
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO messages (from_user_id, to_user_id, type, content, client_msg_id, created_at, reply_to_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(fromUserId, toUserId, type, contentStr, clientMsgId || null, now, replyToId || null);

    const [a, b] = pairKey(fromUserId, toUserId);
    db.prepare(
      `INSERT INTO conversations (user_a_id, user_b_id, last_message_id, last_message_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_a_id, user_b_id) DO UPDATE SET
         last_message_id = excluded.last_message_id,
         last_message_at = excluded.last_message_at`
    ).run(a, b, info.lastInsertRowid, now);

    // 新消息到来时，取消接收方对该会话的隐藏
    db.prepare(
      'DELETE FROM conversation_hidden WHERE user_id = ? AND peer_id = ?'
    ).run(toUserId, fromUserId);

    return info.lastInsertRowid;
  });

  const id = tx();
  return findById(id);
}

function listHistory({ selfUserId, peerUserId, before, limit }) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const beforeId = parseInt(before, 10);
  const db = getDb();
  const rows = beforeId
    ? db
        .prepare(
          `SELECT * FROM messages
           WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
             AND id < ?
           ORDER BY id DESC LIMIT ?`
        )
        .all(selfUserId, peerUserId, peerUserId, selfUserId, beforeId, lim)
    : db
        .prepare(
          `SELECT * FROM messages
           WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
           ORDER BY id DESC LIMIT ?`
        )
        .all(selfUserId, peerUserId, peerUserId, selfUserId, lim);
  return rows.map(rowToMessage);
}

function listMissed({ selfUserId, afterId }) {
  const aid = parseInt(afterId, 10) || 0;
  const rows = getDb()
    .prepare(
      `SELECT * FROM messages
       WHERE to_user_id = ? AND id > ?
       ORDER BY id ASC LIMIT 500`
    )
    .all(selfUserId, aid);
  return rows.map(rowToMessage);
}

function listConversations(selfUserId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.user_a_id, c.user_b_id, c.last_message_id, c.last_message_at,
              m.from_user_id AS m_from, m.to_user_id AS m_to, m.type AS m_type,
              m.content AS m_content, m.recalled AS m_recalled
       FROM conversations c
       LEFT JOIN messages m ON m.id = c.last_message_id
       WHERE (c.user_a_id = ? OR c.user_b_id = ?)
       ORDER BY c.last_message_at DESC`
    )
    .all(selfUserId, selfUserId);

  const hiddenRows = db
    .prepare('SELECT peer_id, hidden_at FROM conversation_hidden WHERE user_id = ?')
    .all(selfUserId);
  const hiddenMap = new Map(hiddenRows.map((r) => [r.peer_id, r.hidden_at]));

  const result = [];
  for (const r of rows) {
    const peerId = r.user_a_id === selfUserId ? r.user_b_id : r.user_a_id;
    const hiddenAt = hiddenMap.get(peerId);
    if (hiddenAt && r.last_message_at <= hiddenAt) continue;

    const peer = db
      .prepare('SELECT user_id, name FROM users WHERE user_id = ?')
      .get(peerId);
    if (!peer) continue;

    const unread = db
      .prepare(
        `SELECT COUNT(*) AS n FROM messages
         WHERE from_user_id = ? AND to_user_id = ? AND read_at IS NULL AND recalled = 0`
      )
      .get(peerId, selfUserId).n;

    let preview = '';
    if (r.last_message_id) {
      if (r.m_recalled) {
        preview = '[已撤回]';
      } else if (r.m_type === 'text') {
        preview = r.m_content || '';
      } else if (r.m_type === 'image') {
        preview = '[图片]';
      } else if (r.m_type === 'file') {
        preview = '[文件]';
      }
    }

    result.push({
      peer: { userId: peer.user_id, name: peer.name },
      lastMessageId: r.last_message_id,
      lastMessageAt: r.last_message_at,
      preview: typeof preview === 'string' ? preview.slice(0, 100) : '',
      unread
    });
  }
  return result;
}

function hideConversation(selfUserId, peerUserId) {
  getDb()
    .prepare(
      `INSERT INTO conversation_hidden (user_id, peer_id, hidden_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, peer_id) DO UPDATE SET hidden_at = excluded.hidden_at`
    )
    .run(selfUserId, peerUserId, Date.now());
}

function markRead({ selfUserId, peerUserId, lastReadMessageId }) {
  const now = Date.now();
  const info = getDb()
    .prepare(
      `UPDATE messages
       SET read_at = ?
       WHERE from_user_id = ? AND to_user_id = ?
         AND id <= ? AND read_at IS NULL`
    )
    .run(now, peerUserId, selfUserId, lastReadMessageId);
  return info.changes;
}

function recallMessage({ selfUserId, messageId, windowMs }) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!row) {
    const e = new Error('message not found'); e.status = 404; e.code = 'not_found'; throw e;
  }
  if (row.from_user_id !== selfUserId) {
    const e = new Error('not allowed'); e.status = 403; e.code = 'forbidden'; throw e;
  }
  if (Date.now() - row.created_at > windowMs) {
    const e = new Error('recall window expired'); e.status = 400; e.code = 'recall_expired'; throw e;
  }
  if (row.recalled) return rowToMessage(row);
  db.prepare('UPDATE messages SET recalled = 1 WHERE id = ?').run(messageId);
  return rowToMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId));
}

module.exports = {
  findById,
  findByClientMsgId,
  insertMessage,
  listHistory,
  listMissed,
  listConversations,
  hideConversation,
  markRead,
  recallMessage
};
