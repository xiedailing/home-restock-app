import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'
import { MAX_REMIND_DAYS, MIN_REMIND_DAYS, REMIND_WITHIN_DAYS } from '../models/item.js'

// 使用者的提醒偏好；不代表已取得系統通知權限，也不影響補貨紀錄。
// pushEnabled：手機推播開關。restockDays：補貨建議的提醒門檻 T（預計補貨日前幾天顯示「該補貨了」），
// 與推播開關分開保存：關閉推播時 T 沿用原值，App 內狀態照常推算（specs/001 D4-c）。
export const useNotificationSettingsStore = defineStore('notification-settings', () => {
  const saved = loadPersisted(STORE_KEYS.notifications)
  const pushEnabled = ref(typeof saved?.pushEnabled === 'boolean' ? saved.pushEnabled : true)
  const isValidDays = (days) => Number.isInteger(days) && days >= MIN_REMIND_DAYS && days <= MAX_REMIND_DAYS
  const restockDays = ref(isValidDays(saved?.restockDays) ? saved.restockDays : REMIND_WITHIN_DAYS)
  watch([pushEnabled, restockDays], ([enabled, days]) => {
    savePersisted(STORE_KEYS.notifications, { pushEnabled: enabled, restockDays: days })
  }, { flush: 'sync' })
  function setPushEnabled(enabled) {
    pushEnabled.value = Boolean(enabled)
  }
  return { pushEnabled, restockDays, setPushEnabled }
})
