import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'

// 使用者的推播偏好；不代表已取得系統通知權限，也不影響補貨紀錄。
export const useNotificationSettingsStore = defineStore('notification-settings', () => {
  const saved = loadPersisted(STORE_KEYS.notifications)
  const pushEnabled = ref(typeof saved?.pushEnabled === 'boolean' ? saved.pushEnabled : true)
  watch(pushEnabled, enabled => {
    savePersisted(STORE_KEYS.notifications, { pushEnabled: enabled })
  }, { flush: 'sync' })
  function setPushEnabled(enabled) {
    pushEnabled.value = Boolean(enabled)
  }
  return { pushEnabled, setPushEnabled }
})
