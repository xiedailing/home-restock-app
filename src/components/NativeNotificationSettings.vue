<script setup>
import SnoozeNotificationActions from './SnoozeNotificationActions.vue'
import { computed, onMounted } from 'vue'
import { useNativeNotificationsStore } from '../stores/nativeNotifications'
const native = useNativeNotificationsStore()
const statusMessage = computed(() => native.authorizationMessage || (native.error && !native.messageItemId ? native.message : ''))
onMounted(() => native.support())
</script>
<template>
  <div class="native-notification-settings">
    <span v-if="native.permission === 'granted'">系統通知已開啟</span>
    <span v-else-if="native.permission === 'denied'">系統通知已封鎖，請至瀏覽器網站設定允許通知。</span>
    <span v-else-if="native.permission === 'unsupported'">此環境無法使用系統通知，請使用電腦版 Chrome 或 Safari。</span>
    <button v-else type="button" class="native-permission-link" @click="native.enable">開啟系統通知</button>
    <SnoozeNotificationActions />
    <p v-if="native.demoModeMessage" role="status">{{ native.demoModeMessage }}</p>
    <p v-if="statusMessage" role="status">{{ statusMessage }}</p>
  </div>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.native-notification-settings { padding: 0 16px 12px; color: t.$text-sub; font-size: t.$font-size-caption; line-height: 20px; p { margin: 4px 0 0; color: t.$danger; } }
.native-permission-link { border: 0; background: transparent; color: t.$primary-green; padding: 0; font: inherit; }
</style>
