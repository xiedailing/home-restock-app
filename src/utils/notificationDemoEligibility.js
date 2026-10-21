// Shared by the UI and the locked scheduling operation. No state changes here.
export function notificationDemoEligibility({ item, space, accessible = true, pendingItemIds = [], enabled = true,
  permission = 'granted', pushEnabled = true, supported = true, locksAvailable = true }) {
  const blocked = (code, message) => ({ ok: false, code, message })
  if (!enabled) return blocked('disabled', '此環境未啟用 Demo 測試。')
  if (!item) return blocked('missing', '此用品已不存在。')
  if (!space || !accessible) return blocked('inaccessible', '無法存取此用品所在空間。')
  if (item.inShoppingList !== true) return blocked('removed', '此用品已不在購買清單中。')
  if (item.shoppingCompletedAt != null) return blocked('completed', '此用品已補貨，無法安排測試。')
  if (item.reminderEnabled === false) return blocked('reminder-off', '請先至此用品的補貨明細開啟「補貨提醒」，再進行測試。')
  if (!item.reminderSnoozes?.self) return blocked('unsaved', '請先儲存此用品的延後提醒日期。')
  const otherItemId = pendingItemIds.find(id => id !== item.id)
  if (otherItemId) return { ...blocked('waiting-other', '其他用品已有測試等待中，請先取消舊測試或等候完成。'), otherItemId }
  if (pendingItemIds.includes(item.id)) return blocked('waiting-self', '此用品已有測試等待中。')
  if (!supported) return blocked('unsupported', '此環境無法使用系統通知，請使用電腦版 Chrome 或 Safari。')
  if (permission !== 'granted') return blocked('permission', '請先開啟系統通知。')
  if (!pushEnabled) return blocked('push-off', '請先在提醒設定開啟「推播通知」。')
  if (!locksAvailable) return blocked('locks', '此瀏覽器缺少多分頁排程鎖，請更新 Chrome 或 Safari。')
  return { ok: true, code: 'ready', message: '' }
}
