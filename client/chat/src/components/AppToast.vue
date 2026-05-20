<template>
  <teleport to="body">
    <div class="toast-stack">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">
        <svg v-if="t.kind !== 'error'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ t.text }}
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref } from 'vue'

const toasts = ref([])

function push(text, kind = 'success') {
  const id = Math.random().toString(36).slice(2)
  toasts.value.push({ id, text, kind })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 3200)
}

defineExpose({ push })
</script>
