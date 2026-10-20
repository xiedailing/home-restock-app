<script setup>
import { computed } from 'vue'
import NativeNotificationSettings from './NativeNotificationSettings.vue'
import { notificationDemoEnabled, useNativeNotificationsStore } from '../stores/nativeNotifications'
const props = defineProps({ itemId: { type: String, required: true } })
const native = useNativeNotificationsStore()
const pending = computed(() => native.pendingDemoItems.includes(props.itemId))
</script>
<template>
  <div class="snooze-notification-actions">
    <NativeNotificationSettings />
    <div v-if="notificationDemoEnabled" class="snooze-demo">
      <p>Demo 測試：不影響正式延後日期。分頁須保持開啟，可切換其他網站。</p>
      <button v-if="pending" type="button" class="btn btn-secondary" @click="native.cancelDemo(itemId)">取消測試通知</button>
      <button v-else type="button" class="btn btn-secondary" :disabled="native.pendingDemo" @click="native.demo(itemId)">Demo：10 秒後測試通知</button>
      <p v-if="native.message" role="status" :class="{ error: native.error }">{{ native.message }}</p>
    </div>
  </div>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.snooze-notification-actions { :deep(.native-notification-settings) { padding: 0; } }
.snooze-demo { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; p { margin: 0; font-size: t.$font-size-caption; line-height: 20px; color: t.$text-sub; } p.error { color: t.$danger; } }
</style>
