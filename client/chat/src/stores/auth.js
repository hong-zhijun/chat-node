import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/index.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('nodex-token') || '')
  const user = ref(JSON.parse(localStorage.getItem('nodex-user') || 'null'))

  const adminToken = ref(localStorage.getItem('nodex-admin-token') || '')

  function setUser(u, t) {
    user.value = u
    token.value = t
    localStorage.setItem('nodex-token', t)
    localStorage.setItem('nodex-user', JSON.stringify(u))
  }

  function setAdmin(t) {
    adminToken.value = t
    localStorage.setItem('nodex-admin-token', t)
  }

  async function login(loginKey, deviceLabel) {
    const data = await api.login(loginKey, deviceLabel)
    setUser(data.user, data.token)
    return data
  }

  async function updateSettings({ notifyBlink, notifyUnread }) {
    await api.updateSettings({ notifyBlink, notifyUnread })
    const updated = { ...user.value, notifyBlink, notifyUnread }
    user.value = updated
    localStorage.setItem('nodex-user', JSON.stringify(updated))
  }

  function logout() {
    api.logout().catch(() => {})
    token.value = ''
    user.value = null
    localStorage.removeItem('nodex-token')
    localStorage.removeItem('nodex-user')
    localStorage.removeItem('nodex-last-msg-id')
  }

  function adminLogout() {
    adminToken.value = ''
    localStorage.removeItem('nodex-admin-token')
  }

  const isLoggedIn = () => !!token.value && !!user.value
  const isAdminLoggedIn = () => !!adminToken.value

  return { token, user, adminToken, login, logout, updateSettings, setAdmin, adminLogout, isLoggedIn, isAdminLoggedIn }
})
