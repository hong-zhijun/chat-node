// 端到端测试：第四步（后台 stats + 清理）
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const BASE = 'http://localhost:3000';
const WS_BASE = 'ws://localhost:3000/ws';
const ADMIN_KEY = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';

async function http(method, p, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let _body;
  if (body) { headers['Content-Type'] = 'application/json'; _body = JSON.stringify(body); }
  const res = await fetch(BASE + p, { method, headers, body: _body });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function uploadFile({ token, filePath, scope, mime, name }) {
  const form = new FormData();
  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: mime || 'application/octet-stream' });
  form.append('file', blob, name || path.basename(filePath));
  const res = await fetch(`${BASE}/api/files/upload?scope=${scope}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function connectWs(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}?token=${token}`);
    ws.events = [];
    ws.on('message', (raw) => ws.events.push(JSON.parse(raw.toString())));
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}
function send(ws, o) { ws.send(JSON.stringify(o)); }
async function waitFor(ws, predicate, timeoutMs = 2000) {
  const s = Date.now();
  while (Date.now() - s < timeoutMs) {
    const e = ws.events.find(predicate); if (e) return e;
    await delay(20);
  }
  throw new Error('timeout');
}
function assert(c, m) { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓', m); }

async function makePng(p, w, h, color) {
  const sharp = require('sharp');
  await sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toFile(p);
}

async function makeNoisyPng(p, w, h) {
  const sharp = require('sharp');
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(p);
}

async function main() {
  const admT = (await http('POST', '/api/admin/login', { body: { adminKey: ADMIN_KEY } })).data.data.token;
  const a = (await http('POST', '/api/admin/users', { token: admT, body: { name: 'Alice' } })).data.data;
  const b = (await http('POST', '/api/admin/users', { token: admT, body: { name: 'Bob' } })).data.data;
  const at = (await http('POST', '/api/auth/login', { body: { loginKey: a.loginKey } })).data.data.token;
  const bt = (await http('POST', '/api/auth/login', { body: { loginKey: b.loginKey } })).data.data.token;

  console.log('== stats: empty initial ==');
  const s0 = (await http('GET', '/api/admin/stats', { token: admT })).data.data;
  assert(s0.totalUsers === 2, `users=2 (got ${s0.totalUsers})`);
  assert(s0.totalMessages === 0, 'no messages');
  assert(s0.onlineUsers === 0, 'no online');
  assert(s0.storage.totalBytes === 0, 'no storage');

  console.log('== ws connect & messages ==');
  const aw = await connectWs(at);
  const bw = await connectWs(bt);

  // 发 5 条消息: alice→bob 各种时间。先发 2 条"旧"消息（手工改 created_at），再 3 条"新"消息
  for (let i = 0; i < 5; i++) {
    send(aw, { type: 'send', clientMsgId: `m${i}`, to: b.userId, msgType: 'text', content: `msg${i}` });
    await waitFor(aw, (e) => e.type === 'ack' && e.clientMsgId === `m${i}`);
  }
  // bob 发 2 条
  for (let i = 0; i < 2; i++) {
    send(bw, { type: 'send', clientMsgId: `bm${i}`, to: a.userId, msgType: 'text', content: `bmsg${i}` });
    await waitFor(bw, (e) => e.type === 'ack' && e.clientMsgId === `bm${i}`);
  }

  // 直接改前 4 条 created_at 设为很早，做"按时间清理"测试
  const Database = require('better-sqlite3');
  // 我们不直接打开 DB（服务端独占 WAL 模式没问题，但直接修改会绕过事务）。改用一个 admin 路径? 没有暴露。
  // 妥协：使用 fs 操作前停服务太重。换思路：使用 beforeTimestamp = now（清理所有 < now 的 = 全部），结合 userId 过滤。
  // 改用 userId 过滤 + 文件时间过滤来测。
  // 但 messages cleanup 仍可走 beforeTimestamp 测：用 now+1000 把全清掉，但这违反语义。
  // 折中：测两种过滤：(1) userId 过滤 alice 的消息总数；(2) beforeTimestamp = now+10s 表示"清理某时间之前"。
  const now = Date.now();

  console.log('== stats: after messages ==');
  const s1 = (await http('GET', '/api/admin/stats', { token: admT })).data.data;
  assert(s1.totalMessages === 7, `7 msgs (got ${s1.totalMessages})`);
  assert(s1.onlineUsers === 2, `2 online (got ${s1.onlineUsers})`);

  console.log('== msg cleanup preview: no filter rejected ==');
  const noFilter = await http('POST', '/api/admin/cleanup/messages/preview', { token: admT, body: {} });
  assert(noFilter.status === 400 && noFilter.data.error.code === 'no_filter', 'no filter blocked');

  console.log('== msg cleanup preview: userId=alice ==');
  const prevA = (await http('POST', '/api/admin/cleanup/messages/preview', { token: admT, body: { userId: a.userId } })).data.data;
  assert(prevA.count === 7, `alice涉及 7 条 (got ${prevA.count})`); // alice 是任意一方都算

  console.log('== msg cleanup preview: beforeTimestamp 远古 ==');
  const prevOld = (await http('POST', '/api/admin/cleanup/messages/preview', { token: admT, body: { beforeTimestamp: 1 } })).data.data;
  assert(prevOld.count === 0, '远古之前 0 条');

  console.log('== msg cleanup execute: beforeTimestamp=now+1h (会清掉全部 7 条) ==');
  // 但还需要先测 user 过滤 execute。先用一个仅删 bob 发起的消息的方法：userId=b.userId 会删 7 条（因为 bob 也参与了 alice→bob）
  // 改用更精确的：直接清理 beforeTimestamp = now-1，应该 0 条
  const execNone = (await http('POST', '/api/admin/cleanup/messages/execute', { token: admT, body: { beforeTimestamp: 1 } })).data.data;
  assert(execNone.deleted === 0, 'nothing deleted with old timestamp');

  // 真删: beforeTimestamp = now + 1h
  const execAll = (await http('POST', '/api/admin/cleanup/messages/execute', { token: admT, body: { beforeTimestamp: now + 3600_000 } })).data.data;
  assert(execAll.deleted === 7, `deleted 7 (got ${execAll.deleted})`);

  console.log('== conversations gone after cleanup ==');
  const convAlice = await http('GET', '/api/conversations', { token: at });
  assert(convAlice.data.data.length === 0, 'alice no conversations');

  console.log('== stats: messages = 0 ==');
  const s2 = (await http('GET', '/api/admin/stats', { token: admT })).data.data;
  assert(s2.totalMessages === 0, 'msgs=0');

  console.log('== upload files for cleanup tests ==');
  const tmpDir = path.join(require('os').tmpdir(), 'chat-node-step4');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const big = path.join(tmpDir, 'big.png');
  const small = path.join(tmpDir, 'small.png');
  await makeNoisyPng(big, 200, 200);
  await makePng(small, 16, 16, { r: 1, g: 2, b: 3 });
  const bigSize = fs.statSync(big).size;
  const smallSize = fs.statSync(small).size;

  // alice 上传 chat 图片 → 发给 bob，使消息引用它
  const upBigChat = (await uploadFile({ token: at, filePath: big, scope: 'chat', mime: 'image/png' })).data.data;
  send(aw, { type: 'send', clientMsgId: 'cm-bigchat', to: b.userId, msgType: 'image', content: { fileId: upBigChat.fileId } });
  await waitFor(aw, (e) => e.type === 'ack' && e.clientMsgId === 'cm-bigchat');

  const upSmallShare = (await uploadFile({ token: at, filePath: small, scope: 'share', mime: 'image/png' })).data.data;
  const upBigShare   = (await uploadFile({ token: at, filePath: big,   scope: 'share', mime: 'image/png' })).data.data;
  const upSmallChat  = (await uploadFile({ token: at, filePath: small, scope: 'chat',  mime: 'image/png' })).data.data;

  console.log('== stats: storage filled ==');
  const s3 = (await http('GET', '/api/admin/stats', { token: admT })).data.data;
  assert(s3.storage.chatBytes >= bigSize + smallSize, `chatBytes ok (got ${s3.storage.chatBytes})`);
  assert(s3.storage.shareBytes >= bigSize + smallSize, `shareBytes ok (got ${s3.storage.shareBytes})`);

  console.log('== file cleanup preview: minSize=10000 (only big files) ==');
  const prev1 = (await http('POST', '/api/admin/cleanup/files/preview', { token: admT, body: { minSizeBytes: 10000 } })).data.data;
  assert(prev1.count >= 2, `minSize big files >= 2 (got ${prev1.count})`);
  assert(prev1.totalBytes >= bigSize * 2, 'totalBytes ok');

  console.log('== file cleanup preview: scope=share ==');
  const prev2 = (await http('POST', '/api/admin/cleanup/files/preview', { token: admT, body: { scope: 'share' } })).data.data;
  assert(prev2.count === 2, `share count=2 (got ${prev2.count})`);

  console.log('== file cleanup preview: scope=[chat,share] ==');
  const prev3 = (await http('POST', '/api/admin/cleanup/files/preview', { token: admT, body: { scope: ['chat', 'share'] } })).data.data;
  assert(prev3.count === 4, `all 4 (got ${prev3.count})`);

  console.log('== file cleanup execute: scope=share ==');
  const e1 = (await http('POST', '/api/admin/cleanup/files/execute', { token: admT, body: { scope: 'share' } })).data.data;
  assert(e1.deleted === 2, `deleted 2 share (got ${e1.deleted})`);
  assert(e1.replacedMessages === 0, 'no chat msgs replaced (share scope)');
  const listShare = await http('GET', '/api/share', { token: bt });
  assert(listShare.data.data.length === 0, 'share now empty');

  console.log('== file cleanup execute: scope=chat → replaces messages ==');
  // 消息引用 upBigChat 的那一条会被改成占位
  const e2 = (await http('POST', '/api/admin/cleanup/files/execute', { token: admT, body: { scope: 'chat' } })).data.data;
  assert(e2.deleted === 2, `deleted 2 chat files (got ${e2.deleted})`);
  assert(e2.replacedMessages >= 1, `at least 1 message replaced (got ${e2.replacedMessages})`);

  console.log('== verify message content replaced with placeholder ==');
  const histAB = (await http('GET', `/api/messages?peerId=${b.userId}`, { token: at })).data.data;
  const imgMsg = histAB.find((m) => m.type === 'image');
  assert(imgMsg && imgMsg.content && imgMsg.content.deleted === true, 'image msg now {deleted:true}');
  assert(imgMsg.content.filename, 'placeholder retains filename');

  console.log('== verify file rows gone ==');
  const dlGone = await http('GET', `/api/files/${upBigChat.fileId}`, { token: at, raw: true });
  assert(dlGone.status === 404, 'cleaned file 404');

  console.log('== stats: storage zero again ==');
  const s4 = (await http('GET', '/api/admin/stats', { token: admT })).data.data;
  assert(s4.storage.totalBytes === 0, 'all storage cleaned');

  console.log('== files cleanup no-filter rejected ==');
  const nf = await http('POST', '/api/admin/cleanup/files/preview', { token: admT, body: {} });
  assert(nf.status === 400, 'no filter rejected');

  console.log('== invalid scope rejected ==');
  const isc = await http('POST', '/api/admin/cleanup/files/preview', { token: admT, body: { scope: 'badscope' } });
  assert(isc.status === 400, 'bad scope rejected');

  console.log('\n✅ ALL STEP-4 TESTS PASSED');
  aw.close(); bw.close();
}

main().catch((e) => { console.error('❌ TEST FAILED:', e); process.exit(1); });
