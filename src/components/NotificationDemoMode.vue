<script setup>
import { useNativeNotificationsStore } from '../stores/nativeNotifications'
const native = useNativeNotificationsStore()
</script>
<template>
  <aside v-if="native.demoEnabled || native.demoInvited || native.demoModeMessage" class="notification-demo-mode" aria-label="通知展示模式">
    <template v-if="native.demoEnabled"><span>通知 Demo 展示中</span><button type="button" @click="native.endDemo">結束展示</button></template>
    <button v-else-if="native.demoInvited" type="button" @click="native.activateDemo">啟用通知展示模式</button>
    <p v-if="native.demoModeMessage" role="status">{{ native.demoModeMessage }}</p>
  </aside>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.notification-demo-mode { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); z-index: 1100; max-width: calc(100vw - 24px); padding: 8px 12px; border-radius: t.$radius-pill; background: t.$primary-soft; color: t.$primary-green; box-shadow: t.$shadow-raised; font-size: t.$font-size-caption; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; p { margin: 0; } button { border: 0; border-radius: t.$radius-pill; padding: 4px 8px; background: t.$input-bg; color: inherit; font: inherit; } }
</style>
