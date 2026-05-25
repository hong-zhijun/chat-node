import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { api } from '@/api/index.js'
const uuidv4 = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16 | 0
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
      })
import { useWsStore } from './ws.js'

const LAST_ID_KEY = 'nodex-last-msg-id'

function getLastId() { return parseInt(localStorage.getItem(LAST_ID_KEY) || '0', 10) }
function setLastId(id) { if (id > getLastId()) localStorage.setItem(LAST_ID_KEY, String(id)) }

export const useChatStore = defineStore('chat', () => {
  const conversations = ref([])   // [{ peer, lastMessageId, lastMessageAt, preview, unread }]
  const messages = reactive({})   // peerId -> Message[]
  const activePeerId = ref(null)
  const pendingMsgs = reactive({}) // clientMsgId -> { peerId, content, type, tempId }

  const wsStore = useWsStore()

  // ── WS event wiring ──────────────────────────────────────────────
  wsStore.on('open', onWsOpen)
  wsStore.on('message', onWsMessage)
  wsStore.on('ack', onWsAck)
  wsStore.on('recall', onWsRecall)
  wsStore.on('read', onWsRead)

  async function onWsOpen() {
    wsStore.startHeartbeat()
    // 断线补发
    const afterId = getLastId()
    try {
      const missed = await api.missed(afterId)
      for (const m of missed) {
        _ingestMessage(m)
        setLastId(m.id)
      }
    } catch {}
    // 重发待确认消息
    for (const [clientMsgId, p] of Object.entries(pendingMsgs)) {
      const payload = { type: 'send', clientMsgId, to: p.peerId, msgType: p.type, content: p.content }
      if (p.replyToId) payload.replyToId = p.replyToId
      wsStore.send(payload)
    }
    // 刷新会话列表
    await loadConversations()
  }

  function onWsMessage(msg) {
    _ingestMessage(msg.data)
    setLastId(msg.data.id)
  }

  function onWsAck(msg) {
    const pending = pendingMsgs[msg.clientMsgId]
    if (!pending) return
    // 用服务端 id 替换临时消息
    const list = messages[pending.peerId]
    if (list) {
      const idx = list.findIndex(m => m.tempId === pending.tempId)
      if (idx !== -1) {
        list[idx] = { ...list[idx], id: msg.messageId, createdAt: msg.createdAt, state: 'sent' }
      }
    }
    delete pendingMsgs[msg.clientMsgId]
    setLastId(msg.messageId)
    // 更新会话预览
    _updateConvPreview(pending.peerId, { id: msg.messageId })
  }

  function onWsRecall(msg) {
    for (const list of Object.values(messages)) {
      const m = list.find(x => x.id === msg.messageId)
      if (m) m.recalled = true
      // 同步更新所有引用该消息的 replyTo
      for (const x of list) {
        if (x.replyTo && x.replyTo.id === msg.messageId) {
          x.replyTo = { ...x.replyTo, recalled: true, preview: '[消息已撤回]' }
        }
      }
    }
  }

  function onWsRead(msg) {
    // msg = { type:'read', peerId: senderUserId, lastReadMessageId }
    const list = messages[msg.peerId]
    if (!list) return
    for (const m of list) {
      if (m.id && m.id <= msg.lastReadMessageId && m.fromUserId !== msg.peerId) {
        m.state = 'read'
      }
    }
  }

  // ── ingest ────────────────────────────────────────────────────────
  function _ingestMessage(m) {
    const peerId = m.fromUserId === selfUserId() ? m.toUserId : m.fromUserId
    if (!messages[peerId]) messages[peerId] = []
    // 去重
    if (m.id && messages[peerId].some(x => x.id === m.id)) return
    messages[peerId].push({ ...m, state: m.fromUserId === selfUserId() ? 'sent' : undefined })
    messages[peerId].sort((a, b) => (a.id || 0) - (b.id || 0))

    // 更新会话列表
    const existingConv = conversations.value.find(c => c.peer.userId === peerId)
    if (!existingConv) {
      // 新对话——不知道 peer 名字，稍后会通过 loadConversations 获取
      loadConversations()
    } else {
      _updateConvPreview(peerId, m)
      if (m.fromUserId !== selfUserId()) {
        // 只有对话激活且标签页可见才立即标为已读，否则累积 unread
        if (peerId === activePeerId.value && !document.hidden) {
          markRead(peerId)
        } else {
          existingConv.unread = (existingConv.unread || 0) + 1
        }
      }
    }
  }

  function _updateConvPreview(peerId, m) {
    const conv = conversations.value.find(c => c.peer.userId === peerId)
    if (!conv) return
    let preview = ''
    if (m.type === 'text') preview = typeof m.content === 'string' ? m.content : ''
    else if (m.type === 'image') preview = '[图片]'
    else if (m.type === 'file') preview = '[文件]'
    else if (m.type === 'sticker') preview = '[表情包]'
    if (m.recalled) preview = '[已撤回]'
    conv.preview = preview.slice(0, 80)
    conv.lastMessageAt = m.createdAt || Date.now()
    conversations.value.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))
  }

  function selfUserId() {
    const u = JSON.parse(localStorage.getItem('nodex-user') || 'null')
    return u?.userId || ''
  }

  // ── public API ────────────────────────────────────────────────────
  async function loadConversations() {
    try {
      conversations.value = await api.conversations()
    } catch {}
  }

  async function loadMessages(peerId, before) {
    if (!messages[peerId]) messages[peerId] = []
    const list = await api.messages(peerId, { before, limit: 50 })
    const existing = new Set(messages[peerId].map(m => m.id))
    const self = selfUserId()
    for (const m of list) {
      if (!existing.has(m.id)) {
        // 历史消息没有 state 字段，从服务端返回的 readAt 推导
        const state = m.fromUserId === self ? (m.readAt ? 'read' : 'sent') : undefined
        messages[peerId].unshift({ ...m, state })
      }
    }
    messages[peerId].sort((a, b) => (a.id || 0) - (b.id || 0))
    if (list.length) setLastId(Math.max(...list.map(m => m.id)))
    return list.length === 50 // hasMore
  }

  function sendText(peerId, text, replyTo = null) {
    const clientMsgId = uuidv4()
    const tempId = 'tmp-' + clientMsgId
    const self = selfUserId()
    const tempMsg = {
      tempId, clientMsgId,
      fromUserId: self, toUserId: peerId,
      type: 'text', content: text,
      createdAt: Date.now(), state: 'sending',
      replyTo: replyTo || null
    }
    if (!messages[peerId]) messages[peerId] = []
    messages[peerId].push(tempMsg)
    pendingMsgs[clientMsgId] = { peerId, type: 'text', content: text, tempId, replyToId: replyTo?.id || null }

    const payload = { type: 'send', clientMsgId, to: peerId, msgType: 'text', content: text }
    if (replyTo?.id) payload.replyToId = replyTo.id
    const sent = wsStore.send(payload)
    if (!sent) {
      tempMsg.state = 'failed'
    }
    _updateConvPreview(peerId, tempMsg)
  }

  async function sendImage(peerId, file, replyTo = null) {
    const uploaded = await api.uploadFile(file, 'chat')
    const clientMsgId = uuidv4()
    const tempId = 'tmp-' + clientMsgId
    const content = { fileId: uploaded.fileId, filename: uploaded.filename, size: uploaded.size, mime: uploaded.mime, width: uploaded.width, height: uploaded.height }
    const self = selfUserId()
    const tempMsg = { tempId, clientMsgId, fromUserId: self, toUserId: peerId, type: 'image', content, createdAt: Date.now(), state: 'sending', replyTo: replyTo || null }
    if (!messages[peerId]) messages[peerId] = []
    messages[peerId].push(tempMsg)
    pendingMsgs[clientMsgId] = { peerId, type: 'image', content, tempId, replyToId: replyTo?.id || null }
    const payload = { type: 'send', clientMsgId, to: peerId, msgType: 'image', content }
    if (replyTo?.id) payload.replyToId = replyTo.id
    wsStore.send(payload)
  }

  function sendSticker(peerId, sticker, replyTo = null) {
    const clientMsgId = uuidv4()
    const tempId = 'tmp-' + clientMsgId
    const self = selfUserId()
    const content = { fileId: sticker.file_id, width: sticker.width, height: sticker.height }
    const tempMsg = {
      tempId, clientMsgId,
      fromUserId: self, toUserId: peerId,
      type: 'sticker', content,
      createdAt: Date.now(), state: 'sending',
      replyTo: replyTo || null
    }
    if (!messages[peerId]) messages[peerId] = []
    messages[peerId].push(tempMsg)
    pendingMsgs[clientMsgId] = { peerId, type: 'sticker', content, tempId, replyToId: replyTo?.id || null }
    const payload = { type: 'send', clientMsgId, to: peerId, msgType: 'sticker', content }
    if (replyTo?.id) payload.replyToId = replyTo.id
    wsStore.send(payload)
    _updateConvPreview(peerId, tempMsg)
  }

  async function sendFile(peerId, file, replyTo = null) {
    const uploaded = await api.uploadFile(file, 'chat')
    const clientMsgId = uuidv4()
    const tempId = 'tmp-' + clientMsgId
    const content = { fileId: uploaded.fileId, filename: uploaded.filename, size: uploaded.size, mime: uploaded.mime }
    const self = selfUserId()
    const tempMsg = { tempId, clientMsgId, fromUserId: self, toUserId: peerId, type: 'file', content, createdAt: Date.now(), state: 'sending', replyTo: replyTo || null }
    if (!messages[peerId]) messages[peerId] = []
    messages[peerId].push(tempMsg)
    pendingMsgs[clientMsgId] = { peerId, type: 'file', content, tempId, replyToId: replyTo?.id || null }
    const payload = { type: 'send', clientMsgId, to: peerId, msgType: 'file', content }
    if (replyTo?.id) payload.replyToId = replyTo.id
    wsStore.send(payload)
  }

  async function recallMessage(messageId) {
    wsStore.send({ type: 'recall', messageId })
    // 乐观更新
    for (const list of Object.values(messages)) {
      const m = list.find(x => x.id === messageId)
      if (m) { m.recalled = true; break }
    }
  }

  function markRead(peerId) {
    const list = messages[peerId]
    if (!list || !list.length) return
    const lastMsg = [...list].reverse().find(m => m.id && m.fromUserId !== selfUserId())
    if (!lastMsg) return
    const conv = conversations.value.find(c => c.peer.userId === peerId)
    if (conv) conv.unread = 0
    api.markRead(peerId, lastMsg.id).catch(() => {})
    wsStore.send({ type: 'read', peerId, lastMessageId: lastMsg.id })
  }

  function setActive(peerId) {
    activePeerId.value = peerId
    if (peerId) markRead(peerId)
  }

  async function hideConversation(peerId) {
    await api.hideConversation(peerId)
    conversations.value = conversations.value.filter(c => c.peer.userId !== peerId)
    if (activePeerId.value === peerId) activePeerId.value = null
  }

  const totalUnread = computed(() =>
    conversations.value.reduce((sum, c) => sum + (c.unread || 0), 0)
  )

  return {
    conversations, messages, activePeerId, totalUnread,
    loadConversations, loadMessages, sendText, sendImage, sendFile, sendSticker,
    recallMessage, markRead, setActive, hideConversation, selfUserId
  }
})
