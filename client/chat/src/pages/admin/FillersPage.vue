<template>
  <header class="admin-top">
    <h1>Filler 文案</h1>
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

    <!-- 说明 -->
    <div style="font-size:13px;color:var(--text-2);margin-bottom:20px;line-height:1.6">
      以下文案会附加在对方消息气泡下方，让页面看起来像 AI 完整回复。<br>
      每条消息按 <code style="color:var(--text)">消息ID mod 文案数量</code> 确定性取一条，刷新后不变。
    </div>

    <!-- 新增表单 -->
    <div class="section-title" style="display:flex;align-items:center;gap:8px">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      添加文案
    </div>
    <div class="form-card" style="margin-bottom:24px">
      <div class="form-row">
        <label>文案内容</label>
        <textarea
          class="input"
          v-model="newContent"
          placeholder="每段之间空一行即可分割成多条，点击添加后自动批量写入…"
          style="resize:vertical;font-size:13px;line-height:1.6;min-height:220px"
        ></textarea>
        <div v-if="pendingCount > 0" style="font-size:12px;color:var(--text-3);margin-top:6px">
          将添加 <strong style="color:var(--accent)">{{ pendingCount }}</strong> 条文案（以空行分隔）
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
        <button class="btn btn-primary" @click="addFiller" :disabled="adding || pendingCount === 0">
          <span v-if="adding" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
          <span v-else>{{ pendingCount > 1 ? `批量添加 (${pendingCount} 条)` : '添加' }}</span>
        </button>
        <span v-if="addErr" style="font-size:13px;color:var(--danger)">{{ addErr }}</span>
      </div>
    </div>

    <!-- 列表 -->
    <div class="section-title" style="display:flex;align-items:center;gap:8px;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
        文案列表
      </span>
      <span style="font-size:12px;color:var(--text-3)">共 {{ fillers.length }} 条</span>
    </div>

    <div v-if="loading" style="color:var(--text-2);font-size:13px;padding:16px 0">加载中…</div>

    <div v-else-if="fillers.length === 0" class="table-card" style="padding:32px;text-align:center;color:var(--text-3);font-size:13px">
      暂无文案，请在上方添加。
    </div>

    <div v-else class="table-card" style="overflow:hidden">
      <div
        v-for="(f, idx) in fillers"
        :key="f.id"
        class="filler-admin-row"
        :class="{ 'filler-admin-row--alt': idx % 2 === 1 }"
      >
        <div class="filler-admin-idx">{{ idx }}</div>
        <div class="filler-admin-content">{{ f.content }}</div>
        <button
          class="icon-btn"
          style="flex-shrink:0;color:var(--text-3)"
          title="删除"
          @click="deleteFiller(f.id)"
          :disabled="deletingId === f.id"
        >
          <span v-if="deletingId === f.id" class="spinner" style="width:13px;height:13px;border-width:2px"></span>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>
          </svg>
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/index.js'

const loading    = ref(true)
const fillers    = ref([])
const newContent = ref('')
const adding     = ref(false)
const addErr     = ref('')
const deletingId = ref(null)

// 按空行拆分，实时预览条数
const pendingItems = computed(() =>
  newContent.value
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
)
const pendingCount = computed(() => pendingItems.value.length)

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark')
  localStorage.setItem('nodex-theme', isDark ? 'dark' : 'light')
}

async function load() {
  try {
    fillers.value = await api.adminFillers()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function addFiller() {
  const items = pendingItems.value
  if (!items.length) return
  adding.value = true; addErr.value = ''
  try {
    for (const content of items) {
      const created = await api.createFiller(content)
      fillers.value.push(created)
    }
    newContent.value = ''
  } catch (e) {
    addErr.value = e.message || '添加失败'
  } finally {
    adding.value = false
  }
}

async function deleteFiller(id) {
  deletingId.value = id
  try {
    await api.deleteFiller(id)
    fillers.value = fillers.value.filter(f => f.id !== id)
  } catch (e) {
    console.error(e)
  } finally {
    deletingId.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.filler-admin-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.filler-admin-row:last-child { border-bottom: none; }
.filler-admin-row--alt { background: var(--bg-2); }
.filler-admin-idx {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}
.filler-admin-content {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
