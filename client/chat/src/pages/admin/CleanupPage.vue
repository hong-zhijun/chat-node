<template>
  <header class="admin-top">
    <h1>数据清理</h1>
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
    <div class="tabs">
      <button :class="{ active: tab === 'messages' }" @click="tab = 'messages'">消息</button>
      <button :class="{ active: tab === 'files' }" @click="tab = 'files'">文件</button>
    </div>

    <!-- ── 消息 tab ── -->
    <div v-show="tab === 'messages'">
      <div class="form-card">
        <div class="form-row">
          <label>删除早于此日期的消息</label>
          <input class="input" type="date" v-model="msg.before" />
          <div class="help">所有早于该日期的消息将被永久删除。</div>
        </div>
        <div class="form-row">
          <label>按用户筛选（可选）</label>
          <select class="input" v-model="msg.userId">
            <option value="">所有用户</option>
            <option v-for="u in users" :key="u.userId" :value="u.userId">
              {{ u.name }} ({{ u.userId }})
            </option>
          </select>
          <div class="help">仅删除指定用户发送的消息。</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-secondary" @click="previewMsg" :disabled="msgLoading || !msg.before">
            <span v-if="msgLoading && !msgPreview" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
            <span v-else>预览</span>
          </button>
          <button class="btn btn-danger" :disabled="!msgPreview || msgLoading" @click="openConfirm('msg')">
            确认删除
          </button>
        </div>

        <!-- 预览结果 -->
        <div v-if="msgPreview" class="preview-result">
          <div class="num">将删除 {{ msgPreview.count.toLocaleString() }} 条消息。</div>
          <div class="muted" style="font-size:13px">
            涉及 {{ msgPreview.users }} 个用户 ·
            {{ msgPreview.conversations }} 个会话
          </div>
          <details v-if="msgPreview.breakdown?.length" style="margin-top:12px">
            <summary style="cursor:pointer;font-size:13px;color:var(--text-2)">按用户查看明细</summary>
            <table class="tbl" style="margin-top:8px">
              <thead><tr><th>用户</th><th style="text-align:right">消息数</th></tr></thead>
              <tbody>
                <tr v-for="b in msgPreview.breakdown" :key="b.userId">
                  <td>{{ b.name }} ({{ b.userId }})</td>
                  <td style="text-align:right" class="mono">{{ b.count.toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>

    <!-- ── 文件 tab ── -->
    <div v-show="tab === 'files'">
      <div class="form-card">
        <div class="form-row">
          <label>删除早于此日期的文件</label>
          <input class="input" type="date" v-model="file.before" />
        </div>
        <div class="form-row">
          <label>删除大于指定大小的文件（可选）</label>
          <div style="display:flex;gap:8px">
            <input class="input" type="number" v-model="file.minSizeMB" placeholder="如：20" style="max-width:120px" min="0" />
            <span class="input" style="max-width:60px;display:inline-flex;align-items:center;color:var(--text-2);cursor:default">MB</span>
          </div>
          <div class="help">可选，留空则不限制文件大小。</div>
        </div>
        <div class="form-row">
          <label>清理范围</label>
          <div class="checkbox-row">
            <input id="cb-chat"  type="checkbox" v-model="file.chatFiles" />
            <label for="cb-chat">聊天附件</label>
          </div>
          <div class="checkbox-row">
            <input id="cb-share" type="checkbox" v-model="file.shareFiles" />
            <label for="cb-share">共享文件</label>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-secondary" @click="previewFile" :disabled="fileLoading || !fileFilterValid">
            <span v-if="fileLoading && !filePreview" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
            <span v-else>预览</span>
          </button>
          <button class="btn btn-danger" :disabled="!filePreview || fileLoading" @click="openConfirm('files')">
            确认删除
          </button>
        </div>

        <!-- 预览结果 -->
        <div v-if="filePreview" class="preview-result">
          <div class="num">将删除 {{ filePreview.count }} 个文件（{{ fmtBytes(filePreview.totalBytes) }}）。</div>
          <div class="muted" style="font-size:13px">
            聊天附件 {{ filePreview.chatCount ?? 0 }} 个 · 共享文件 {{ filePreview.shareCount ?? 0 }} 个
          </div>
          <details v-if="filePreview.files?.length" style="margin-top:12px">
            <summary style="cursor:pointer;font-size:13px;color:var(--text-2)">查看文件列表</summary>
            <table class="tbl" style="margin-top:8px">
              <thead><tr><th>文件名</th><th>大小</th><th>上传时间</th></tr></thead>
              <tbody>
                <tr v-for="f in filePreview.files.slice(0, 10)" :key="f.fileId">
                  <td>{{ f.filename }}</td>
                  <td class="mono">{{ fmtBytes(f.size) }}</td>
                  <td class="muted">{{ fmtDatetime(f.createdAt) }}</td>
                </tr>
                <tr v-if="filePreview.files.length > 10">
                  <td colspan="3" class="muted" style="text-align:center">…还有 {{ filePreview.files.length - 10 }} 个</td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
  </div>

  <!-- 确认弹窗 -->
  <div v-if="showConfirm" class="modal-overlay" @click.self="showConfirm = false">
    <div class="modal">
      <h3 style="color:var(--danger)">请再次确认操作</h3>
      <p v-if="confirmKind === 'msg'">
        将永久删除 <strong>{{ msgPreview?.count?.toLocaleString() }} 条消息</strong>，此操作不可撤销。
      </p>
      <p v-else>
        将永久删除 <strong>{{ filePreview?.count }} 个文件（{{ fmtBytes(filePreview?.totalBytes) }}）</strong>，此操作不可撤销。
      </p>
      <div>
        <label style="font-size:12px;color:var(--text-2)">请输入 <code>DELETE</code> 确认</label>
        <input class="input" v-model="confirmInput" placeholder="DELETE" style="margin-top:6px" />
      </div>
      <div class="actions">
        <button class="btn btn-ghost" @click="showConfirm = false">取消</button>
        <button
          class="btn btn-danger"
          :disabled="confirmInput !== 'DELETE' || confirmLoading"
          @click="executeCleanup"
        >
          <span v-if="confirmLoading" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
          <span v-else>删除</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { api, fmtBytes, fmtDatetime } from '@/api/index.js'

const tab  = ref('messages')
const users = ref([])

// ── 消息 ──────────────────────────────────────────────────────────────
const msg        = reactive({ before: '', userId: '' })
const msgLoading = ref(false)
const msgPreview = ref(null)

async function previewMsg() {
  if (!msg.before) return
  msgLoading.value = true; msgPreview.value = null
  try {
    const params = { before: new Date(msg.before).getTime() }
    if (msg.userId) params.userId = msg.userId
    msgPreview.value = await api.cleanupMsgPreview(params)
  } catch (e) {
    alert('预览失败：' + e.message)
  } finally {
    msgLoading.value = false
  }
}

// ── 文件 ─────────────────────────────────────────────────────────────
const file        = reactive({ before: '', minSizeMB: '', chatFiles: true, shareFiles: true })
const fileLoading = ref(false)
const filePreview = ref(null)

const fileFilterValid = computed(() => file.before && (file.chatFiles || file.shareFiles))

async function previewFile() {
  if (!fileFilterValid.value) return
  fileLoading.value = true; filePreview.value = null
  try {
    const params = {
      before: new Date(file.before).getTime(),
      minSizeBytes: file.minSizeMB ? Math.round(parseFloat(file.minSizeMB) * 1024 * 1024) : undefined,
      scope: file.chatFiles && file.shareFiles ? 'all' : file.chatFiles ? 'chat' : 'share'
    }
    filePreview.value = await api.cleanupFilePreview(params)
  } catch (e) {
    alert('预览失败：' + e.message)
  } finally {
    fileLoading.value = false
  }
}

// ── 确认 & 执行 ────────────────────────────────────────────────────────
const showConfirm   = ref(false)
const confirmKind   = ref('msg')
const confirmInput  = ref('')
const confirmLoading = ref(false)

function openConfirm(kind) {
  confirmKind.value  = kind
  confirmInput.value = ''
  showConfirm.value  = true
}

async function executeCleanup() {
  confirmLoading.value = true
  try {
    if (confirmKind.value === 'msg') {
      const params = { before: new Date(msg.before).getTime() }
      if (msg.userId) params.userId = msg.userId
      await api.cleanupMsgExecute(params)
      msgPreview.value = null
    } else {
      const params = {
        before: new Date(file.before).getTime(),
        minSizeBytes: file.minSizeMB ? Math.round(parseFloat(file.minSizeMB) * 1024 * 1024) : undefined,
        scope: file.chatFiles && file.shareFiles ? 'all' : file.chatFiles ? 'chat' : 'share'
      }
      await api.cleanupFileExecute(params)
      filePreview.value = null
    }
    showConfirm.value = false
  } catch (e) {
    alert('清理失败：' + e.message)
  } finally {
    confirmLoading.value = false
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark')
  localStorage.setItem('nodex-theme', isDark ? 'dark' : 'light')
}

onMounted(async () => {
  try { users.value = await api.adminUsers() } catch {}
})
</script>
