import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000]

export const useWsStore = defineStore('ws', () => {
  const state = ref('disconnected') // connected | connecting | reconnecting | disconnected
  const reconnectCount = ref(0)
  const ws = shallowRef(null)
  let retryTimer = null
  let retryIdx = 0

  // Callbacks set by the chat store
  const handlers = {}
  function on(type, fn) { handlers[type] = fn }

  function connect(token) {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) return
    _doConnect(token)
  }

  function _doConnect(token) {
    state.value = reconnectCount.value > 0 ? 'reconnecting' : 'connecting'
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${location.host}/ws?token=${token}`
    const socket = new WebSocket(url)
    ws.value = socket

    socket.onopen = () => {
      state.value = 'connected'
      retryIdx = 0
      reconnectCount.value = 0
      startHeartbeat()
      handlers.open && handlers.open()
    }

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        handlers[msg.type] && handlers[msg.type](msg)
        handlers['*'] && handlers['*'](msg)
      } catch {}
    }

    socket.onclose = (e) => {
      stopHeartbeat()
      if (e.code === 4401 || e.code === 4403) {
        state.value = 'disconnected'
        handlers.authError && handlers.authError(e.code)
        return
      }
      _scheduleReconnect(token)
    }

    socket.onerror = () => {
      // onclose fires after onerror, so nothing to do here
    }
  }

  function _scheduleReconnect(token) {
    state.value = 'reconnecting'
    reconnectCount.value++
    const delay = BACKOFF[Math.min(retryIdx, BACKOFF.length - 1)]
    retryIdx++
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => _doConnect(token), delay)
  }

  function disconnect() {
    clearTimeout(retryTimer)
    stopHeartbeat()
    retryIdx = 0
    reconnectCount.value = 0
    state.value = 'disconnected'
    if (ws.value) {
      ws.value.onclose = null
      ws.value.close()
      ws.value = null
    }
  }

  function send(obj) {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(obj))
      return true
    }
    return false
  }

  function ping() {
    send({ type: 'ping' })
  }

  // Client-side heartbeat
  let pingInterval = null
  function startHeartbeat() {
    stopHeartbeat()
    pingInterval = setInterval(ping, 25000)
  }
  function stopHeartbeat() {
    clearInterval(pingInterval)
    pingInterval = null
  }

  const connLabel = () => {
    if (state.value === 'connected') return 'Connected'
    if (state.value === 'connecting') return 'Connecting…'
    if (state.value === 'reconnecting') return `Reconnecting (${reconnectCount.value})…`
    return 'Disconnected'
  }

  return { state, reconnectCount, connect, disconnect, send, on, startHeartbeat, stopHeartbeat, connLabel }
})
