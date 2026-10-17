// 補貨整合的最小通知資料層：不含 UI、展示通知、提醒產生器或認領／接手觸發。
import { ref, watch, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'
import { generateId } from '../utils/id.js'
import { notificationCutoff } from '../utils/notificationRetention.js'

export const useSharedNotificationsStore = defineStore('shared-notifications', () => {
  const saved = loadPersisted(STORE_KEYS.sharedNotifications)
  // 保留既有 WIP 的通知與額外存檔欄位，不建立展示資料或遷移它們的內容。
  const valid = entry => entry && typeof entry.id === 'string' && typeof entry.message === 'string'
    && typeof entry.spaceId === 'string' && Number.isFinite(entry.createdAt)
    && ['demo', 'event'].includes(entry.source) && ['restock-due', 'claimed', 'takeover', 'restocked'].includes(entry.type)
    && Array.isArray(entry.recipientIds) && entry.recipientIds.every(id => typeof id === 'string')
  const records = ref(Array.isArray(saved?.records) ? saved.records.filter(valid) : [])
  function pruneExpired(now = Date.now()) {
    const cutoff = notificationCutoff(now)
    const retained = records.value.filter(entry => entry.createdAt >= cutoff)
    if (retained.length !== records.value.length) records.value = retained
  }
  function trackRestockCompletion(itemId, recordId) {
    for (const entry of records.value) {
      if (entry.type !== 'restock-due') continue
      const target = entry.targets?.find(target => target.itemId === itemId)
      if (target) {
        target.completionRecordIds ??= []
        if (!target.completionRecordIds.includes(recordId)) target.completionRecordIds.push(recordId)
      }
    }
  }
  function publishMemberEvent({ type, space, actorId, actorName, itemName, memberIds }) {
    // 本次只接入已審查的補貨事件；其他事件仍留在 WIP 分支。
    if (type !== 'restocked' || !space?.shared || !actorId) return
    const recipientIds = [...new Set(memberIds)].filter(id => id !== actorId)
    if (!recipientIds.length) return
    records.value.push({ id: generateId(), type, source: 'event', spaceId: space.id, actorId,
      recipientIds, createdAt: Date.now(), read: false,
      message: `${actorName}已補貨「${space.name}」的${itemName}。` })
  }
  watch(records, () => savePersisted(STORE_KEYS.sharedNotifications, {
    ...saved, records: records.value,
  }), { deep: true, flush: 'sync' })
  pruneExpired()
  if (typeof window !== 'undefined') {
    const timer = window.setInterval(pruneExpired, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') pruneExpired() }
    document.addEventListener('visibilitychange', onVisible)
    onScopeDispose(() => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) })
  }
  return { records, publishMemberEvent, trackRestockCompletion, pruneExpired }
})
