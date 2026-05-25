<template>
  <header class="admin-top">
    <h1>表情包</h1>
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
      上传图片或 GIF 作为全局表情包，所有用户在聊天输入框中都可以使用。<br>
      支持 JPG、PNG、GIF、WebP 等常见图片格式，单文件最大 20MB。
    </div>

    <!-- 上传区 -->
    <div class="section-title" style="display:flex;align-items:center;gap:8px">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      上传表情包
    </div>
    <div class="form-card" style="margin-bottom:24px">
      <div
        class="sticker-drop-zone"
        :class="{ 'sticker-drop-zone--drag': isDragging }"
        @click="fileInputRef?.click()"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-3);margin-bottom:8px">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <div style="font-size:13px;color:var(--text-2)">点击选择或拖拽图片 / GIF</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:4px">支持 JPG PNG GIF WebP，最大 20MB</div>
      </div>
      <input ref="fileInputRef" type="file" accept="image/*" multiple style="display:none" @change="onFileChange" />
      <div v-if="uploadErr" style="font-size:13px;color:var(--danger);margin-top:8px">{{ uploadErr }}</div>
    </div>

    <!-- 列表 -->
    <div class="section-title" style="display:flex;align-items:center;gap:8px;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        表情包列表
      </span>
      <span style="font-size:12px;color:var(--text-3)">共 {{ stickers.length }} 张</span>
    </div>

    <div v-if="loading" style="color:var(--text-2);font-size:13px;padding:16px 0">加载中…</div>

    <div v-else-if="stickers.length === 0" class="table-card" style="padding:40px;text-align:center;color:var(--text-3);font-size:13px">
      暂无表情包，请在上方上传。
    </div>

    <div v-else class="table-card sticker-admin-grid">
      <div
        v-for="s in stickers"
        :key="s.file_id"
        class="sticker-admin-item"
      >
        <div class="sticker-admin-preview" @click="viewImg(s)">
          <img
            :src="thumbSrc(s)"
            :alt="s.filename"
            loading="lazy"
            @error="onImgError($event, s)"
          />
        </div>
        <div class="sticker-admin-name" :title="s.filename">{{ s.filename }}</div>
        <button
          class="icon-btn sticker-admin-del"
          title="删除"
          :disabled="deletingId === s.file_id"
          @click="deleteSticker(s.file_id)"
        >
          <span v-if="deletingId === s.file_id" class="spinner" style="width:13px;height:13px;border-width:2px"></span>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 上传进度遮罩 -->
    <div v-if="uploading" class="sticker-upload-mask">
      <div class="sticker-upload-info">
        <span class="spinner" style="width:18px;height:18px;border-width:2.5px"></span>
        <span>上传中 {{ uploadProgress }}/{{ uploadTotal }}…</span>
      </div>
    </div>

  </div>

  <!-- 图片预览 -->
  <div v-if="viewerSrc" class="modal-overlay" style="background:rgba(0,0,0,0.8);z-index:200" @click="viewerSrc=null">
    <img :src="viewerSrc" style="max-width:80vw;max-height:80vh;object-fit:contain;border-radius:8px;cursor:zoom-out" @click.stop />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '@/api/index.js'

const BASE = import.meta.env.VITE_API_BASE || ''

const loading      = ref(true)
const stickers     = ref([])
const isDragging   = ref(false)
const uploading    = ref(false)
const uploadProgress = ref(0)
const uploadTotal    = ref(0)
const uploadErr    = ref('')
const deletingId   = ref(null)
const fileInputRef = ref(null)
const viewerSrc    = ref(null)

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark')
  localStorage.setItem('nodex-theme', isDark ? 'dark' : 'light')
}

function thumbSrc(s) {
  if (!s.file_id) return ''
  // GIF 缩略图是静态 JPEG，必须用原图才能播放动画
  if (s.mime === 'image/gif') return api.adminStickerImg(s.file_id)
  if (s.has_thumbnail) return api.adminStickerThumb(s.file_id)
  return api.adminStickerImg(s.file_id)
}

function onImgError(e, s) {
  const fallback = api.adminStickerImg(s.file_id)
  if (e.target.src !== fallback) e.target.src = fallback
}

function viewImg(s) {
  viewerSrc.value = api.adminStickerImg(s.file_id)
}

async function load() {
  try {
    stickers.value = await api.adminStickers()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function uploadFiles(files) {
  if (!files || !files.length) return
  uploadErr.value = ''
  uploading.value = true
  uploadProgress.value = 0
  uploadTotal.value = files.length

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      uploadErr.value = `跳过非图片文件：${file.name}`
      uploadProgress.value++
      continue
    }
    try {
      const saved = await api.uploadSticker(file)
      stickers.value.unshift(saved)
      uploadProgress.value++
    } catch (e) {
      uploadErr.value = `上传失败：${file.name} — ${e.message}`
      uploadProgress.value++
    }
  }
  uploading.value = false
}

function onFileChange(e) {
  uploadFiles(Array.from(e.target.files || []))
  e.target.value = ''
}

function onDrop(e) {
  isDragging.value = false
  uploadFiles(Array.from(e.dataTransfer?.files || []))
}

async function deleteSticker(fileId) {
  deletingId.value = fileId
  try {
    await api.deleteSticker(fileId)
    stickers.value = stickers.value.filter(s => s.file_id !== fileId)
  } catch (e) {
    console.error(e)
  } finally {
    deletingId.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.sticker-drop-zone {
  border: 2px dashed var(--border);
  border-radius: 10px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 160ms;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.sticker-drop-zone:hover,
.sticker-drop-zone--drag {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.sticker-admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
  padding: 16px;
}
.sticker-admin-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  position: relative;
}
.sticker-admin-preview {
  width: 90px;
  height: 90px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-in;
  border: 1px solid var(--border);
}
.sticker-admin-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.sticker-admin-name {
  font-size: 11px;
  color: var(--text-3);
  text-align: center;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sticker-admin-del {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 120ms;
}
.sticker-admin-item:hover .sticker-admin-del { opacity: 1; }

.sticker-upload-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.sticker-upload-info {
  background: var(--bg);
  border-radius: 12px;
  padding: 20px 28px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--text);
  box-shadow: var(--shadow-lg);
}
</style>
