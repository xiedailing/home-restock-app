<script setup>
import SnoozeNotificationActions from './SnoozeNotificationActions.vue'
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { allowsNotificationDemo } from '../utils/notificationDemoMode.js'
import { useNativeNotificationsStore } from '../stores/nativeNotifications'
const native = useNativeNotificationsStore()
const route = useRoute()
const operatorVisible = computed(() => allowsNotificationDemo(location.origin) && route.query.notificationDemo === '1')
const statusMessage = computed(() => native.authorizationMessage || (operatorVisible.value && native.error && !native.messageItemId ? native.message : ''))
const visible = computed(() => operatorVisible.value || native.permission !== 'granted' || !!statusMessage.value)
onMounted(() => native.support())
</script>
<template>
  <div v-if="visible" class="native-notification-settings">
    <span v-if="operatorVisible && native.permission === 'granted'">系統通知已開啟</span>
    <span v-else-if="native.permission === 'denied'">系統通知已封鎖，請至瀏覽器網站設定允許通知。</span>
    <span v-else-if="native.permission === 'unsupported'">此環境無法使用系統通知，請使用電腦版 Chrome 或 Safari。</span>
    <button v-else-if="native.permission === 'default'" type="button" class="native-permission-link" @click="native.enable">開啟系統通知</button>
    <SnoozeNotificationActions v-if="operatorVisible" />
    <p v-if="operatorVisible && native.demoModeMessage" role="status">{{ native.demoModeMessage }}</p>
    <p v-if="statusMessage" role="status">{{ statusMessage }}</p>
  </div>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.native-notification-settings { padding: 0 16px 12px; color: t.$text-sub; font-size: t.$font-size-caption; line-height: 20px; p { margin: 4px 0 0; color: t.$danger; } }
.native-permission-link { border: 0; background: transparent; color: t.$primary-green; padding: 0; font: inherit; }
</style>
