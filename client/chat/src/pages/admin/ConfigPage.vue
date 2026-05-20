<template>
  <header class="admin-top">
    <h1>系统设置</h1>
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

    <!-- Bark 推送设置 -->
    <div class="section-title" style="display:flex;align-items:center;gap:8px">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      Bark 推送全局设置
    </div>

    <div class="form-card">
      <div v-if="loading" style="color:var(--text-2);font-size:13px;padding:8px 0">加载中…</div>
      <template v-else>

        <!-- Icon URL -->
        <div class="form-row">
          <label>推送图标 URL</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input
              class="input"
              v-model="form.bark_icon"
              placeholder="https://example.com/icon.png"
              style="flex:1"
            />
            <img
              v-if="iconPreviewUrl"
              :src="iconPreviewUrl"
              style="width:32px;height:32px;border-radius:6px;object-fit:cover;flex-shrink:0;background:var(--bg-2)"
              @error="iconLoadErr = true"
            />
          </div>
          <div class="help">
            推送通知中显示的图标，填写可公开访问的图片 URL。留空则不附带图标。
          </div>
        </div>

        <!-- Click URL -->
        <div class="form-row">
          <label>点击跳转链接</label>
          <input
            class="input"
            v-model="form.bark_click_url"
            placeholder="https://your-chat-url.com"
          />
          <div class="help">
            用户点击推送通知后跳转的链接（如聊天系统地址）。留空则点击仅打开 Bark App。
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
          <button class="btn btn-primary" @click="save" :disabled="saving">
            <span v-if="saving" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
            <span v-else>保存设置</span>
          </button>
          <span v-if="savedTip" style="font-size:13px;color:var(--success,#22c55e)">
            ✓ 已保存
          </span>
          <span v-if="saveErr" style="font-size:13px;color:var(--danger)">{{ saveErr }}</span>
        </div>

      </template>
    </div>

    <!-- 配置说明 -->
    <div class="section-title" style="margin-top:24px">配置说明</div>
    <div class="table-card" style="padding:16px 20px;line-height:1.8;font-size:13px;color:var(--text-2)">
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px">
        <code style="color:var(--text-1)">bark_icon</code>
        <span>推送通知中显示的自定义图标，需为公开可访问的图片 URL（jpg / png）。</span>
        <code style="color:var(--text-1)">bark_click_url</code>
        <span>用户点击手机通知后跳转的页面，通常配置为你的聊天系统网址。</span>
      </div>
      <div style="margin-top:12px;padding:10px 12px;background:var(--bg-2);border-radius:8px;font-size:12px;color:var(--text-3)">
        💡 以上配置对所有用户的 Bark 推送生效。配置后立即生效，已缓存在内存中无需重启服务。
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { api } from '@/api/index.js'

const loading  = ref(true)
const saving   = ref(false)
const savedTip = ref(false)
const saveErr  = ref('')
const iconLoadErr = ref(false)

const form = reactive({
  bark_icon: '',
  bark_click_url: ''
})

// 图标预览：输入框防抖 500ms 后显示
const iconPreviewUrl = computed(() => {
  const v = form.bark_icon.trim()
  if (!v || iconLoadErr.value) return ''
  try { new URL(v); return v } catch { return '' }
})

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark')
  localStorage.setItem('nodex-theme', isDark ? 'dark' : 'light')
}

async function save() {
  saving.value = true; saveErr.value = ''; savedTip.value = false
  try {
    await api.updateAdminConfig({
      bark_icon: form.bark_icon.trim() || null,
      bark_click_url: form.bark_click_url.trim() || null
    })
    savedTip.value = true
    setTimeout(() => { savedTip.value = false }, 3000)
  } catch (e) {
    saveErr.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const data = await api.adminConfig()
    form.bark_icon      = data.bark_icon      || ''
    form.bark_click_url = data.bark_click_url || ''
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>
