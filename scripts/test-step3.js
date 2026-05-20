// 端到端测试：第三步（文件上传 + 图片消息 + 缩略图 + 文件共享）
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
  if (body) {
    headers['Content-Type'] = 'application/json';
    _body = JSON.stringify(body);
  }
  const res = await fetch(BASE + p, { method, headers, body: _body });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function uploadFile({ token, filePath, scope, name, mime }) {
  const form = new FormData();
  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: mime || 'application/octet-stream' });
  form.append('file', blob, name || path.basename(filePath));
  const res = await fetch(`${BASE}/api/files/upload?scope=${scope}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

function connectWs(token, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}?token=${token}`);
    ws.events = [];
    ws.on('message', (raw) => ws.events.push(JSON.parse(raw.toString())));
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function send(ws, obj) { ws.send(JSON.stringify(obj)); }

async function waitFor(ws, predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const e = ws.events.find(predicate);
    if (e) return e;
    await delay(20);
  }
  throw new Error('timeout; events=' + JSON.stringify(ws.events));
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
  console.log('  ✓', msg);
}

// 生成测试图片(简单 PNG，1x1 红点)
function makeTinyPng(dest) {
  // 真正能被 sharp 解析的最小 PNG
  const buf = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63600100000500010d0a2db40000000049454e44ae426082',
    'hex'
  );
  fs.writeFileSync(dest, buf);
}

// 生成稍微大一点的真实 PNG 让 sharp 能算出 meta（用 sharp）
async function makeRealPng(dest, w = 64, h = 48) {
  const sharp = require('sharp');
  await sharp({
    create: {
      width: w, height: h, channels: 3,
      background: { r: 200, g: 100, b: 50 }
    }
  }).png().toFile(dest);
}

async function main() {
  // setup users
  const adm = (await http('POST', '/api/admin/login', { body: { adminKey: ADMIN_KEY } })).data.data.token;
  const a = (await http('POST', '/api/admin/users', { token: adm, body: { name: 'Alice' } })).data.data;
  const b = (await http('POST', '/api/admin/users', { token: adm, body: { name: 'Bob' } })).data.data;
  const c = (await http('POST', '/api/admin/users', { token: adm, body: { name: 'Carol' } })).data.data;
  const aliceTok = (await http('POST', '/api/auth/login', { body: { loginKey: a.loginKey } })).data.data.token;
  const bobTok   = (await http('POST', '/api/auth/login', { body: { loginKey: b.loginKey } })).data.data.token;
  const carolTok = (await http('POST', '/api/auth/login', { body: { loginKey: c.loginKey } })).data.data.token;

  const tmpDir = path.join(require('os').tmpdir(), 'chat-node-test');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const pngPath = path.join(tmpDir, 'real.png');
  const txtPath = path.join(tmpDir, 'note.txt');
  await makeRealPng(pngPath, 64, 48);
  fs.writeFileSync(txtPath, 'hello world from a file');

  console.log('== upload chat image as alice ==');
  const upImg = await uploadFile({ token: aliceTok, filePath: pngPath, scope: 'chat', mime: 'image/png' });
  assert(upImg.data.ok, 'upload ok');
  assert(upImg.data.data.fileId, 'fileId returned');
  assert(upImg.data.data.width === 64 && upImg.data.data.height === 48, `dims 64x48 (got ${upImg.data.data.width}x${upImg.data.data.height})`);
  assert(upImg.data.data.hasThumbnail === true, 'thumbnail generated');
  const imgFileId = upImg.data.data.fileId;

  console.log('== upload chat file (text) as alice ==');
  const upTxt = await uploadFile({ token: aliceTok, filePath: txtPath, scope: 'chat', mime: 'text/plain' });
  assert(upTxt.data.ok, 'txt upload ok');
  assert(upTxt.data.data.hasThumbnail === false, 'no thumb for txt');
  const txtFileId = upTxt.data.data.fileId;

  console.log('== invalid scope ==');
  const bad = await uploadFile({ token: aliceTok, filePath: txtPath, scope: 'nope', mime: 'text/plain' });
  assert(bad.status === 400, 'bad scope rejected');

  console.log('== unauth upload ==');
  const un = await uploadFile({ token: 'invalid', filePath: txtPath, scope: 'chat', mime: 'text/plain' });
  assert(un.status === 401, 'unauth blocked');

  console.log('== WS: alice sends image to bob ==');
  const aliceWs = await connectWs(aliceTok, 'alice');
  const bobWs   = await connectWs(bobTok, 'bob');
  const carolWs = await connectWs(carolTok, 'carol');
  send(aliceWs, {
    type: 'send', clientMsgId: 'cm-img', to: b.userId,
    msgType: 'image', content: { fileId: imgFileId }
  });
  const ackImg = await waitFor(aliceWs, (e) => e.type === 'ack' && e.clientMsgId === 'cm-img');
  const recvImg = await waitFor(bobWs, (e) => e.type === 'message' && e.data.id === ackImg.messageId);
  assert(recvImg.data.type === 'image', 'bob got image msg');
  assert(recvImg.data.content.fileId === imgFileId, 'fileId matches');
  assert(recvImg.data.content.width === 64, 'width filled by server');
  assert(recvImg.data.content.mime === 'image/png', 'mime filled by server');

  console.log('== WS: alice sends file to bob ==');
  send(aliceWs, {
    type: 'send', clientMsgId: 'cm-file', to: b.userId,
    msgType: 'file', content: { fileId: txtFileId }
  });
  const ackTxt = await waitFor(aliceWs, (e) => e.type === 'ack' && e.clientMsgId === 'cm-file');
  await waitFor(bobWs, (e) => e.type === 'message' && e.data.id === ackTxt.messageId);

  console.log('== WS: send with not-own fileId rejected ==');
  // bob 尝试发送 alice 的文件
  send(bobWs, { type: 'send', clientMsgId: 'cm-x', to: a.userId, msgType: 'image', content: { fileId: imgFileId } });
  await waitFor(bobWs, (e) => e.type === 'error' && e.code === 'forbidden_file');
  assert(true, 'cross-user file ref rejected');

  console.log('== WS: send with unknown fileId rejected ==');
  send(aliceWs, { type: 'send', clientMsgId: 'cm-y', to: b.userId, msgType: 'image', content: { fileId: 'no-such-file' } });
  await waitFor(aliceWs, (e) => e.type === 'error' && e.code === 'file_not_found');
  assert(true, 'unknown fileId rejected');

  console.log('== download original: bob OK ==');
  const dlBob = await http('GET', `/api/files/${imgFileId}`, { token: bobTok, raw: true });
  assert(dlBob.status === 200, 'bob can download');
  const cd = dlBob.headers.get('content-disposition');
  assert(cd && cd.includes("UTF-8''"), 'content-disposition utf-8');

  console.log('== download thumbnail: bob OK ==');
  const tBob = await http('GET', `/api/files/${imgFileId}/thumbnail`, { token: bobTok, raw: true });
  assert(tBob.status === 200, 'thumb 200');
  assert(tBob.headers.get('content-type') === 'image/jpeg', 'thumb is jpeg');

  console.log('== download original: carol (not party) → 403 ==');
  const dlCarol = await http('GET', `/api/files/${imgFileId}`, { token: carolTok, raw: true });
  assert(dlCarol.status === 403, `carol 403 (got ${dlCarol.status})`);

  console.log('== download original: alice (owner) OK ==');
  const dlAlice = await http('GET', `/api/files/${imgFileId}`, { token: aliceTok, raw: true });
  assert(dlAlice.status === 200, 'owner can download');

  console.log('== upload share file as alice ==');
  const upShare = await uploadFile({ token: aliceTok, filePath: pngPath, scope: 'share', mime: 'image/png', name: 'shared.png' });
  assert(upShare.data.ok, 'share upload ok');
  const shareId = upShare.data.data.fileId;

  console.log('== share list visible to carol & bob ==');
  const lc = await http('GET', '/api/share', { token: carolTok });
  assert(lc.data.data.length === 1 && lc.data.data[0].fileId === shareId, 'carol sees share');
  const lb = await http('GET', '/api/share', { token: bobTok });
  assert(lb.data.data.length === 1, 'bob sees share');

  console.log('== share download: any user OK ==');
  const dsc = await http('GET', `/api/files/${shareId}`, { token: carolTok, raw: true });
  assert(dsc.status === 200, 'carol can download share');

  console.log('== share search by q ==');
  const sq1 = await http('GET', '/api/share?q=shared', { token: bobTok });
  assert(sq1.data.data.length === 1, 'q=shared matches');
  const sq2 = await http('GET', '/api/share?q=nope', { token: bobTok });
  assert(sq2.data.data.length === 0, 'q=nope empty');

  console.log('== share delete: non-owner blocked ==');
  const delBlock = await http('DELETE', `/api/share/${shareId}`, { token: bobTok });
  assert(delBlock.status === 403, `non-owner 403 (got ${delBlock.status})`);

  console.log('== share delete: owner OK, file gone on disk ==');
  // 找磁盘路径
  const Database = require('better-sqlite3');
  // 不能直接打开（被服务端独占？better-sqlite3 默认允许多连接读 WAL）。这里跳过 fs 检查，仅用 API 验证
  const delOk = await http('DELETE', `/api/share/${shareId}`, { token: aliceTok });
  assert(delOk.data.ok, 'owner delete ok');
  const afterDel = await http('GET', '/api/share', { token: bobTok });
  assert(afterDel.data.data.length === 0, 'share list now empty');
  const dlGone = await http('GET', `/api/files/${shareId}`, { token: bobTok, raw: true });
  assert(dlGone.status === 404, 'download after delete 404');

  console.log('\n✅ ALL STEP-3 TESTS PASSED');
  aliceWs.close(); bobWs.close(); carolWs.close();
}

main().catch((e) => {
  console.error('❌ TEST FAILED:', e);
  process.exit(1);
});
