<template>
  <div ref="mountEl" class="emoji-picker-inner"></div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['pick'])
const mountEl = ref(null)

onMounted(async () => {
  // 懒加载，避免首屏增大 bundle
  const [{ Picker }, { default: data }] = await Promise.all([
    import('emoji-mart'),
    import('@emoji-mart/data')
  ])
  new Picker({
    data,
    onEmojiSelect: (e) => emit('pick', e.native),
    parent: mountEl.value,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    previewPosition: 'none',
    skinTonePosition: 'none',
    perLine: window.innerWidth < 480 ? 7 : 9,
    set: 'native'
  })
})
</script>
