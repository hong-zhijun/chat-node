<template>
  <div class="modal-overlay files-overlay" @click.self="$emit('close')">
    <div
      class="files-modal"
      :class="{ dragging: dragOver }"
      @click.stop
      @dragover.prevent="dragOver = true"
      @dragleave.self="dragOver = false"
      @drop.prevent="onDrop"
    >
      <!-- Header -->
      <header class="files-modal-head">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <h3 style="margin:0;font-size:16px;font-weight:600;flex-shrink:0">Shared files</h3>
          <span style="font-size:12px;color:var(--text-2)">{{ filtered.length }} file{{ filtered.length !== 1 ? 's' : '' }}</span>
        </div>

        <!-- Grid / list toggle -->
        <div class="view-toggle">
          <button :class="{ active: view === 'grid' }" @click="view = 'grid'" title="Grid view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
          <button :class="{ active: view === 'list' }" @click="view = 'list'" title="List view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
        </div>

        <button class="btn btn-primary" style="height:32px;font-size:13px" @click="fileInputRef?.click()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Upload
        </button>

        <button class="icon-btn" @click="$emit('close')" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6l-12 12"/></svg>
        </button>
      </header>

      <!-- Search -->
      <div class="files-modal-search">
        <span style="color:var(--text-3);display:inline-flex">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
        </span>
        <input v-model="query" placeholder="Search files…" autofocus @keydown.escape="$emit('close')" />
      </div>

      <!-- Body -->
      <div class="files-modal-body" ref="bodyRef">
        <!-- Loading -->
        <div v-if="loading" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:48px 0;color:var(--text-2)">
          <span class="spinner"></span> Loading…
        </div>

        <!-- Grid view -->
        <div v-else-if="view === 'grid'" class="file-grid">
          <!-- Active uploads -->
          <div v-for="u in uploads" :key="u.id" class="upload-tile">
            <div class="upload-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 9l5-5 5 5M5 20h14"/></svg>
              <span class="name">{{ u.name }}</span>
              <span class="pct">{{ u.pct }}%</span>
            </div>
            <div class="progress"><div class="progress-bar" :style="{ width: u.pct + '%' }"></div></div>
            <div style="font-size:11px;color:var(--text-2)">Uploading…</div>
          </div>

          <!-- Files -->
          <div v-for="f in filtered" :key="f.fileId" class="file-tile">
            <div class="tile-preview">
              <img v-if="isImage(f)" :src="api.thumbUrl(f.fileId)" :alt="f.filename" @error="e => e.target.style.display='none'" />
              <span v-else class="tile-ext">{{ extOf(f.filename) }}</span>
            </div>
            <div class="tile-actions">
              <button @click="download(f)" title="Download">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>
              </button>
              <button @click="del(f)" title="Delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
              </button>
            </div>
            <div class="tile-meta">
              <div class="tile-name" :title="f.filename">{{ f.filename }}</div>
              <div class="tile-sub">{{ fmtBytes(f.size) }} · {{ fmtTime(f.createdAt) }}</div>
            </div>
          </div>

          <!-- Empty -->
          <div v-if="!filtered.length && !uploads.length" style="grid-column:1/-1;padding:48px 0;text-align:center;color:var(--text-3);font-size:14px">
            {{ query ? 'No files match your search.' : 'No shared files yet. Upload one!' }}
          </div>
        </div>

        <!-- List view -->
        <table v-else class="file-list">
          <thead>
            <tr>
              <th style="width:40%">Name</th>
              <th>Size</th>
              <th>Uploaded by</th>
              <th>Time</th>
              <th style="text-align:right;width:80px">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filtered" :key="f.fileId">
              <td>
                <div class="name-cell">
                  <span class="file-icon">{{ extOf(f.filename) }}</span>
                  {{ f.filename }}
                </div>
              </td>
              <td style="font-size:13px;color:var(--text-2)">{{ fmtBytes(f.size) }}</td>
              <td style="font-size:13px;color:var(--text-2)">{{ f.uploader?.name || '—' }}</td>
              <td style="font-size:13px;color:var(--text-2)">{{ fmtTime(f.createdAt) }}</td>
              <td style="text-align:right">
                <button class="icon-btn" @click="download(f)" title="Download">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>
                </button>
                <button class="icon-btn" @click="del(f)" title="Delete" style="color:var(--danger)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
                </button>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="5" style="text-align:center;padding:32px;color:var(--text-3)">
                {{ query ? 'No files match your search.' : 'No shared files yet.' }}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Load more -->
        <div v-if="hasMore && !loading" style="display:flex;justify-content:center;padding:16px 0">
          <button class="btn btn-ghost" @click="loadMore">Load more</button>
        </div>
      </div>

      <!-- Drag indicator -->
      <div v-if="dragOver" class="drag-indicator">
        <div class="drag-pill">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Drop files to upload
        </div>
      </div>
    </div>

    <!-- Hidden file input -->
    <input ref="fileInputRef" type="file" multiple style="display:none" @change="onFileSelect" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api, fmtBytes, fmtTime, extOf } from '@/api/index.js'

const emit = defineEmits(['close'])

const view = ref('grid')
const query = ref('')
const dragOver = ref(false)
const loading = ref(false)
const hasMore = ref(false)
const files = ref([])
const uploads = ref([])
const fileInputRef = ref(null)
const bodyRef = ref(null)

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','avif','svg'])
function isImage(f) {
  const ext = (f.filename || '').split('.').pop().toLowerCase()
  return IMAGE_EXTS.has(ext)
}

const filtered = computed(() => {
  if (!query.value.trim()) return files.value
  const q = query.value.toLowerCase()
  return files.value.filter(f =>
    f.filename?.toLowerCase().includes(q) ||
    f.uploader?.name?.toLowerCase().includes(q)
  )
})

async function load(reset = false) {
  if (loading.value) return
  loading.value = true
  try {
    const before = reset ? undefined : (files.value[files.value.length - 1]?.createdAt)
    const result = await api.share({ before, limit: 50, q: query.value || undefined })
    if (reset) files.value = result
    else files.value = [...files.value, ...result]
    hasMore.value = result.length === 50
  } catch (e) {
    console.error('Failed to load shared files', e)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  await load(false)
}

watch(query, () => {
  // search server-side when query changes
  load(true)
})

function download(f) {
  window.open(api.fileUrl(f.fileId), '_blank')
}

async function del(f) {
  if (!confirm(`Delete "${f.filename}"? This cannot be undone.`)) return
  try {
    await api.deleteShare(f.fileId)
    files.value = files.value.filter(x => x.fileId !== f.fileId)
  } catch (e) {
    alert('Failed to delete file.')
  }
}

async function onFileSelect(e) {
  const selectedFiles = Array.from(e.target.files || [])
  if (fileInputRef.value) fileInputRef.value.value = ''
  await uploadFiles(selectedFiles)
}

async function onDrop(e) {
  dragOver.value = false
  const dropped = Array.from(e.dataTransfer.files || [])
  await uploadFiles(dropped)
}

async function uploadFiles(fileList) {
  for (const file of fileList) {
    const uploadId = Math.random().toString(36).slice(2)
    uploads.value.push({ id: uploadId, name: file.name, pct: 0 })
    try {
      const result = await api.uploadFile(file, 'share')
      files.value.unshift(result)
    } catch (err) {
      alert(`Failed to upload ${file.name}`)
    } finally {
      uploads.value = uploads.value.filter(u => u.id !== uploadId)
    }
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  load(true)
  document.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))
</script>
