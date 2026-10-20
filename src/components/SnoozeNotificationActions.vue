<script setup>
import { computed, watch } from 'vue'
import { useItemsStore } from '../stores/items'
import NativeNotificationSettings from './NativeNotificationSettings.vue'
import { useNativeNotificationsStore } from '../stores/nativeNotifications'
const props = defineProps({ itemId: { type: String, required: true } })
const native = useNativeNotificationsStore()
const items = useItemsStore()
const eligibility = computed(() => native.demoEligibility(props.itemId))
const otherPending = computed(() => native.pendingDemoItems.find(id => id !== props.itemId))
const otherName = computed(() => items.getItem(otherPending.value)?.name || '其他用品')
const feedback = computed(() => native.demoFeedback[props.itemId])
watch(() => props.itemId, id => native.clearDemoFeedback(id), { immediate: true })
const pending = computed(() => native.pendingDemoItems.includes(props.itemId))
</script>
<template>
  <div class="snooze-notification-actions">
    <NativeNotificationSettings />
    <div v-if="native.demoEnabled" class="snooze-demo">
      <button type="button" class="btn btn-secondary" @click="native.endDemo">結束此分頁展示</button>
      <p>Demo 測試：不影響正式延後日期。分頁須保持開啟，可切換其他網站。</p>
      <button v-if="pending" type="button" class="btn btn-secondary" @click="native.cancelDemo(itemId)">取消測試通知</button>
      <button v-else type="button" class="btn btn-secondary" :disabled="!eligibility.ok" @click="native.demo(itemId)">Demo：10 秒後測試通知</button>
      <template v-if="otherPending">
        <p role="status">「{{ otherName }}」的 Demo 測試正在等待發送。</p>
        <button type="button" class="btn btn-secondary" @click="native.cancelDemo(otherPending, itemId)">取消「{{ otherName }}」的測試</button>
      </template>
      <p v-if="!pending && !eligibility.ok && eligibility.code !== 'waiting-other'" role="status">{{ eligibility.message }}</p>
      <p v-if="feedback && feedback.message !== eligibility.message" role="status" :class="{ error: feedback.error }">{{ feedback.message }}</p>
    </div>
  </div>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.snooze-notification-actions { :deep(.native-notification-settings) { padding: 0; } }
.snooze-demo { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; p { margin: 0; font-size: t.$font-size-caption; line-height: 20px; color: t.$text-sub; } p.error { color: t.$danger; } }
</style>
