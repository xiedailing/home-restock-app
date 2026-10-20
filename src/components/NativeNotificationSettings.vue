<script setup>
import { computed, ref, onMounted } from 'vue'
import { useNativeNotificationsStore } from '../stores/nativeNotifications'
import { useItemsStore } from '../stores/items'
const native = useNativeNotificationsStore()
const items = useItemsStore()
const selected = ref('')
const demoEnabled = import.meta.env.DEV
const candidates = computed(() => items.items.filter(item => item.inShoppingList && item.shoppingCompletedAt == null && item.reminderEnabled !== false))
onMounted(() => { if (!selected.value) selected.value = candidates.value[0]?.id || '' })
</script>
<template>
  <div class="native-notification-settings">
    <button type="button" class="btn btn-secondary" @click="native.enable">開啟系統通知</button>
    <p>需允許瀏覽器及作業系統通知。延後提醒於裝置當地時間 08:00 處理；分頁須保持開啟，休眠或關閉後不保證準時送達。</p>
    <p v-if="native.message" role="status" :class="{ 'native-error': native.error }">{{ native.message }}</p>
    <div v-if="demoEnabled" class="native-demo">
      <label for="native-demo-item">期末展示：系統通知測試</label>
      <select id="native-demo-item" v-model="selected">
        <option value="" disabled>選擇已開啟補貨提醒的待買用品</option>
        <option v-for="item in candidates" :key="item.id" :value="item.id">{{ items.getSpace(item.spaceId)?.name }}・{{ item.name }}</option>
      </select>
      <button type="button" class="btn btn-primary" :disabled="!selected || native.pendingDemo" @click="native.demo(selected)">10 秒後測試通知</button>
      <p>不變更正式延後日期。請先開啟通知，再切換其他分頁。排程等待中仍可補貨或移除用品以取消測試。</p>
    </div>
  </div>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.native-notification-settings { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 12px; p { margin: 0; font-size: t.$font-size-caption; line-height: 20px; color: t.$text-sub; } .native-error { color: t.$danger; } }
.native-demo { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; border-top: 1px solid t.$border-color; select { min-width: 0; width: 100%; padding: 10px 12px; color: t.$text-main; background: t.$input-bg; border: 1px solid t.$border-color; border-radius: t.$radius-input; } label { color: t.$text-main; font-size: t.$font-size-body-sm; } }
</style>
