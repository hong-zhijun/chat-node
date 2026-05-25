const BASE = import.meta.env.VITE_API_BASE || ''

function getToken(admin = false) {
  return localStorage.getItem(admin ? 'nodex-admin-token' : 'nodex-token') || ''
}

async function req(method, path, { body, token, isAdmin } = {}) {
  const t = token !== undefined ? token : getToken(isAdmin)
  const headers = {}
  if (t) headers['Authorization'] = `Bearer ${t}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) {
    const err = new Error(data.error?.message || 'Request failed')
    err.code = data.error?.code
    err.status = res.status
    throw err
  }
  return data.data
}

export const api = {
  // Auth
  login:   (loginKey, deviceLabel) => req('POST', '/api/auth/login', { body: { loginKey, deviceLabel }, token: '' }),
  logout:  () => req('POST', '/api/auth/logout'),
  me:      () => req('GET',  '/api/auth/me'),
  updateSettings: (data) => req('PATCH', '/api/auth/settings', { body: data }),

  // Admin
  adminLogin: (adminKey) => req('POST', '/api/admin/login', { body: { adminKey }, token: '' }),
  stats:   () => req('GET',  '/api/admin/stats', { isAdmin: true }),
  adminUsers: () => req('GET', '/api/admin/users', { isAdmin: true }),
  createUser: (data) => req('POST', '/api/admin/users', { body: data, isAdmin: true }),
  updateUser: (userId, data) => req('PATCH', `/api/admin/users/${userId}`, { body: data, isAdmin: true }),
  deleteUser: (userId) => req('DELETE', `/api/admin/users/${userId}`, { isAdmin: true }),
  adminConfig: () => req('GET', '/api/admin/config', { isAdmin: true }),
  updateAdminConfig: (data) => req('PATCH', '/api/admin/config', { body: data, isAdmin: true }),

  cleanupMsgPreview: (params) => req('POST', '/api/admin/cleanup/messages/preview', { body: params, isAdmin: true }),
  cleanupMsgExecute: (params) => req('POST', '/api/admin/cleanup/messages/execute', { body: params, isAdmin: true }),
  cleanupFilePreview: (params) => req('POST', '/api/admin/cleanup/files/preview', { body: params, isAdmin: true }),
  cleanupFileExecute: (params) => req('POST', '/api/admin/cleanup/files/execute', { body: params, isAdmin: true }),

  // Users
  findUser: (userId) => req('GET', `/api/users/${userId}`),

  // Conversations
  conversations: () => req('GET', '/api/conversations'),
  hideConversation: (peerId) => req('DELETE', `/api/conversations/${peerId}`),

  // Messages
  messages: (peerId, { before, limit } = {}) => {
    const q = new URLSearchParams({ peerId })
    if (before) q.set('before', before)
    if (limit) q.set('limit', limit)
    return req('GET', `/api/messages?${q}`)
  },
  missed: (afterId) => req('GET', `/api/messages/missed?afterId=${afterId || 0}`),
  recall: (messageId) => req('POST', '/api/messages/recall', { body: { messageId } }),
  markRead: (peerId, lastReadMessageId) => req('POST', '/api/messages/read', { body: { peerId, lastReadMessageId } }),

  // Files
  uploadFile: async (file, scope) => {
    const form = new FormData()
    form.append('file', file)
    const t = getToken()
    const res = await fetch(`${BASE}/api/files/upload?scope=${scope}`, {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: form
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      const err = new Error(data.error?.message || 'Upload failed')
      err.code = data.error?.code
      throw err
    }
    return data.data
  },
  fileUrl:  (fileId) => `${BASE}/api/files/${fileId}?token=${getToken()}`,
  thumbUrl: (fileId) => `${BASE}/api/files/${fileId}/thumbnail?token=${getToken()}`,

  // AI Fillers
  fillers:      ()        => req('GET',    '/api/fillers'),
  adminFillers: ()        => req('GET',    '/api/admin/fillers',      { isAdmin: true }),
  createFiller: (content) => req('POST',   '/api/admin/fillers',      { body: { content }, isAdmin: true }),
  deleteFiller: (id)      => req('DELETE', `/api/admin/fillers/${id}`, { isAdmin: true }),

  // Stickers
  stickers:      ()       => req('GET',    '/api/stickers'),
  adminStickers: ()       => req('GET',    '/api/admin/stickers',      { isAdmin: true }),
  uploadSticker: async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const t = getToken(true) // admin token
    const res = await fetch(`${BASE}/api/admin/stickers`, {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      const err = new Error(data.error?.message || 'Upload failed')
      err.code = data.error?.code
      throw err
    }
    return data.data
  },
  deleteSticker: (fileId) => req('DELETE', `/api/admin/stickers/${fileId}`, { isAdmin: true }),
  // 管理后台专用缩略图（使用 admin token）
  adminStickerThumb: (fileId) => `${BASE}/api/admin/stickers/${fileId}/thumbnail?token=${getToken(true)}`,
  adminStickerImg:   (fileId) => `${BASE}/api/admin/stickers/${fileId}/image?token=${getToken(true)}`,

  // Share
  share: ({ before, limit, q } = {}) => {
    const qs = new URLSearchParams()
    if (before) qs.set('before', before)
    if (limit) qs.set('limit', limit)
    if (q) qs.set('q', q)
    return req('GET', `/api/share?${qs}`)
  },
  deleteShare: (fileId) => req('DELETE', `/api/share/${fileId}`)
}

export function fmtBytes(b) {
  if (b == null) return '—'
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB'
  return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

export function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  if (diff < 7 * 86400000) {
    return d.toLocaleDateString([], { weekday: 'short' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function fmtDatetime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function extOf(filename) {
  const m = /\.([^.]+)$/.exec(filename || '')
  return m ? m[1].toUpperCase() : 'FILE'
}

const AVATAR_COLORS = ['#5B5BD6','#7A56B5','#1F8A5B','#C77D2F','#D4373B','#2A6FDB','#7A7AFF','#4A9A8E']
export function avatarColor(seed) {
  let h = 0
  for (let i = 0; i < (seed || '').length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
