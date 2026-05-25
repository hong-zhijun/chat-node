const { WebSocketServer } = require('ws');
const config = require('../config');
const { verifyToken } = require('./auth');
const { getDb } = require('./db');
const messageService = require('./services/messageService');

// userId -> Set<WebSocket>
const connections = new Map();

function addConnection(userId, ws) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId).add(ws);
}

function removeConnection(userId, ws) {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
}

function sendTo(userId, payload, excludeWs = null) {
  const set = connections.get(userId);
  if (!set) return 0;
  let n = 0;
  for (const ws of set) {
    if (ws === excludeWs) continue;
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
      n++;
    }
  }
  return n;
}

function getOnlineUserIds() {
  return Array.from(connections.keys());
}

function closeConnectionsByTokenId(tokenId) {
  let n = 0;
  for (const set of connections.values()) {
    for (const ws of set) {
      if (ws.tokenId === tokenId) {
        try { ws.close(4401, 'session revoked'); } catch {}
        n++;
      }
    }
  }
  return n;
}

function attachWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const token = u.searchParams.get('token');
    const payload = token && verifyToken(token);
    if (!payload || payload.type !== 'user') {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const db = getDb();
    const sess = db.prepare('SELECT revoked FROM sessions WHERE token_id = ?').get(payload.tokenId);
    if (!sess || sess.revoked) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const user = db.prepare('SELECT status FROM users WHERE user_id = ?').get(payload.userId);
    if (!user || user.status !== 1) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = payload.userId;
      ws.tokenId = payload.tokenId;
      ws.lastActiveAt = Date.now();
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    addConnection(ws.userId, ws);
    // 通知该用户其他设备：上线（可用于多端同步状态）
    // 这里暂不广播 presence；上线/下线后续再加

    ws.on('message', (raw) => {
      ws.lastActiveAt = Date.now();
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'bad_json', message: 'Invalid JSON' }));
        return;
      }
      handleClientMessage(ws, msg);
    });

    ws.on('pong', () => {
      ws.lastActiveAt = Date.now();
    });

    ws.on('close', () => {
      removeConnection(ws.userId, ws);
    });

    ws.on('error', () => {
      removeConnection(ws.userId, ws);
    });
  });

  const interval = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach((ws) => {
      if (now - (ws.lastActiveAt || 0) > config.ws.heartbeatTimeoutMs) {
        try { ws.terminate(); } catch {}
        return;
      }
      try { ws.ping(); } catch {}
    });
  }, config.ws.heartbeatIntervalMs);

  wss.on('close', () => clearInterval(interval));

  return wss;
}

function sendError(ws, code, message, extra = {}) {
  ws.send(JSON.stringify({ type: 'error', code, message, ...extra }));
}

function handleClientMessage(ws, msg) {
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    case 'send':
      return handleSend(ws, msg);
    case 'recall':
      return handleRecall(ws, msg);
    case 'read':
      return handleRead(ws, msg);
    case 'typing':
      return handleTyping(ws, msg);
    default:
      sendError(ws, 'unknown_type', `Unknown type: ${msg.type}`);
  }
}

function handleSend(ws, msg) {
  const { clientMsgId, to, msgType, content, replyToId } = msg;
  if (!to || typeof to !== 'string') return sendError(ws, 'invalid_to', 'to is required', { clientMsgId });
  if (to === ws.userId) return sendError(ws, 'invalid_to', 'cannot send to self', { clientMsgId });
  if (!['text', 'image', 'file', 'sticker'].includes(msgType)) {
    return sendError(ws, 'invalid_type', 'msgType must be text/image/file/sticker', { clientMsgId });
  }

  const db = getDb();
  const peer = db.prepare('SELECT status FROM users WHERE user_id = ?').get(to);
  if (!peer) return sendError(ws, 'peer_not_found', 'Peer not found', { clientMsgId });
  if (peer.status !== 1) return sendError(ws, 'peer_disabled', 'Peer is disabled', { clientMsgId });

  // 文字内容校验
  if (msgType === 'text') {
    if (typeof content !== 'string' || !content.trim()) {
      return sendError(ws, 'invalid_content', 'content must be non-empty string', { clientMsgId });
    }
    if (content.length > 8000) {
      return sendError(ws, 'content_too_long', 'content too long', { clientMsgId });
    }
  } else if (msgType === 'sticker') {
    // 贴纸：只需校验 fileId 存在且 scope='sticker'，不限制 owner（全局共享库）
    if (!content || typeof content !== 'object' || !content.fileId) {
      return sendError(ws, 'invalid_content', 'content.fileId required', { clientMsgId });
    }
    const fileService = require('./services/fileService');
    const file = fileService.findByFileId(content.fileId);
    if (!file) return sendError(ws, 'file_not_found', 'Sticker not found', { clientMsgId });
    if (file.scope !== 'sticker') return sendError(ws, 'invalid_file_scope', 'File is not a sticker', { clientMsgId });
    // 规范 content
    content.fileId = file.file_id;
    if (file.width) content.width = file.width;
    if (file.height) content.height = file.height;
  } else {
    if (!content || typeof content !== 'object' || !content.fileId) {
      return sendError(ws, 'invalid_content', 'content.fileId required', { clientMsgId });
    }
    const fileService = require('./services/fileService');
    const file = fileService.findByFileId(content.fileId);
    if (!file) return sendError(ws, 'file_not_found', 'File not found', { clientMsgId });
    if (file.scope !== 'chat') return sendError(ws, 'invalid_file_scope', 'File scope must be chat', { clientMsgId });
    if (file.owner_user_id !== ws.userId) {
      return sendError(ws, 'forbidden_file', 'File does not belong to sender', { clientMsgId });
    }
    if (msgType === 'image' && !fileService.isImage(file.mime)) {
      return sendError(ws, 'not_an_image', 'File is not an image', { clientMsgId });
    }
    // 规范 content：以 DB 中的为准
    content.fileId = file.file_id;
    content.filename = file.filename;
    content.size = file.size;
    content.mime = file.mime;
    if (file.width) content.width = file.width;
    if (file.height) content.height = file.height;
  }

  // 校验 replyToId：必须存在且属于当前对话双方；否则降级为普通消息（不报错）
  let validReplyToId = null;
  if (replyToId) {
    const rid = parseInt(replyToId, 10);
    if (rid) {
      const r = db
        .prepare('SELECT from_user_id, to_user_id FROM messages WHERE id = ?')
        .get(rid);
      if (r &&
          ((r.from_user_id === ws.userId && r.to_user_id === to) ||
           (r.from_user_id === to && r.to_user_id === ws.userId))) {
        validReplyToId = rid;
      }
    }
  }

  // 幂等：clientMsgId 已存在 → 视为重复，回 ack
  if (clientMsgId) {
    const existing = messageService.findByClientMsgId(
      clientMsgId,
      ws.userId,
      config.ws.clientMsgIdDedupWindowMs
    );
    if (existing) {
      ws.send(JSON.stringify({
        type: 'ack',
        clientMsgId,
        messageId: existing.id,
        createdAt: existing.createdAt,
        duplicate: true
      }));
      return;
    }
  }

  let saved;
  try {
    saved = messageService.insertMessage({
      fromUserId: ws.userId,
      toUserId: to,
      type: msgType,
      content,
      clientMsgId: clientMsgId || null,
      replyToId: validReplyToId
    });
  } catch (e) {
    // 并发下 client_msg_id UNIQUE 冲突
    if (e && /UNIQUE/.test(String(e.message))) {
      const existing = messageService.findByClientMsgId(
        clientMsgId,
        ws.userId,
        config.ws.clientMsgIdDedupWindowMs
      );
      if (existing) {
        ws.send(JSON.stringify({
          type: 'ack',
          clientMsgId,
          messageId: existing.id,
          createdAt: existing.createdAt,
          duplicate: true
        }));
        return;
      }
    }
    console.error('[ws send] failed', e);
    return sendError(ws, 'internal', 'Failed to save message', { clientMsgId });
  }

  // ack -> 发送方当前连接
  ws.send(JSON.stringify({
    type: 'ack',
    clientMsgId: saved.clientMsgId,
    messageId: saved.id,
    createdAt: saved.createdAt
  }));

  // message -> 接收方所有连接
  sendTo(to, { type: 'message', data: saved });
  // message -> 发送方除当前外的连接（多端同步）
  sendTo(ws.userId, { type: 'message', data: saved }, ws);

  // bark 推送（异步，不阻塞主流程）
  pushBark(saved, ws.userId).catch(() => {});
}

async function pushBark(saved, fromUserId) {
  const { sendBarkPush } = require('./services/barkService');
  const { get: getConfig } = require('./services/configService');
  const db = getDb();

  // 查接收方的 bark_key
  const receiver = db.prepare('SELECT bark_key FROM users WHERE user_id = ?').get(saved.toUserId);
  if (!receiver || !receiver.bark_key) return;

  // 查发送方名字
  const sender = db.prepare('SELECT name FROM users WHERE user_id = ?').get(fromUserId);
  const senderName = sender ? sender.name : fromUserId;

  let body;
  if (saved.type === 'text') {
    const text = typeof saved.content === 'string' ? saved.content : String(saved.content);
    body = text.length > 80 ? text.slice(0, 80) + '…' : text;
  } else if (saved.type === 'image') {
    body = '[图片]';
  } else if (saved.type === 'sticker') {
    body = '[表情包]';
  } else {
    const filename = saved.content?.filename || '文件';
    body = `[文件] ${filename}`;
  }

  // 从缓存读取系统配置（无 DB 查询开销）
  const icon     = getConfig('bark_icon')      || null;
  const clickUrl = getConfig('bark_click_url') || null;

  await sendBarkPush(receiver.bark_key, {
    title: senderName,
    body,
    group: 'Nodex',
    icon,
    clickUrl
  });
}

function handleRecall(ws, msg) {
  const id = parseInt(msg.messageId, 10);
  if (!id) return sendError(ws, 'invalid_request', 'messageId required');
  try {
    const m = messageService.recallMessage({
      selfUserId: ws.userId,
      messageId: id,
      windowMs: config.recallWindowMs
    });
    const payload = { type: 'recall', messageId: m.id };
    sendTo(m.toUserId, payload);
    sendTo(m.fromUserId, payload);
  } catch (e) {
    sendError(ws, e.code || 'internal', e.message || 'recall failed');
  }
}

function handleRead(ws, msg) {
  const peerId = msg.peerId;
  const lastId = parseInt(msg.lastMessageId, 10);
  if (!peerId || !lastId) return sendError(ws, 'invalid_request', 'peerId and lastMessageId required');
  const changed = messageService.markRead({
    selfUserId: ws.userId,
    peerUserId: peerId,
    lastReadMessageId: lastId
  });
  if (changed > 0) {
    sendTo(peerId, { type: 'read', peerId: ws.userId, lastReadMessageId: lastId });
  }
}

function handleTyping(ws, msg) {
  const peerId = msg.peerId;
  if (!peerId) return;
  sendTo(peerId, { type: 'typing', peerId: ws.userId });
}

module.exports = {
  attachWebSocketServer,
  sendTo,
  getOnlineUserIds,
  addConnection,
  removeConnection,
  closeConnectionsByTokenId
};
