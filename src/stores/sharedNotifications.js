import { computed, ref, watch, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'
import { generateId } from '../utils/id.js'
import { restockNotificationMessage } from '../utils/notificationCopy.js'
import { notificationCutoff } from '../utils/notificationRetention.js'

export const useSharedNotificationsStore = defineStore('shared-notifications', () => {
  const saved = loadPersisted(STORE_KEYS.sharedNotifications)
  const valid = entry => entry && typeof entry.id === 'string' && typeof entry.message === 'string'
    && typeof entry.spaceId === 'string' && Number.isFinite(entry.createdAt)
    && ['demo', 'event'].includes(entry.source) && ['restock-due', 'claimed', 'takeover', 'restocked'].includes(entry.type)
    && Array.isArray(entry.recipientIds) && entry.recipientIds.every(id => typeof id === 'string')
  const records = ref(Array.isArray(saved?.records) ? saved.records.filter(valid).map(entry => ({
    ...entry, message: entry.type === 'claimed' ? entry.message.replaceAll('認購', '認領') : entry.message,
  })) : [])
  const demoInitialized = ref(saved?.demoInitialized === true)
  const personalDemoInitialized = ref(saved?.personalDemoInitialized === true)
  const scrollDemoInitialized = ref(saved?.scrollDemoInitialized === true)
  const visibleRecords = computed(() => records.value.filter(entry => entry.recipientIds.includes('self')))
  const recent = computed(() => [...visibleRecords.value].sort((a, b) => b.createdAt - a.createdAt))
  function pruneExpired(now = Date.now()) {
    const cutoff = notificationCutoff(now)
    const retained = records.value.filter(entry => entry.createdAt >= cutoff)
    if (retained.length !== records.value.length) records.value = retained
  }
  const hasUnread = computed(() => visibleRecords.value.some(entry => !(entry.seen ?? entry.read)))
  function markRead(id) {
    const entry = visibleRecords.value.find(entry => entry.id === id)
    if (entry) { entry.read = true; entry.seen = true }
  }
  function markAllSeen(ids) {
    const selected = new Set(ids)
    for (const entry of visibleRecords.value) if (selected.has(entry.id)) entry.seen = true
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
  function allRestocked(entry, getItem) {
    // 無 ID／事件對應的舊通知不可推斷為已完成，刪除用品也不等同補貨。
    return Array.isArray(entry.targets) && entry.targets.length > 0 && entry.targets.every(target => {
      const item = getItem(target.itemId)
      return item && target.completionRecordIds?.some(id => item.restockRecords.some(record => record.id === id))
    })
  }
  function publishRestockReminder(space, dueItems) {
    if (!space || !dueItems.length) return
    records.value.push({ id: generateId(), type: 'restock-due', source: 'event', spaceId: space.id,
      spaceName: space.name, recipientIds: ['self'], createdAt: Date.now(), read: false,
      itemNames: dueItems.map(item => item.name),
      targets: dueItems.map(item => ({ itemId: item.id, completionRecordIds: [] })),
      message: restockNotificationMessage(space.name, dueItems.map(item => item.name)) })
  }
  // 僅是事件資料接入介面；目前沒有後端或跨成員投遞服務。
  function publishMemberEvent({ type, space, actorId, actorName, itemName, memberIds }) {
    if (!space?.shared || !actorId || !['claimed', 'takeover', 'restocked'].includes(type)) return
    const recipientIds = [...new Set(memberIds)].filter(id => id !== actorId)
    if (!recipientIds.length) return
    records.value.push({ id: generateId(), type, source: 'event', spaceId: space.id, actorId,
      recipientIds, createdAt: Date.now(), read: false,
      message: `${actorName}已${type === 'claimed' ? '認領' : type === 'takeover' ? '接手認領' : '補貨'}「${space.name}」的${itemName}。` })
  }
  function initializeDemo(spaces) {
    pruneExpired()
    if (!scrollDemoInitialized.value) {
      scrollDemoInitialized.value = true
      const family = spaces.find(space => space.shared && space.name === '家庭')
      if (family) {
        const names = ['衛生紙', '洗衣精', '垃圾袋', '酒精', '洗碗精']
        const types = ['restock-due', 'claimed', 'takeover', 'restocked']
        for (let index = 0; index < 20; index++) {
          const type = types[index % types.length]
          const itemNames = names.slice(0, index % 5 + 1)
          records.value.push({ id: `demo-scroll-${index}`, type, source: 'demo', spaceId: family.id,
            spaceName: family.name, itemNames, recipientIds: ['self'],
            createdAt: Date.now() - (index + 1) * 7 * 86400000, read: index % 3 === 0, seen: index % 3 === 0,
            message: type === 'restock-due' ? restockNotificationMessage(family.name, itemNames)
              : `小明已${type === 'claimed' ? '認領' : type === 'takeover' ? '接手認領' : '補貨'}「${family.name}」的${names[index % names.length]}。` })
        }
      }
    }
    // 舊版固定數量的示範通知補上品名快照，保留原本 read／seen。
    for (const entry of records.value) {
      if (entry.source !== 'demo' || entry.type !== 'restock-due') continue
      const space = spaces.find(space => space.id === entry.spaceId)
      if (!space) continue
      if (!Array.isArray(entry.itemNames) || !entry.itemNames.length) entry.itemNames = ['衛生紙', '洗衣精']
      entry.spaceName ??= space.name
      entry.message = restockNotificationMessage(entry.spaceName, entry.itemNames)
    }
    if (!personalDemoInitialized.value) {
      personalDemoInitialized.value = true
      const personal = spaces.find(space => !space.shared && space.name === '個人')
      if (personal && !records.value.some(entry => entry.id === 'demo-personal-restock')) {
        records.value.push({ id: 'demo-personal-restock', type: 'restock-due', source: 'demo', spaceId: personal.id,
          recipientIds: ['self'], createdAt: Date.now(), read: false, itemNames: ['衛生紙', '洗衣精'], message: restockNotificationMessage(personal.name, ['衛生紙', '洗衣精']) })
      }
    }
    if (demoInitialized.value) return
    demoInitialized.value = true
    const family = spaces.find(space => space.shared && space.name === '家庭')
    if (!family) return
    const now = Date.now()
    records.value.push(
      { id: 'demo-family-restock', type: 'restock-due', source: 'demo', spaceId: family.id,
        recipientIds: ['self'], createdAt: now, read: false, itemNames: ['衛生紙', '洗衣精'], message: restockNotificationMessage(family.name, ['衛生紙', '洗衣精']) },
      { id: 'demo-family-claim', type: 'claimed', source: 'demo', spaceId: family.id, actorId: 'demo-xiaoming',
        recipientIds: ['self'], createdAt: now - 60000, read: false, message: '小明已認領「家庭」的衛生紙。' },
    )
  }
  watch([records, demoInitialized, personalDemoInitialized, scrollDemoInitialized], () => savePersisted(STORE_KEYS.sharedNotifications, {
    records: records.value, demoInitialized: demoInitialized.value, personalDemoInitialized: personalDemoInitialized.value,
    scrollDemoInitialized: scrollDemoInitialized.value,
  }), { deep: true, flush: 'sync' })
  pruneExpired()
  if (typeof window !== 'undefined') {
    const timer = window.setInterval(pruneExpired, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') pruneExpired() }
    document.addEventListener('visibilitychange', onVisible)
    onScopeDispose(() => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) })
  }
  return { records, recent, hasUnread, markRead, markAllSeen, initializeDemo, publishMemberEvent, pruneExpired,
    trackRestockCompletion, allRestocked, publishRestockReminder }
})
