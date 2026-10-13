import { ref } from 'vue'
import { defineStore } from 'pinia'

// 使用者的推播偏好；不代表已取得系統通知權限，也不影響補貨紀錄。
export const useNotificationSettingsStore = defineStore('notification-settings', () => {
  const pushEnabled = ref(true)
  function setPushEnabled(enabled) {
    pushEnabled.value = Boolean(enabled)
  }
  return { pushEnabled, setPushEnabled }
})
