<template>
  <router-view />
  <AppToast ref="toastRef" />
</template>

<script setup>
import { provide, ref } from 'vue'
import AppToast from '@/components/AppToast.vue'

const toastRef = ref(null)
provide('toast', {
  push: (text, kind) => toastRef.value?.push(text, kind)
})
</script>
