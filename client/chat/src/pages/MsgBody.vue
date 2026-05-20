<template>
  <!-- Text message -->
  <div v-if="m.type === 'text'" class="msg-body">{{ textContent }}</div>

  <!-- Image message -->
  <div v-else-if="m.type === 'image'" class="img-wrap">
    <div v-if="!imgLoaded" class="img-skeleton" :style="imgSkeletonStyle"></div>
    <img
      :src="thumbSrc"
      :alt="content.filename || 'image'"
      class="msg-image"
      :style="imgLoaded ? {} : { position: 'absolute', opacity: 0, pointerEvents: 'none' }"
      @load="imgLoaded = true"
      @click="$emit('view-image', fullSrc)"
      @error="onImgError"
    />
  </div>

  <!-- File message -->
  <div v-else-if="m.type === 'file'" class="file-card" @click="download">
    <div class="file-icon">{{ ext }}</div>
    <div class="file-meta">
      <div class="file-name">{{ content.filename || 'file' }}</div>
      <div class="file-size">{{ fmtBytes(content.size) }}</div>
    </div>
    <button class="icon-btn" title="Download" @click.stop="download">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>
      </svg>
    </button>
  </div>

  <!-- Fallback -->
  <div v-else class="msg-body" style="color:var(--text-3);font-style:italic">[unsupported message]</div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { api, fmtBytes, extOf } from '@/api/index.js'

const props = defineProps({
  m: { type: Object, required: true }
})
defineEmits(['view-image'])

// Parse content — may be JSON string or already an object
const content = computed(() => {
  const raw = props.m.content
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return { text: raw } }
  }
  return raw
})

const textContent = computed(() => {
  if (props.m.type === 'text') {
    const raw = props.m.content
    if (typeof raw === 'string') return raw
    if (raw && typeof raw === 'object') return raw.text || ''
  }
  return ''
})

const ext = computed(() => extOf(content.value.filename))

const thumbSrc = ref('')
const fullSrc = computed(() =>
  content.value.fileId ? api.fileUrl(content.value.fileId) : ''
)

// Image loading state
const imgLoaded = ref(false)
const imgSkeletonStyle = computed(() => {
  const w = content.value.width
  const h = content.value.height
  if (w && h) {
    const maxW = 240, maxH = 320
    let sw = Math.min(w, maxW)
    let sh = (sw / w) * h
    if (sh > maxH) { sh = maxH; sw = (sh / h) * w }
    return { width: Math.round(sw) + 'px', height: Math.round(sh) + 'px' }
  }
  return { width: '200px', height: '150px' }
})

// Set thumb src on mount
if (props.m.type === 'image' && content.value.fileId) {
  thumbSrc.value = api.thumbUrl(content.value.fileId)
}

function onImgError(e) {
  // Fallback to full image if thumb fails
  if (fullSrc.value && e.target.src !== fullSrc.value) {
    e.target.src = fullSrc.value
  }
}

function download() {
  if (fullSrc.value) window.open(fullSrc.value, '_blank')
}
</script>
