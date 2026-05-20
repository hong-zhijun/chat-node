<template>
  <header class="admin-top">
    <h1>概览</h1>
    <div style="margin-left:auto;display:flex;align-items:center;gap:12px">
      <span class="pill pill-admin">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        管理员
      </span>
      <button class="icon-btn" @click="toggleTheme" title="切换主题">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      </button>
    </div>
  </header>

  <div class="admin-body">
    <!-- KPI cards -->
    <div v-if="loading" style="color:var(--text-2);font-size:13px">加载中…</div>
    <div v-else class="kpi-grid">
      <div class="kpi">
        <div class="label"><span class="accent-dot"></span>在线用户</div>
        <div class="value">{{ stats.onlineUsers ?? '—' }}</div>
        <div class="sub">当前 WebSocket 连接数</div>
      </div>
      <div class="kpi">
        <div class="label">总用户数</div>
        <div class="value">{{ stats.totalUsers ?? '—' }}</div>
        <div class="sub">已注册账户</div>
      </div>
      <div class="kpi">
        <div class="label">总消息数</div>
        <div class="value">{{ fmtNum(stats.totalMessages) }}</div>
        <div class="sub">共 {{ stats.totalConversations ?? '—' }} 个会话</div>
      </div>
      <div class="kpi">
        <div class="label">存储占用</div>
        <div class="value">{{ fmtBytes(stats.storageBytes) }}</div>
        <div class="sub">聊天附件 + 共享文件</div>
      </div>
    </div>

    <!-- Chart -->
    <div class="section-title">近 7 天消息数</div>
    <div class="card chart-card">
      <div class="chart-bars">
        <div
          v-for="bar in chartBars"
          :key="bar.label"
          class="chart-bar"
          :style="{ height: bar.pct + '%' }"
          :title="bar.label + ': ' + bar.count"
        >
          <div class="top">{{ bar.count }}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);padding:28px 4px 0">
        <span v-for="bar in chartBars" :key="bar.label">{{ bar.label }}</span>
      </div>
    </div>

    <!-- Recent users -->
    <div class="section-title">最近创建的用户</div>
    <div class="table-card">
      <table class="tbl">
        <thead>
          <tr><th>姓名</th><th>用户 ID</th><th>创建时间</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="u in recentUsers" :key="u.userId">
            <td>{{ u.name }}</td>
            <td class="id">{{ u.userId }}</td>
            <td class="muted">{{ fmtDatetime(u.createdAt) }}</td>
            <td>
              <span class="pill" :class="u.status === 1 ? 'pill-active' : 'pill-disabled'">
                {{ u.status === 1 ? '启用' : '禁用' }}
              </span>
            </td>
          </tr>
          <tr v-if="!recentUsers.length">
            <td colspan="4" style="text-align:center;color:var(--text-3);padding:24px">暂无用户</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { api, fmtBytes, fmtDatetime } from '@/api/index.js'

const loading = ref(true)
const stats   = ref({})
const allUsers = ref([])

const recentUsers = computed(() =>
  [...allUsers.value].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8)
)

const chartBars = computed(() => {
  const daily = stats.value.dailyMessages || []
  if (!daily.length) {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000)
      return { label: d.toLocaleDateString('zh-CN', { weekday: 'short', day: 'numeric' }), count: 0, pct: 0 }
    })
  }
  const max = Math.max(...daily.map(d => d.count), 1)
  return daily.map(d => ({
    label: new Date(d.date).toLocaleDateString('zh-CN', { weekday: 'short', day: 'numeric' }),
    count: d.count,
    pct: Math.round((d.count / max) * 100)
  }))
})

function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString()
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark')
  localStorage.setItem('nodex-theme', isDark ? 'dark' : 'light')
}

onMounted(async () => {
  try {
    const [s, users] = await Promise.all([api.stats(), api.adminUsers()])
    stats.value = s
    allUsers.value = users
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>
