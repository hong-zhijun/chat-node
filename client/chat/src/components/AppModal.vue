<template>
  <teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal">
        <h3 v-if="title">{{ title }}</h3>
        <p v-if="desc" style="color:var(--text-2);font-size:14px;margin:0 0 16px;line-height:1.5">{{ desc }}</p>
        <slot />
        <div class="actions" style="margin-top:16px">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
defineProps({ title: String, desc: String })
defineEmits(['close'])
</script>
