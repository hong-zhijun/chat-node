<template>
  <header class="admin-top">
    <h1>用户管理</h1>
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
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
        </span>
        <input class="input" v-model="search" placeholder="按姓名或用户 ID 搜索…" />
      </div>
      <button class="btn btn-primary" @click="openCreate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        新建用户
      </button>
    </div>

    <div class="table-card">
      <table class="tbl">
        <thead>
          <tr>
            <th>姓名</th><th>用户 ID</th><th>登录密钥</th>
            <th>连接状态</th><th>账户状态</th><th>Bark 推送</th>
            <th>创建时间</th><th style="text-align:right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" style="text-align:center;padding:32px;color:var(--text-2)">
              <span class="spinner"></span>
            </td>
          </tr>
          <tr v-for="u in filtered" :key="u.userId">
            <td style="font-weight:500">{{ u.name }}</td>
            <td class="id">{{ u.userId }}</td>
            <td>
              <span style="display:inline-flex;align-items:center;gap:6px">
                <code style="font-family:ui-monospace,monospace;font-size:12px;color:var(--text-2)">
                  {{ revealedKeys.has(u.userId) ? u.loginKey : '••••••••••••' }}
                </code>
                <button class="icon-btn" style="width:26px;height:26px" @click="toggleKey(u.userId)" title="显示/隐藏">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
                <button class="icon-btn" style="width:26px;height:26px" @click="copyKey(u.loginKey)" title="复制密钥">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>
                  </svg>
                </button>
              </span>
            </td>
            <td>
              <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px">
                <span
                  style="width:7px;height:7px;border-radius:50%;flex-shrink:0"
                  :style="{ background: u.online ? 'var(--success, #22c55e)' : 'var(--text-3)' }"
                ></span>
                {{ u.online ? '在线' : '离线' }}
              </span>
            </td>
            <td>
              <span class="pill" :class="u.status === 1 ? 'pill-active' : 'pill-disabled'">
                {{ u.status === 1 ? '启用' : '禁用' }}
              </span>
            </td>
            <td>
              <span
                v-if="u.barkKey"
                class="pill pill-active"
                style="cursor:pointer"
                @click="openBark(u)"
                title="已配置，点击修改"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                已配置
              </span>
              <button v-else class="btn btn-ghost" style="padding:2px 8px;font-size:12px;height:auto" @click="openBark(u)">
                + 配置
              </button>
            </td>
            <td class="muted" style="font-size:12px">{{ fmtDatetime(u.createdAt) }}</td>
            <td style="text-align:right">
              <span class="actions-cell">
                <button
                  class="icon-btn"
                  :title="u.status === 1 ? '禁用用户' : '启用用户'"
                  @click="toggleStatus(u)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>
                  </svg>
                </button>
                <button class="icon-btn" title="重置登录密钥" @click="openReset(u)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>
                  </svg>
                </button>
                <button class="icon-btn" title="删除用户" style="color:var(--danger)" @click="openDelete(u)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>
                  </svg>
                </button>
              </span>
            </td>
          </tr>
          <tr v-if="!loading && !filtered.length">
            <td colspan="8" style="text-align:center;padding:32px;color:var(--text-3)">
              {{ search ? '没有匹配的用户。' : '暂无用户。' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 创建用户弹窗 -->
  <div v-if="modal === 'create'" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h3>创建新用户</h3>
      <p>登录密钥仅显示一次，请及时保存。</p>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:12px;color:var(--text-2)">姓名 <span style="color:var(--danger)">*</span></label>
          <input class="input" v-model="form.name" placeholder="如：张三" style="margin-top:4px" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-2)">用户 ID <span style="color:var(--text-3)">（可选，不填则自动生成）</span></label>
          <input class="input" v-model="form.userId" placeholder="6 位数字，如：481202" style="margin-top:4px" />
        </div>
      </div>
      <div v-if="formError" style="font-size:12px;color:var(--danger);margin-top:8px">{{ formError }}</div>
      <div class="actions">
        <button class="btn btn-ghost" @click="closeModal" :disabled="formLoading">取消</button>
        <button class="btn btn-primary" @click="createUser" :disabled="formLoading || !form.name.trim()">
          <span v-if="formLoading" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
          <span v-else>创建</span>
        </button>
      </div>
    </div>
  </div>

  <!-- 创建成功——显示凭证 -->
  <div v-if="modal === 'created'" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h3>用户创建成功</h3>
      <p>请将以下凭证告知用户，关闭后将无法再次查看。</p>
      <div class="key-card">
        <div class="row"><span class="lbl">姓名</span><code>{{ created.name }}</code></div>
        <div class="row">
          <span class="lbl">用户 ID</span><code>{{ created.userId }}</code>
          <button class="icon-btn" @click="copyText(created.userId)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          </button>
        </div>
        <div class="row">
          <span class="lbl">登录密钥</span><code>{{ created.loginKey }}</code>
          <button class="icon-btn" @click="copyText(created.loginKey)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          </button>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" @click="closeModal">完成</button>
      </div>
    </div>
  </div>

  <!-- 重置密钥确认 -->
  <div v-if="modal === 'reset'" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h3 style="color:var(--danger)">重置登录密钥</h3>
      <p>确认重置 <strong>{{ target?.name }}</strong> 的登录密钥？旧密钥将立即失效。</p>
      <div class="actions">
        <button class="btn btn-ghost" @click="closeModal">取消</button>
        <button class="btn btn-danger" @click="resetKey" :disabled="formLoading">
          <span v-if="formLoading" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
          <span v-else>确认重置</span>
        </button>
      </div>
    </div>
  </div>

  <!-- 新密钥展示 -->
  <div v-if="modal === 'reset-done'" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h3>新登录密钥</h3>
      <p>请将新密钥发给用户，关闭后将无法再次查看。</p>
      <div class="key-card">
        <div class="row"><span class="lbl">用户</span><code>{{ created.name }} ({{ created.userId }})</code></div>
        <div class="row">
          <span class="lbl">登录密钥</span><code>{{ created.loginKey }}</code>
          <button class="icon-btn" @click="copyText(created.loginKey)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          </button>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" @click="closeModal">完成</button>
      </div>
    </div>
  </div>

  <!-- 删除用户确认 -->
  <div v-if="modal === 'delete'" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h3 style="color:var(--danger)">删除用户</h3>
      <p>确认删除 <strong>{{ target?.name }}</strong>？该用户的所有消息将一并永久删除，此操作不可撤销。</p>
      <div class="actions">
        <button class="btn btn-ghost" @click="closeModal">取消</button>
        <button class="btn btn-danger" @click="deleteUser" :disabled="formLoading">
          <span v-if="formLoading" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
          <span v-else>确认删除</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Bark 推送配置弹窗 -->
  <div v-if="modal === 'bark'" class="modal-overlay" @click.self="closeModal">
    <div class="modal">
      <h3>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-2px">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        Bark 推送配置
      </h3>
      <p style="font-size:13px;color:var(--text-2)">
        为 <strong>{{ target?.name }}</strong> 配置 Bark 推送地址。<br>
        收到新消息时将自动推送通知到 iPhone。
      </p>

      <div style="margin-top:12px">
        <label style="font-size:12px;color:var(--text-2)">Bark 推送地址</label>
        <input
          class="input"
          v-model="barkForm.key"
          placeholder="如：https://api.day.app/YOUR_DEVICE_KEY"
          style="margin-top:4px"
        />
        <div style="font-size:12px;color:var(--text-3);margin-top:6px;line-height:1.6">
          在 Bark App 中复制推送地址，格式为
          <code style="background:var(--bg-2);padding:1px 5px;border-radius:4px">https://api.day.app/xxxx</code>
          。支持自建服务器地址。
        </div>
      </div>

      <div v-if="formError" style="font-size:12px;color:var(--danger);margin-top:8px">{{ formError }}</div>

      <div class="actions" style="justify-content:space-between">
        <button
          v-if="target?.barkKey"
          class="btn btn-ghost"
          style="color:var(--danger)"
          @click="clearBark"
          :disabled="formLoading"
        >
          清除配置
        </button>
        <span v-else></span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" @click="closeModal" :disabled="formLoading">取消</button>
          <button class="btn btn-primary" @click="saveBark" :disabled="formLoading || !barkForm.key.trim()">
            <span v-if="formLoading" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
            <span v-else>保存</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { api, fmtDatetime } from '@/api/index.js'

const users       = ref([])
const loading     = ref(true)
const search      = ref('')
const modal       = ref(null)
const target      = ref(null)
const form        = reactive({ name: '', userId: '' })
const barkForm    = reactive({ key: '' })
const formError   = ref('')
const formLoading = ref(false)
const created     = ref({})
const revealedKeys = ref(new Set())

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u =>
    u.name.toLowerCase().includes(q) ||
    u.userId.toLowerCase().includes(q)
  )
})

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark')
  localStorage.setItem('nodex-theme', isDark ? 'dark' : 'light')
}

function toggleKey(userId) {
  const s = new Set(revealedKeys.value)
  s.has(userId) ? s.delete(userId) : s.add(userId)
  revealedKeys.value = s
}

function copyKey(key) { navigator.clipboard?.writeText(key) }
function copyText(t)  { navigator.clipboard?.writeText(t) }

function openCreate() {
  form.name = ''; form.userId = ''
  formError.value = ''
  modal.value = 'create'
}
function openReset(u)  { target.value = u; modal.value = 'reset' }
function openDelete(u) { target.value = u; modal.value = 'delete' }
function openBark(u)   { target.value = u; barkForm.key = u.barkKey || ''; formError.value = ''; modal.value = 'bark' }
function closeModal()  { modal.value = null; target.value = null; formLoading.value = false; formError.value = '' }

async function createUser() {
  if (!form.name.trim()) return
  formLoading.value = true; formError.value = ''
  try {
    const data = await api.createUser({ name: form.name.trim(), userId: form.userId.trim() || undefined })
    users.value.unshift(data)
    created.value = data
    modal.value = 'created'
  } catch (e) {
    formError.value = e.message || '创建用户失败。'
  } finally {
    formLoading.value = false
  }
}

async function toggleStatus(u) {
  const newStatus = u.status === 1 ? 0 : 1
  try {
    await api.updateUser(u.userId, { status: newStatus })
    u.status = newStatus
  } catch (e) {
    alert('更新用户状态失败。')
  }
}

async function resetKey() {
  if (!target.value) return
  formLoading.value = true
  try {
    const data = await api.updateUser(target.value.userId, { resetKey: true })
    const u = users.value.find(x => x.userId === target.value.userId)
    if (u && data.loginKey) u.loginKey = data.loginKey
    created.value = { ...target.value, loginKey: data.loginKey }
    modal.value = 'reset-done'
  } catch (e) {
    alert('重置密钥失败。')
    closeModal()
  } finally {
    formLoading.value = false
  }
}

async function deleteUser() {
  if (!target.value) return
  formLoading.value = true
  try {
    await api.deleteUser(target.value.userId)
    users.value = users.value.filter(u => u.userId !== target.value.userId)
    closeModal()
  } catch (e) {
    alert('删除用户失败。')
    formLoading.value = false
  }
}

async function saveBark() {
  if (!target.value || !barkForm.key.trim()) return
  formLoading.value = true; formError.value = ''
  try {
    await api.updateUser(target.value.userId, { barkKey: barkForm.key.trim() })
    const u = users.value.find(x => x.userId === target.value.userId)
    if (u) u.barkKey = barkForm.key.trim()
    closeModal()
  } catch (e) {
    formError.value = e.message || '保存失败。'
    formLoading.value = false
  }
}

async function clearBark() {
  if (!target.value) return
  formLoading.value = true; formError.value = ''
  try {
    await api.updateUser(target.value.userId, { barkKey: '' })
    const u = users.value.find(x => x.userId === target.value.userId)
    if (u) u.barkKey = null
    closeModal()
  } catch (e) {
    formError.value = e.message || '清除失败。'
    formLoading.value = false
  }
}

onMounted(async () => {
  try {
    users.value = await api.adminUsers()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>
