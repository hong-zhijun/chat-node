// 端到端测试：第二步（WS 文字消息 + 会话列表 + 历史 + 撤回 + 已读 + 多端同步 + 幂等）
const WebSocket = require('ws');

const BASE = 'http://localhost:3000';
const WS_BASE = 'ws://localhost:3000/ws';
const ADMIN_KEY = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';

async function http(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

function connectWs(token, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}?token=${token}`);
    ws.events = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      ws.events.push(m);
      // console.log(`[${label}] <-`, m);
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

async function waitFor(ws, predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const e = ws.events.find(predicate);
    if (e) return e;
    await delay(20);
  }
  throw new Error(`timeout waiting; events=${JSON.stringify(ws.events)}`);
}

function assert(cond, msg) {
  if (!cond) { throw new Error('ASSERT: ' + msg); }
  console.log('  ✓', msg);
}

async function main() {
  console.log('== admin login ==');
  const adm = await http('POST', '/api/admin/login', { body: { adminKey: ADMIN_KEY } });
  assert(adm.data.ok, 'admin login ok');
  const adminToken = adm.data.data.token;

  console.log('== create Alice / Bob ==');
  const a = await http('POST', '/api/admin/users', { token: adminToken, body: { name: 'Alice' } });
  const b = await http('POST', '/api/admin/users', { token: adminToken, body: { name: 'Bob' } });
  assert(a.data.ok && b.data.ok, 'users created');
  const aliceUid = a.data.data.userId, bobUid = b.data.data.userId;

  console.log('== login both ==');
  const la = await http('POST', '/api/auth/login', { body: { loginKey: a.data.data.loginKey } });
  const lb = await http('POST', '/api/auth/login', { body: { loginKey: b.data.data.loginKey } });
  const aliceToken = la.data.data.token, bobToken = lb.data.data.token;

  console.log('== WS connect (alice 2 设备, bob 1 设备) ==');
  const alice1 = await connectWs(aliceToken, 'alice1');
  const alice2 = await connectWs(aliceToken, 'alice2');
  const bob1 = await connectWs(bobToken, 'bob1');

  console.log('== ping / pong ==');
  send(alice1, { type: 'ping' });
  const pong = await waitFor(alice1, (e) => e.type === 'pong');
  assert(pong.type === 'pong', 'pong received');

  console.log('== alice1 -> bob (text) ==');
  send(alice1, {
    type: 'send',
    clientMsgId: 'cmid-1',
    to: bobUid,
    msgType: 'text',
    content: 'hello bob'
  });
  const ack1 = await waitFor(alice1, (e) => e.type === 'ack' && e.clientMsgId === 'cmid-1');
  assert(ack1.messageId > 0, `alice1 got ack messageId=${ack1.messageId}`);
  const msgOnBob = await waitFor(bob1, (e) => e.type === 'message' && e.data.id === ack1.messageId);
  assert(msgOnBob.data.content === 'hello bob', 'bob received message');
  const msgOnAlice2 = await waitFor(alice2, (e) => e.type === 'message' && e.data.id === ack1.messageId);
  assert(msgOnAlice2.data.fromUserId === aliceUid, 'alice2 multi-device sync received');
  assert(
    !alice1.events.find((e) => e.type === 'message' && e.data.id === ack1.messageId),
    'alice1 (origin) did NOT get the message broadcast'
  );

  console.log('== idempotent resend with same clientMsgId ==');
  send(alice1, { type: 'send', clientMsgId: 'cmid-1', to: bobUid, msgType: 'text', content: 'hello bob' });
  const ack1b = await waitFor(alice1, (e) => e.type === 'ack' && e.clientMsgId === 'cmid-1' && e.duplicate);
  assert(ack1b.messageId === ack1.messageId, 'duplicate ack returns same messageId');

  console.log('== bob -> alice (text), both alice devices receive ==');
  send(bob1, { type: 'send', clientMsgId: 'cmid-2', to: aliceUid, msgType: 'text', content: 'hi alice' });
  const ackB = await waitFor(bob1, (e) => e.type === 'ack' && e.clientMsgId === 'cmid-2');
  await waitFor(alice1, (e) => e.type === 'message' && e.data.id === ackB.messageId);
  await waitFor(alice2, (e) => e.type === 'message' && e.data.id === ackB.messageId);
  assert(true, 'both alice devices got bob message');

  console.log('== invalid send: self ==');
  send(alice1, { type: 'send', clientMsgId: 'cmid-self', to: aliceUid, msgType: 'text', content: 'x' });
  await waitFor(alice1, (e) => e.type === 'error' && e.code === 'invalid_to');
  assert(true, 'self-send rejected');

  console.log('== invalid send: peer not exists ==');
  send(alice1, { type: 'send', clientMsgId: 'cmid-x', to: '000000', msgType: 'text', content: 'x' });
  await waitFor(alice1, (e) => e.type === 'error' && e.code === 'peer_not_found');
  assert(true, 'unknown peer rejected');

  console.log('== invalid send: empty text ==');
  send(alice1, { type: 'send', clientMsgId: 'cmid-y', to: bobUid, msgType: 'text', content: '   ' });
  await waitFor(alice1, (e) => e.type === 'error' && e.code === 'invalid_content');
  assert(true, 'empty text rejected');

  console.log('== conversations list (alice) ==');
  const conv = await http('GET', '/api/conversations', { token: aliceToken });
  assert(conv.data.ok, 'conv ok');
  assert(conv.data.data.length === 1, 'one conversation with bob');
  assert(conv.data.data[0].peer.userId === bobUid, 'peer is bob');
  assert(conv.data.data[0].unread === 1, `unread = 1 (got ${conv.data.data[0].unread})`);
  assert(conv.data.data[0].preview === 'hi alice', `preview "${conv.data.data[0].preview}"`);

  console.log('== history pagination ==');
  // 多发几条
  for (let i = 0; i < 5; i++) {
    send(alice1, { type: 'send', clientMsgId: `bulk-${i}`, to: bobUid, msgType: 'text', content: `bulk ${i}` });
    await waitFor(alice1, (e) => e.type === 'ack' && e.clientMsgId === `bulk-${i}`);
  }
  const page1 = await http('GET', `/api/messages?peerId=${bobUid}&limit=3`, { token: aliceToken });
  assert(page1.data.data.length === 3, `page1 length 3 (got ${page1.data.data.length})`);
  const lastId = page1.data.data[page1.data.data.length - 1].id;
  const page2 = await http('GET', `/api/messages?peerId=${bobUid}&limit=3&before=${lastId}`, { token: aliceToken });
  assert(page2.data.data.length === 3, 'page2 length 3');
  assert(page2.data.data[0].id < lastId, 'page2 before lastId');

  console.log('== read receipt ==');
  // alice 标记跟 bob 的会话已读到最新
  const allWithBob = await http('GET', `/api/messages?peerId=${bobUid}&limit=50`, { token: aliceToken });
  const latestFromBob = allWithBob.data.data.find((m) => m.fromUserId === bobUid);
  assert(latestFromBob, 'found a msg from bob');
  send(alice1, { type: 'read', peerId: bobUid, lastMessageId: latestFromBob.id });
  const readEvt = await waitFor(bob1, (e) => e.type === 'read' && e.peerId === aliceUid);
  assert(readEvt.lastReadMessageId === latestFromBob.id, 'bob received read receipt');
  const conv2 = await http('GET', '/api/conversations', { token: aliceToken });
  assert(conv2.data.data[0].unread === 0, 'unread cleared');

  console.log('== recall (within window) ==');
  send(alice1, { type: 'send', clientMsgId: 'cmid-recall', to: bobUid, msgType: 'text', content: 'oops' });
  const ackR = await waitFor(alice1, (e) => e.type === 'ack' && e.clientMsgId === 'cmid-recall');
  // 等 bob 收到
  await waitFor(bob1, (e) => e.type === 'message' && e.data.id === ackR.messageId);
  send(alice1, { type: 'recall', messageId: ackR.messageId });
  await waitFor(bob1, (e) => e.type === 'recall' && e.messageId === ackR.messageId);
  await waitFor(alice2, (e) => e.type === 'recall' && e.messageId === ackR.messageId);
  assert(true, 'recall pushed to both sides');

  console.log('== recall: not own message → 403 ==');
  const r403 = await http('POST', '/api/messages/recall', {
    token: bobToken,
    body: { messageId: ackR.messageId } // bob 撤回 alice 的消息
  });
  assert(r403.status === 403, `not-own recall 403 (got ${r403.status})`);

  console.log('== hide conversation, list empty until new msg ==');
  await http('DELETE', `/api/conversations/${bobUid}`, { token: aliceToken });
  const convHidden = await http('GET', '/api/conversations', { token: aliceToken });
  assert(convHidden.data.data.length === 0, 'hidden conv not shown');
  // bob 再发一条，应该重现
  send(bob1, { type: 'send', clientMsgId: 'after-hide', to: aliceUid, msgType: 'text', content: 'still there?' });
  await waitFor(alice1, (e) => e.type === 'message' && e.data.content === 'still there?');
  const convBack = await http('GET', '/api/conversations', { token: aliceToken });
  assert(convBack.data.data.length === 1, 'conv reappeared after new msg');

  console.log('== missed messages after reconnect ==');
  // 记录当前最大 messageId
  const beforeId = (await http('GET', `/api/messages?peerId=${bobUid}&limit=1`, { token: aliceToken })).data.data[0].id;
  // 断开 alice1, bob 再发几条
  alice1.close();
  alice2.close();
  await delay(100);
  for (let i = 0; i < 3; i++) {
    send(bob1, { type: 'send', clientMsgId: `off-${i}`, to: aliceUid, msgType: 'text', content: `offline-${i}` });
    await waitFor(bob1, (e) => e.type === 'ack' && e.clientMsgId === `off-${i}`);
  }
  const missed = await http('GET', `/api/messages/missed?afterId=${beforeId}`, { token: aliceToken });
  assert(missed.data.data.length === 3, `missed 3 (got ${missed.data.data.length})`);
  assert(missed.data.data.every((m) => m.toUserId === aliceUid && m.id > beforeId), 'missed only to alice and > beforeId');

  console.log('\n✅ ALL TESTS PASSED');

  bob1.close();
}

main().catch((e) => {
  console.error('❌ TEST FAILED:', e);
  process.exit(1);
});
