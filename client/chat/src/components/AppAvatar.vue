<template>
  <span class="avatar" :style="{ width: size+'px', height: size+'px', fontSize: Math.round(size*0.4)+'px', background: color }">
    {{ initials }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { avatarColor } from '@/api/index.js'

const props = defineProps({
  name: String,
  id: String,
  size: { type: Number, default: 32 }
})
const initials = computed(() => ((props.name || props.id || '?').slice(0, 1).toUpperCase()))
const color = computed(() => avatarColor(props.id || props.name || '?'))
</script>
