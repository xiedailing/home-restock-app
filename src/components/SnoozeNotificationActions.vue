<script setup>
import { computed, ref } from 'vue'
import { useItemsStore } from '../stores/items'
import { useNativeNotificationsStore } from '../stores/nativeNotifications'
const native = useNativeNotificationsStore()
const items = useItemsStore()
const operatorMessage = ref('')
async function cancel(id) {
  const result = await native.cancelDemo(id)
  operatorMessage.value = result.ok ? '已取消待發送通知。' : native.demoFeedback[id]?.message || '無法取消通知，請稍後重試。'
}
const waiting = computed(() => native.pendingDemoItems.map(id => ({ id, name: items.getItem(id)?.name || '已移除用品' })))
</script>
<template>
  <details v-if="native.demoEnabled" class="demo-operator-controls">
    <summary>展示控制</summary>
    <button v-for="item in waiting" :key="item.id" type="button" @click="cancel(item.id)">取消「{{ item.name }}」的待發送通知</button>
    <p v-if="operatorMessage" role="status">{{ operatorMessage }}</p>
    <button type="button" @click="native.endDemo">結束展示並取消待發送測試</button>
  </details>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.demo-operator-controls { margin-top: 4px; summary { cursor: pointer; color: t.$text-sub; } button { display: block; margin-top: 8px; border: 0; border-radius: t.$radius-pill; padding: 6px 10px; background: t.$input-bg; color: t.$primary-green; font: inherit; } }
</style>
