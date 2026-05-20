// Nodex Chat — main app (peer dropdown + per-peer thread history)
const { useState, useEffect, useRef, useMemo } = React;

// Avatars
const AVATAR_COLORS = ['#5B5BD6','#7A56B5','#1F8A5B','#C77D2F','#D4373B','#2A6FDB','#7A7AFF','#4A9A8E'];
function colorFor(seed) {
  let h = 0; for (let i=0;i<seed.length;i++) h = (h*31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function Avatar({ name, size = 32, id }) {
  const initials = (name || id || '?').slice(0, 1).toUpperCase();
  return React.createElement('span', {
    className: 'avatar',
    style: { width: size, height: size, fontSize: Math.round(size*0.4), background: colorFor(id || name || '?') }
  }, initials);
}

const ME = { id: '481-202', name: 'Yuki Lan' };

// Peers and their chat-thread history
const PEERS = [
  { id: '209-715', name: '陈晓 Chen Xiao', online: true  },
  { id: '364-099', name: 'Mira Patel',     online: true  },
  { id: '512-487', name: '研发 03',         online: false },
  { id: '188-330', name: 'Ahmed Karim',    online: false },
  { id: '744-201', name: 'Sofia Reyes',    online: true  },
  { id: '923-114', name: '设计组',          online: false },
  { id: '317-822', name: "Liam O'Connor",  online: false },
];

// Thread history per peer — grouped naturally by recency
const THREADS = {
  '209-715': [
    { id: 't101', title: 'Socket 重连退避策略',           group: 'Today',             preview: '指数退避，最长 30s 封顶。' },
    { id: 't102', title: '周报评审反馈与下一步',          group: 'Today',             preview: '设计稿这周二之前我会出 v3。' },
    { id: 't103', title: '设计评审 v3 改动点',           group: 'Yesterday',         preview: '把那个空状态的副本再短一点。' },
    { id: 't104', title: 'iOS 客户端崩溃排查',           group: 'Previous 7 days',   preview: 'Sentry 上看到主线程阻塞。' },
    { id: 't105', title: 'Q2 路线图同步',                group: 'Previous 7 days',   preview: '里程碑挪后两周，问题不大。' },
    { id: 't106', title: '十二月发布回顾',                group: 'Previous 30 days',  preview: '总体顺利，复盘文档我写。' },
    { id: 't107', title: '用户调研 Q1 总结',             group: 'Previous 30 days',  preview: '关键发现 3 条已发到文档。' },
  ],
  '364-099': [
    { id: 't201', title: 'Deploy notes v0.4.2',         group: 'Today',             preview: 'Sent the deploy notes — let me know.' },
    { id: 't202', title: 'File uploader regression',    group: 'Today',             preview: 'I\u2019ll take the uploader regressions.' },
    { id: 't203', title: 'Feature flag rollout plan',   group: 'Yesterday',         preview: 'Plan to ramp 25 → 50 → 100.' },
    { id: 't204', title: 'Q3 OKR alignment',            group: 'Previous 7 days',   preview: 'Looks good — let\u2019s lock it Friday.' },
    { id: 't205', title: 'Hiring loop calibration',     group: 'Previous 7 days',   preview: 'Two strong yeses on the EM role.' },
    { id: 't206', title: 'Postmortem template',         group: 'Previous 30 days',  preview: 'Drafted in Notion — review please.' },
  ],
  '512-487': [
    { id: 't301', title: 'Redis 连接池泄漏复盘',         group: 'Today',             preview: '日志看了下，似乎是没释放。' },
    { id: 't302', title: '日志接入告警系统',             group: 'Yesterday',         preview: '阈值我先按 P95 > 500ms 配。' },
    { id: 't303', title: '服务降级方案讨论',             group: 'Previous 7 days',   preview: '优先保下单和支付链路。' },
    { id: 't304', title: 'CI 流水线优化',                group: 'Previous 30 days',  preview: '现在跑一次要 18 分钟。' },
  ],
  '188-330': [
    { id: 't401', title: 'Out tomorrow afternoon',      group: 'Today',             preview: 'Cool. Talk tomorrow.' },
    { id: 't402', title: 'Sprint planning prep',        group: 'Yesterday',         preview: 'I added the carry-over items.' },
    { id: 't403', title: 'API contract review',         group: 'Previous 7 days',   preview: '/v2 paths — versioning OK?' },
  ],
  '744-201': [
    { id: 't501', title: 'Brand mark exploration',      group: 'Today',             preview: 'Here are the assets you asked for.' },
    { id: 't502', title: 'Asset handoff for v3',        group: 'Yesterday',         preview: 'Zipped — see Shared files.' },
    { id: 't503', title: 'Product shots from Tokyo',    group: 'Previous 7 days',   preview: '40 RAWs uploaded.' },
    { id: 't504', title: 'Logo refresh round 1',        group: 'Previous 30 days',  preview: 'Three directions to choose from.' },
  ],
  '923-114': [
    { id: 't601', title: '今晚的评审推迟一天',           group: 'Previous 7 days',   preview: '抱歉变动有点临时。' },
    { id: 't602', title: '组件库 token 重命名',           group: 'Previous 30 days',  preview: '改动列表已发到文档。' },
  ],
  '317-822': [
    { id: 't701', title: 'Same time next week',         group: 'Previous 7 days',   preview: 'No worries — same time works.' },
  ],
};

// Messages keyed by PEER id — threads are just disguise labels; the conversation is per-peer
const PEER_MESSAGES = {
  '209-715': [
    { id: 'm1', from: 'peer', kind: 'text', body: '在吗？刚那个 PR 我有点问题想请教一下。', t: '10:30' },
    { id: 'm2', from: 'peer', kind: 'text', body: '关于 socket 重连的退避策略，咱们之前是用 expo 还是固定 3s 来着？', t: '10:31' },
    { id: 'm3', from: 'me',   kind: 'text', body: '指数退避，最长 30s 封顶。', t: '10:33', state: 'read' },
    { id: 'm4', from: 'me',   kind: 'text', body: '不过断线超过 5 分钟我们就直接停掉，让用户手动点重连——避免无意义地耗电。', t: '10:33', state: 'read' },
    { id: 'm5', from: 'peer', kind: 'text', body: '明白了，那我按这个改。', t: '10:35' },
    { id: 'm6', from: 'peer', kind: 'image', alt: 'screenshot', w: 220, h: 160, t: '10:38' },
    { id: 'm7', from: 'me',   kind: 'text', body: '👀 这个截图里日志的时间戳对不上，是不是机器时区错了？', t: '10:40', state: 'read' },
    { id: 'm8', from: 'peer', kind: 'file', name: 'deploy-notes-v3.pdf', size: '284 KB', ext: 'PDF', t: '10:41' },
    { id: 'm9', from: 'peer', kind: 'text', body: '好的，那我们晚一点电话聊一下吧。', t: '10:42' },
  ],
  '364-099': [
    { id: 'b1', from: 'peer', kind: 'text', body: 'Morning! Pushed v0.4.2 to staging just now.', t: '09:10' },
    { id: 'b2', from: 'peer', kind: 'text', body: 'A couple of regressions in the file uploader, fwiw — flagging them as P2.', t: '09:11' },
    { id: 'b3', from: 'me',   kind: 'text', body: 'Got it. I\u2019ll take the uploader regressions; can you pull the recall-message timing one?', t: '09:14', state: 'read' },
    { id: 'b4', from: 'peer', kind: 'text', body: 'Sent the deploy notes — let me know.', t: '09:17' },
  ],
  '512-487': [
    { id: 'c1', from: 'peer', kind: 'text', body: '今天的故障复盘要不要拉个会？', t: '14:02' },
    { id: 'c2', from: 'me',   kind: 'text', body: '可以，下午四点会议室3。', t: '14:04', state: 'read' },
    { id: 'c3', from: 'peer', kind: 'text', body: '日志看了下，似乎是 redis 连接池没释放。', t: '14:30' },
  ],
  '188-330': [
    { id: 'd1', from: 'peer', kind: 'text', body: 'Heads up: out tomorrow afternoon.', t: '18:30' },
    { id: 'd2', from: 'me',   kind: 'text', body: 'Noted. Enjoy.', t: '18:31', state: 'read' },
    { id: 'd3', from: 'peer', kind: 'text', body: 'Cool. Talk tomorrow.', t: '18:32' },
  ],
  '744-201': [
    { id: 'e1', from: 'peer', kind: 'text', body: 'Here are the assets you asked for.', t: '11:00' },
    { id: 'e2', from: 'peer', kind: 'file', name: 'brand-marks.zip', size: '4.4 MB', ext: 'ZIP', t: '11:00' },
    { id: 'e3', from: 'me',   kind: 'text', body: 'Perfect, thanks.', t: '11:02', state: 'read' },
  ],
  '923-114': [
    { id: 'f1', from: 'peer', kind: 'text', body: '今晚的评审推迟一天哈。', t: '15:20' },
  ],
  '317-822': [
    { id: 'g1', from: 'peer', kind: 'text', body: 'No worries — same time next week works.', t: '17:48' },
  ],
};

function emptyMessages() {
  return [];
}

const CONNECTION_STATES = {
  connected:    { label: 'Connected',          cls: 'connected'    },
  connecting:   { label: 'Connecting…',        cls: 'connecting'   },
  reconnecting: { label: 'Reconnecting (3)…',  cls: 'reconnecting' },
  disconnected: { label: 'Disconnected',       cls: 'disconnected' },
};

function fmtMsgState(s) {
  if (!s) return null;
  return { sending: 'Sending…', sent: 'Sent', read: 'Read', failed: 'Failed · tap to retry' }[s];
}

function App() {
  const params = new URLSearchParams(location.search);
  const stateParam = params.get('state');

  const [peerId, setPeerId]   = useState(stateParam === 'empty' ? null : '209-715');
  const [threadId, setThreadId] = useState(stateParam === 'empty' ? null : 't101');
  const [threads, setThreads] = useState(THREADS);
  const [messages, setMessages] = useState(PEER_MESSAGES);
  const [conn, setConn] = useState(stateParam === 'disconnected' ? 'disconnected' : 'connected');
  const [draft, setDraft] = useState('');
  const [toasts, setToasts] = useState([]);
  const [drawerOpen, setDrawer] = useState(false);
  const [peerMenuOpen, setPeerMenuOpen] = useState(false);
  const [showRecallFor, setShowRecallFor] = useState(null);
  const [showPeerTyping] = useState(true);
  const [showFiles, setShowFiles] = useState(false);
  const taRef = useRef(null);
  const scrollRef = useRef(null);

  const peer = useMemo(() => PEERS.find(p => p.id === peerId), [peerId]);
  const peerThreads = useMemo(() => (peerId ? (threads[peerId] || []) : []), [peerId, threads]);
  const thread = useMemo(() => peerThreads.find(t => t.id === threadId), [peerThreads, threadId]);
  // Messages are tied to the PEER, not the thread — switching threads only updates the title
  const msgs = useMemo(() => (peerId ? (messages[peerId] || []) : []), [peerId, messages]);

  useEffect(() => {
    // only auto-scroll when peer or message count changes — NOT when thread changes
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [peerId, msgs.length]);

  function pushToast(text) {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }

  function selectPeer(pid) {
    setPeerId(pid);
    setPeerMenuOpen(false);
    const first = (threads[pid] || [])[0];
    setThreadId(first ? first.id : null);
    setDrawer(false);
  }

  function selectThread(tid) {
    setThreadId(tid);
    setDrawer(false);
  }

  function newThread() {
    if (!peerId) return;
    const id = 'nt' + Date.now();
    const newT = { id, title: 'New chat', group: 'Today', preview: '' };
    setThreads(t => ({ ...t, [peerId]: [newT, ...(t[peerId] || [])] }));
    setThreadId(id);
    setDrawer(false);
  }

  function deleteThread(tid) {
    if (!peerId) return;
    setThreads(t => ({ ...t, [peerId]: (t[peerId] || []).filter(x => x.id !== tid) }));
    if (threadId === tid) {
      const remaining = (threads[peerId] || []).filter(x => x.id !== tid);
      setThreadId(remaining[0]?.id || null);
    }
    pushToast('Chat deleted');
  }

  function autosize() {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }
  useEffect(autosize, [draft]);

  function send() {
    if (!draft.trim() || !peerId) return;
    const id = 'n' + Date.now();
    const text = draft.trim();
    const now = new Date();
    const t = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    // append to PEER's message list (single conversation per peer)
    setMessages(m => ({ ...m, [peerId]: [...(m[peerId]||[]), { id, from: 'me', kind: 'text', body: text, t, state: 'sending' }]}));
    setDraft('');
    setTimeout(() => setMessages(m => ({ ...m, [peerId]: (m[peerId]||[]).map(x => x.id === id ? { ...x, state: 'sent' } : x) })), 700);
    setTimeout(() => setMessages(m => ({ ...m, [peerId]: (m[peerId]||[]).map(x => x.id === id ? { ...x, state: 'read' } : x) })), 1800);
    // update current thread preview (cosmetic)
    if (threadId) {
      setThreads(ts => ({ ...ts, [peerId]: (ts[peerId]||[]).map(x => x.id === threadId ? { ...x, preview: text } : x) }));
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function reconnect() { setConn('connecting'); setTimeout(() => setConn('connected'), 1400); }

  function recallMessage(mid) {
    if (!peerId) return;
    setMessages(m => ({ ...m, [peerId]: (m[peerId]||[]).map(x => x.id === mid ? { ...x, recalled: true } : x) }));
    setShowRecallFor(null);
    pushToast('Message recalled');
  }

  return React.createElement('div', { className: 'chat-shell' },
    React.createElement(Sidebar, {
      peer, peers: PEERS, peerThreads, threadId,
      peerMenuOpen, setPeerMenuOpen,
      onSelectPeer: selectPeer,
      onSelectThread: selectThread,
      onNewThread: newThread,
      onDeleteThread: deleteThread,
      onOpenFiles: () => setShowFiles(true),
      onCopyId: () => { navigator.clipboard?.writeText(ME.id); pushToast('Copied user ID'); },
      drawerOpen, setDrawer,
    }),
    React.createElement('div', {
      className: 'scrim' + (drawerOpen ? ' show' : ''),
      onClick: () => setDrawer(false)
    }),
    React.createElement('main', { className: 'main' },
      React.createElement(Topbar, {
        thread, conn, onMenu: () => setDrawer(true), onReconnect: reconnect,
      }),
      thread
        ? React.createElement(ChatBody, {
            msgs, scrollRef, peer,
            showPeerTyping,
            showRecallFor, setShowRecallFor,
            onRecall: recallMessage,
          })
        : React.createElement(EmptyState, { onNew: newThread, hasPeer: !!peer }),
      thread && React.createElement(Composer, { taRef, draft, setDraft, onKeyDown, onSend: send })
    ),
    React.createElement('div', { className: 'toast-stack' },
      toasts.map(t => React.createElement('div', { key: t.id, className: 'toast' },
        React.createElement(Icon.check, null), t.text
      ))
    ),
    showFiles && React.createElement(FilesModal, { onClose: () => setShowFiles(false), pushToast })
  );
}

// === Sidebar ===
function Sidebar({ peer, peers, peerThreads, threadId, peerMenuOpen, setPeerMenuOpen,
                  onSelectPeer, onSelectThread, onNewThread, onDeleteThread, onOpenFiles, onCopyId,
                  drawerOpen, setDrawer }) {

  // Group threads
  const groups = useMemo(() => {
    const order = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];
    const byG = {};
    peerThreads.forEach(t => { (byG[t.group] = byG[t.group] || []).push(t); });
    return order.filter(g => byG[g] && byG[g].length).map(g => ({ name: g, items: byG[g] }));
  }, [peerThreads]);

  return React.createElement('aside', { className: 'sidebar' + (drawerOpen ? ' open' : '') },
    React.createElement('div', { className: 'sb-brand' },
      React.createElement('span', { className: 'brand-mark', 'aria-hidden': 'true' },
        React.createElement('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none' },
          React.createElement('rect', { width: 24, height: 24, rx: 6, fill: 'var(--accent)' }),
          React.createElement('line', { x1: 8, y1: 8, x2: 16, y2: 16, stroke: 'white', strokeWidth: 1.6, strokeLinecap: 'round' }),
          React.createElement('circle', { cx: 8,  cy: 8,  r: 2.4, fill: 'white' }),
          React.createElement('circle', { cx: 16, cy: 16, r: 2.4, fill: 'white' }),
          React.createElement('circle', { cx: 17, cy: 7,  r: 1.4, fill: 'white', opacity: 0.7 })
        )
      ),
      React.createElement('span', { className: 'brand-name' }, 'Node-AI')
    ),
    React.createElement('div', { className: 'sb-top' },
      // ID-only peer selector (looks like a session ID selector)
      React.createElement(PeerSelector, {
        peer, peers,
        open: peerMenuOpen, setOpen: setPeerMenuOpen,
        onSelect: onSelectPeer,
      }),
      React.createElement('button', { className: 'sb-action', onClick: onNewThread },
        React.createElement(Icon.plus, null), 'New chat'
      ),
      React.createElement('button', { className: 'sb-action', onClick: onOpenFiles },
        React.createElement(Icon.files, null), 'Shared files'
      ),
    ),
    React.createElement('div', { className: 'sb-list' },
      peer ? groups.map(g =>
        React.createElement('div', { key: g.name },
          React.createElement('div', { className: 'sb-section-label' }, g.name),
          g.items.map(t => React.createElement(ThreadItem, {
            key: t.id, t, active: t.id === threadId,
            onSelect: () => onSelectThread(t.id),
            onDelete: () => onDeleteThread(t.id),
          }))
        )
      ) : React.createElement('div', { style: { padding: 24, color: 'var(--text-3)', fontSize: 13, textAlign: 'center' } },
        'Select a contact to view chats')
    ),
    React.createElement('hr', { className: 'sep' }),
    React.createElement('div', { className: 'sb-bottom' },
      React.createElement('div', { className: 'user-row' },
        React.createElement(Avatar, { name: ME.name, id: ME.id, size: 28 }),
        React.createElement('div', { className: 'user-info' },
          React.createElement('div', { className: 'user-name' }, ME.name),
          React.createElement('div', { className: 'user-id' }, 'ID · ', ME.id,
            React.createElement('button', { className: 'icon-btn', style: { width: 22, height: 22 }, onClick: onCopyId, title: 'Copy ID' },
              React.createElement(Icon.copy, null)
            )
          )
        ),
        React.createElement('button', { className: 'icon-btn', title: 'Toggle theme', onClick: window.toggleTheme },
          React.createElement(Icon.sun, null)
        )
      )
    )
  );
}

function PeerSelector({ peer, peers, open, setOpen, onSelect }) {
  const ref = useRef(null);
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);
  return React.createElement('div', { className: 'peer-select-wrap', ref },
    React.createElement('button', {
      className: 'peer-select' + (open ? ' open' : ''),
      onClick: () => setOpen(!open),
    },
      React.createElement('div', { className: 'info' },
        React.createElement('div', { className: 'lbl' }, 'Chat ID'),
        React.createElement('div', { className: 'val mono' }, peer ? peer.id : 'Select…')
      ),
      peer && peer.online && React.createElement('span', { className: 'online-dot', title: 'Online' }),
      React.createElement('span', { className: 'chevron' }, React.createElement(Icon.chevronDown, null))
    ),
    open && React.createElement('div', { className: 'peer-menu' },
      peers.map(p => React.createElement('div', {
        key: p.id,
        className: 'peer-menu-item' + (peer && p.id === peer.id ? ' active' : ''),
        onClick: () => onSelect(p.id),
      },
        React.createElement('span', { className: 'mono', style: { fontSize: 13, color: 'var(--text)' } }, p.id),
        React.createElement('span', { style: { flex: 1 } }),
        p.online
          ? React.createElement('span', { className: 'online-dot' })
          : React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', display: 'inline-block', opacity: 0.5 } })
      ))
    )
  );
}

function ThreadItem({ t, active, onSelect, onDelete }) {
  return React.createElement('div', {
    className: 'thread-item' + (active ? ' active' : ''),
    onClick: onSelect,
  },
    React.createElement('span', { className: 'title' }, t.title),
    React.createElement('button', {
      className: 'thread-del',
      onClick: e => { e.stopPropagation(); onDelete(); },
      title: 'Delete chat'
    }, React.createElement(Icon.trash, null))
  );
}

// === Topbar ===
function Topbar({ thread, conn, onMenu, onReconnect }) {
  const s = CONNECTION_STATES[conn];
  return React.createElement('header', { className: 'topbar' },
    React.createElement('button', { className: 'icon-btn hamburger', onClick: onMenu, title: 'Menu' },
      React.createElement(Icon.menu, null)
    ),
    React.createElement('div', { className: 'left' },
      thread && React.createElement('div', { className: 'thread-title' }, thread.title)
    ),
    React.createElement('div', { className: 'right' },
      React.createElement('div', { className: 'conn ' + s.cls },
        conn === 'reconnecting' || conn === 'connecting'
          ? React.createElement('span', { className: 'pulse-dot', style: { color: 'var(--warn)', background: 'var(--warn)' } })
          : React.createElement('span', { className: 'conn-dot' }),
        React.createElement('span', null, s.label),
        conn === 'disconnected' && React.createElement('button', {
          className: 'btn btn-ghost', style: { height: 22, padding: '0 8px', fontSize: 12, color: 'var(--accent)' },
          onClick: onReconnect
        }, 'Reconnect')
      ),
      React.createElement('a', { href: 'login.html', className: 'icon-btn', title: 'Logout' },
        React.createElement(Icon.logout, null)
      )
    )
  );
}

// === ChatBody ===
function ChatBody({ msgs, scrollRef, peer, showPeerTyping, showRecallFor, setShowRecallFor, onRecall }) {
  return React.createElement('div', { className: 'msg-area', ref: scrollRef },
    React.createElement('div', { className: 'msg-track' },
      React.createElement('div', { className: 'load-earlier' },
        React.createElement('span', { className: 'spinner' }), ' Loading earlier messages…'
      ),
      React.createElement('div', { className: 'date-div' }, 'Today'),
      msgs.map((m, i) => {
        const isSelf = m.from === 'me';
        const prev = msgs[i-1];
        const compact = prev && prev.from === m.from && !prev.recalled && !m.recalled;
        const animate = String(m.id).startsWith('n');
        if (m.recalled) return React.createElement('div', { key: m.id, className: 'recalled' }, 'This message was recalled');
        return React.createElement(MessageRow, {
          key: m.id, m, isSelf, compact, animate, peer,
          showRecallFor, setShowRecallFor, onRecall,
        });
      }),
      showPeerTyping && peer && React.createElement('div', { className: 'typing-row' },
        React.createElement('span', { className: 'ai-mark', 'aria-hidden': 'true' },
          React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none' },
            React.createElement('rect', { width: 24, height: 24, rx: 6, fill: 'var(--accent)' }),
            React.createElement('line', { x1: 8, y1: 8, x2: 16, y2: 16, stroke: 'white', strokeWidth: 1.6, strokeLinecap: 'round' }),
            React.createElement('circle', { cx: 8,  cy: 8,  r: 2.4, fill: 'white' }),
            React.createElement('circle', { cx: 16, cy: 16, r: 2.4, fill: 'white' })
          )
        ),
        React.createElement('div', { className: 'typing', style: { padding: '12px 4px' } },
          React.createElement('span'), React.createElement('span'), React.createElement('span')
        )
      )
    ),
    React.createElement('div', { className: 'fade-bottom' })
  );
}

function MessageRow({ m, isSelf, compact, animate, peer, showRecallFor, setShowRecallFor, onRecall }) {
  return React.createElement('div', {
    className: 'msg-row' + (animate ? ' msg-enter' : '') + (isSelf ? ' self' : '') + (compact ? ' compact' : '')
  },
    !isSelf && React.createElement('div', { className: 'msg-avatar' },
      React.createElement('span', { className: 'ai-mark', 'aria-hidden': 'true' },
        React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none' },
          React.createElement('rect', { width: 24, height: 24, rx: 6, fill: 'var(--accent)' }),
          React.createElement('line', { x1: 8, y1: 8, x2: 16, y2: 16, stroke: 'white', strokeWidth: 1.6, strokeLinecap: 'round' }),
          React.createElement('circle', { cx: 8,  cy: 8,  r: 2.4, fill: 'white' }),
          React.createElement('circle', { cx: 16, cy: 16, r: 2.4, fill: 'white' })
        )
      )
    ),
    isSelf
      ? React.createElement('div', { className: 'bubble-self-wrap' },
          React.createElement('div', { className: 'bubble-wrap' },
            renderBody(m),
            React.createElement('div', { className: 'msg-state' + (m.state === 'failed' ? ' failed' : '') }, fmtMsgState(m.state))
          ),
          React.createElement('div', { className: 'bubble-actions' },
            React.createElement('button', { onClick: () => setShowRecallFor(m.id), title: 'More' },
              React.createElement(Icon.more, null)
            ),
            showRecallFor === m.id && React.createElement('div', {
              style: { position: 'absolute', marginTop: 32, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', overflow: 'hidden', zIndex: 20 }
            },
              React.createElement('button', {
                className: 'btn btn-ghost', style: { height: 32, fontSize: 13, color: 'var(--danger)' },
                onClick: () => onRecall(m.id)
              }, 'Recall message')
            )
          )
        )
      : React.createElement('div', null,
          !compact && React.createElement('div', { className: 'peer-name-label' }, 'Node-AI'),
          renderBody(m),
          React.createElement('div', { className: 'msg-time' }, m.t)
        )
  );
}

function renderBody(m) {
  if (m.kind === 'text') return React.createElement('div', { className: 'msg-body' }, m.body);
  if (m.kind === 'image') {
    const w = m.w || 220, h = m.h || 160;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
      <defs><pattern id='s' width='8' height='8' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
        <rect width='8' height='8' fill='#e9e9ee'/><rect width='3' height='8' fill='#dcdce3'/></pattern></defs>
      <rect width='100%' height='100%' fill='url(#s)'/>
      <text x='50%' y='50%' text-anchor='middle' dy='4' font-family='monospace' font-size='10' fill='#7c7c80'>screenshot.png</text></svg>`;
    const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    return React.createElement('a', { href: 'image-viewer.html' },
      React.createElement('img', { src: url, className: 'msg-image', style: { width: w, height: h }, alt: m.alt || '' })
    );
  }
  if (m.kind === 'file') return React.createElement('div', { className: 'file-card' },
    React.createElement('div', { className: 'file-icon' }, m.ext || 'FILE'),
    React.createElement('div', { className: 'file-meta' },
      React.createElement('div', { className: 'file-name' }, m.name),
      React.createElement('div', { className: 'file-size' }, m.size)
    ),
    React.createElement('button', { className: 'icon-btn', title: 'Download' }, React.createElement(Icon.download, null))
  );
}

function EmptyState({ onNew, hasPeer }) {
  return React.createElement('div', { className: 'chat-empty' },
    React.createElement('div', { className: 'glyph' },
      React.createElement('svg', { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('path', { d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' })
      )
    ),
    React.createElement('h2', null, 'Nodex'),
    React.createElement('p', null, hasPeer
      ? 'No chat selected. Pick one from the sidebar or start a new conversation.'
      : 'Choose a contact from the dropdown at the top of the sidebar.'),
    hasPeer && React.createElement('button', { className: 'btn btn-primary', onClick: onNew },
      React.createElement(Icon.plus, null), 'New chat'
    )
  );
}

function Composer({ taRef, draft, setDraft, onKeyDown, onSend }) {
  return React.createElement('div', { className: 'input-wrap' },
    React.createElement('div', { className: 'input-inner' },
      React.createElement('button', { className: 'attach-btn', title: 'Attach file' }, React.createElement(Icon.paperclip, null)),
      React.createElement('textarea', {
        ref: taRef, className: 'input-textarea', rows: 1,
        placeholder: 'Message',
        value: draft, onChange: e => setDraft(e.target.value),
        onKeyDown
      }),
      React.createElement('button', { className: 'send-btn', disabled: !draft.trim(), onClick: onSend, title: 'Send' },
        React.createElement(Icon.send, null)
      )
    ),
    React.createElement('div', { className: 'input-hint' }, 'Enter to send · Shift+Enter for new line')
  );
}

window.NodexApp = App;

// === Shared Files modal ===
const FILES_DATA = [
  { name: '设计评审-v3.pdf',          size: '284 KB', who: '陈晓',         when: '2h ago',  ext: 'PDF', kind: 'doc' },
  { name: 'hero-screenshot.png',     size: '1.2 MB', who: 'Mira Patel',  when: '3h ago',  ext: 'PNG', kind: 'image', tone: 0 },
  { name: 'release-notes-0.4.2.md',  size: '12 KB',  who: 'Yuki Lan',    when: 'Today',   ext: 'MD',  kind: 'doc' },
  { name: 'incident-redis.log',      size: '88 KB',  who: '研发 03',     when: 'Mon',     ext: 'LOG', kind: 'doc' },
  { name: 'brand-marks.zip',         size: '4.4 MB', who: 'Sofia Reyes', when: 'Mon',     ext: 'ZIP', kind: 'doc' },
  { name: 'product-shot-back.jpg',   size: '2.1 MB', who: 'Sofia Reyes', when: 'Sun',     ext: 'JPG', kind: 'image', tone: 1 },
  { name: '架构图-v2.fig',            size: '780 KB', who: '设计组',       when: '12 May',   ext: 'FIG', kind: 'doc' },
  { name: 'audit-trail.csv',         size: '36 KB',  who: 'Liam',        when: '10 May',  ext: 'CSV', kind: 'doc' },
  { name: 'login-mock.png',          size: '480 KB', who: 'Yuki Lan',    when: '8 May',   ext: 'PNG', kind: 'image', tone: 2 },
];

function imagePreviewURL(tone) {
  const c = tone === 1 ? ['#dbe4d2','#bcccae'] : tone === 2 ? ['#e5dccb','#d4c2a1'] : ['#d6d8eb','#b4b7d2'];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='200' height='200'>
    <defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0' stop-color='${c[0]}'/><stop offset='1' stop-color='${c[1]}'/></linearGradient></defs>
    <rect width='200' height='200' fill='url(#g)'/>
    <circle cx='150' cy='60' r='22' fill='#fff' fill-opacity='0.6'/>
    <path d='M0 160 L60 110 L120 160 L160 130 L200 160 L200 200 L0 200 Z' fill='#fff' fill-opacity='0.35'/>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function FilesModal({ onClose, pushToast }) {
  const [view, setView] = useState('grid');
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = FILES_DATA.filter(f =>
    !query.trim() || f.name.toLowerCase().includes(query.toLowerCase()) ||
    f.who.toLowerCase().includes(query.toLowerCase())
  );

  function onDragEnter(e) { e.preventDefault(); setDragOver(true); }
  function onDragLeave(e) { if (e.target === e.currentTarget) setDragOver(false); }
  function onDrop(e) { e.preventDefault(); setDragOver(false); pushToast && pushToast('Upload queued'); }

  return React.createElement('div', { className: 'modal-overlay files-overlay', onClick: onClose },
    React.createElement('div', {
      className: 'files-modal' + (dragOver ? ' dragging' : ''),
      onClick: e => e.stopPropagation(),
      onDragOver: onDragEnter,
      onDragLeave: onDragLeave,
      onDrop: onDrop,
    },
      // Header
      React.createElement('header', { className: 'files-modal-head' },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flex: 1 } },
          React.createElement('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Shared files'),
          React.createElement('span', { style: { fontSize: 12, color: 'var(--text-2)' } }, filtered.length + ' files')
        ),
        React.createElement('div', { className: 'view-toggle' },
          React.createElement('button', {
            className: view === 'grid' ? 'active' : '',
            onClick: () => setView('grid'),
            title: 'Grid view',
          },
            React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 },
              React.createElement('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }),
              React.createElement('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }),
              React.createElement('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }),
              React.createElement('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 })
            )
          ),
          React.createElement('button', {
            className: view === 'list' ? 'active' : '',
            onClick: () => setView('list'),
            title: 'List view',
          },
            React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' },
              React.createElement('path', { d: 'M4 6h16M4 12h16M4 18h16' })
            )
          )
        ),
        React.createElement('button', { className: 'btn btn-primary', style: { height: 32 }, onClick: () => pushToast && pushToast('Upload queued') },
          React.createElement(Icon.plus, null), 'Upload'
        ),
        React.createElement('button', { className: 'icon-btn', onClick: onClose, title: 'Close' },
          React.createElement(Icon.x, null)
        )
      ),

      // Search bar
      React.createElement('div', { className: 'files-modal-search' },
        React.createElement('span', { style: { color: 'var(--text-3)', display: 'inline-flex' } },
          React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('circle', { cx: 11, cy: 11, r: 7 }),
            React.createElement('path', { d: 'M21 21l-4.3-4.3' })
          )
        ),
        React.createElement('input', {
          placeholder: 'Search files…',
          value: query,
          onChange: e => setQuery(e.target.value),
          autoFocus: true,
        })
      ),

      // Body
      React.createElement('div', { className: 'files-modal-body' },
        view === 'grid'
          ? React.createElement(GridView, { files: filtered })
          : React.createElement(ListView, { files: filtered })
      ),

      // Drag indicator
      dragOver && React.createElement('div', { className: 'drag-indicator' },
        React.createElement('div', { className: 'drag-pill' },
          React.createElement(Icon.plus, null),
          'Drop files to upload'
        )
      )
    )
  );
}

function GridView({ files }) {
  return React.createElement('div', { className: 'file-grid' },
    // upload-in-progress tile
    React.createElement('div', { className: 'upload-tile' },
      React.createElement('div', { className: 'upload-row' },
        React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' },
          React.createElement('path', { d: 'M12 4v12M7 9l5-5 5 5M5 20h14' })
        ),
        React.createElement('span', { className: 'name' }, 'brand-assets-final.zip'),
        React.createElement('span', { className: 'pct mono' }, '63%')
      ),
      React.createElement('div', { className: 'progress' }, React.createElement('div', { className: 'progress-bar', style: { width: '63%' } })),
      React.createElement('div', { style: { fontSize: 11, color: 'var(--text-2)' } }, 'Uploading · 2.8 MB / 4.4 MB')
    ),
    files.map((f, i) => React.createElement('div', { className: 'file-tile', key: i },
      React.createElement('div', { className: 'tile-preview' },
        f.kind === 'image'
          ? React.createElement('img', { src: imagePreviewURL(f.tone), alt: '' })
          : React.createElement('span', { className: 'tile-ext' }, f.ext)
      ),
      React.createElement('div', { className: 'tile-actions' },
        React.createElement('button', { title: 'Download' },
          React.createElement('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M12 4v12M7 11l5 5 5-5M5 20h14' })
          )
        ),
        React.createElement('button', { title: 'Delete' },
          React.createElement('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13' })
          )
        )
      ),
      React.createElement('div', { className: 'tile-meta' },
        React.createElement('div', { className: 'tile-name', title: f.name }, f.name),
        React.createElement('div', { className: 'tile-sub' }, f.size + ' · ' + f.who + ' · ' + f.when)
      )
    ))
  );
}

function ListView({ files }) {
  return React.createElement('table', { className: 'file-list' },
    React.createElement('thead', null,
      React.createElement('tr', null,
        React.createElement('th', { style: { width: '40%' } }, 'Name'),
        React.createElement('th', null, 'Size'),
        React.createElement('th', null, 'Uploaded by'),
        React.createElement('th', null, 'Time'),
        React.createElement('th', { style: { textAlign: 'right', width: 80 } }, 'Actions')
      )
    ),
    React.createElement('tbody', null,
      files.map((f, i) => React.createElement('tr', { key: i },
        React.createElement('td', null,
          React.createElement('div', { className: 'name-cell' },
            React.createElement('span', { className: 'file-icon', style: { background: 'var(--accent-soft)', color: 'var(--accent)' } }, f.ext),
            React.createElement('span', null, f.name)
          )
        ),
        React.createElement('td', { className: 'muted', style: { fontSize: 13 } }, f.size),
        React.createElement('td', { className: 'muted', style: { fontSize: 13 } }, f.who),
        React.createElement('td', { className: 'muted', style: { fontSize: 13 } }, f.when),
        React.createElement('td', { style: { textAlign: 'right' } },
          React.createElement('button', { className: 'icon-btn', title: 'Download' }, React.createElement(Icon.download, null)),
          React.createElement('button', { className: 'icon-btn', title: 'Delete' }, React.createElement(Icon.trash, null))
        )
      ))
    )
  );
}
