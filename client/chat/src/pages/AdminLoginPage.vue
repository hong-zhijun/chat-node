<template>
  <div class="page">
    <div class="top-spacer"></div>
    <main class="wrap">
      <div class="card auth-card">
        <div class="brand-row">
          <span class="shield-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </span>
          <span class="wordmark" style="font-size:20px"><span class="wordmark-dot"></span>nodex</span>
        </div>
        <h1>管理后台</h1>
        <p class="sub">输入管理员密钥以进入后台。</p>

        <form @submit.prevent="submit">
          <div class="field">
            <input
              v-model="key"
              :type="showKey ? 'text' : 'password'"
              class="input"
              placeholder="管理员密钥"
              autocomplete="off"
            />
            <button type="button" class="eye" @click="showKey = !showKey">
              <svg v-if="!showKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <div class="err" :class="{ 'err-empty': !error }">{{ error || 'placeholder' }}</div>
          <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
            <span v-if="loading" class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
            <span v-else>登录管理后台</span>
          </button>
        </form>

        <div class="alt">
          <router-link to="/login">← 返回用户登录</router-link>
        </div>
      </div>
    </main>
    <div class="legal">© 2026 Nodex · 管理控制台</div>
  </div>
  <button class="theme-fab" @click="toggleTheme">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
    {{ isDark ? 'Dark' : 'Light' }}
  </button>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { api } from '@/api/index.js'

const router = useRouter()
const auth = useAuthStore()
const key = ref('')
const showKey = ref(false)
const error = ref('')
const loading = ref(false)
const isDark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  isDark.value = document.documentElement.classList.toggle('dark')
  localStorage.setItem('nodex-theme', isDark.value ? 'dark' : 'light')
}

async function submit() {
  error.value = ''
  if (!key.value.trim()) { error.value = '请输入管理员密钥。'; return }
  loading.value = true
  try {
    const data = await api.adminLogin(key.value.trim())
    auth.setAdmin(data.token)
    router.push('/admin')
  } catch (e) {
    error.value = '管理员密钥错误。'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.err { min-height: 18px; font-size: 12px; color: var(--danger); margin: 4px 0 12px; }
.err-empty { visibility: hidden; }
</style>
