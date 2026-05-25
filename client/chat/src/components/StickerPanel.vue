<template>
  <div class="sticker-panel">
    <div v-if="loading" class="sticker-empty">加载中…</div>
    <div v-else-if="!stickers.length" class="sticker-empty">暂无表情包，请联系管理员添加</div>
    <div v-else class="sticker-grid">
      <button
        v-for="s in stickers"
        :key="s.file_id"
        class="sticker-item"
        :title="s.filename"
        @click="$emit('pick', s)"
      >
        <img :src="thumbUrl(s)" :alt="s.filename" loading="lazy" @error="onImgError($event, s)" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '@/api/index.js'

const emit = defineEmits(['pick'])

const loading  = ref(true)
const stickers = ref([])

function thumbUrl(s) {
  if (!s.file_id) return ''
  // GIF 缩略图是静态 JPEG，必须用原图才能播放动画
  if (s.mime === 'image/gif') return api.fileUrl(s.file_id)
  return api.thumbUrl(s.file_id)
}

function onImgError(e, s) {
  // 缩略图失败时回退到原图
  const fallback = s.file_id ? api.fileUrl(s.file_id) : ''
  if (fallback && e.target.src !== fallback) e.target.src = fallback
}

onMounted(async () => {
  try {
    stickers.value = await api.stickers()
  } catch (e) {
    console.error('[StickerPanel] load failed', e)
  } finally {
    loading.value = false
  }
})
</script>
