// 共用補貨通知：資料立即完成，事件先持久化，固定 60 秒後才建立正式通知。
import { computed, ref, watch, onScopeDispose } from 'vue'
import { defineStore, getActivePinia } from 'pinia'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'
import { reminderFingerprint, snoozeObsolete } from '../utils/nativeReminderTasks.js'
import { generateId } from '../utils/id.js'
import { notificationCutoff } from '../utils/notificationRetention.js'
import { previewNotificationHistory } from '../utils/notificationPreview.js'
import { memberNotificationMessage, restockNotificationMessage } from '../utils/notificationCopy.js'

export const RESTOCK_NOTIFICATION_DELAY_MS = 60000
const sources = new WeakMap()
const reconcilers = new WeakMap()
export function registerRestockNotificationSource(pinia, source) {
  sources.set(pinia, source)
  return () => { if (sources.get(pinia) === source) sources.delete(pinia) }
}
export function reconcileRestockNotifications(pinia) { reconcilers.get(pinia)?.() }

export const useSharedNotificationsStore = defineStore('shared-notifications', () => {
  const pinia = getActivePinia()
  const saved = loadPersisted(STORE_KEYS.sharedNotifications)
  const valid = entry => entry && typeof entry.id === 'string' && typeof entry.message === 'string'
    && typeof entry.spaceId === 'string' && Number.isFinite(entry.createdAt)
    && ['demo', 'event'].includes(entry.source) && ['restock-due', 'claimed', 'takeover', 'restocked'].includes(entry.type)
    && Array.isArray(entry.recipientIds) && entry.recipientIds.every(id => typeof id === 'string')
  const records = ref(Array.isArray(saved?.records) ? saved.records.filter(valid) : [])
  const validBatch = batch => batch && typeof batch.id === 'string' && ['restocked', 'claimed', 'takeover'].includes(batch.type)
    && typeof batch.actorId === 'string' && typeof batch.spaceId === 'string'
    && Number.isFinite(batch.firstEventAt) && batch.deadlineAt === batch.firstEventAt + RESTOCK_NOTIFICATION_DELAY_MS
    && Array.isArray(batch.recipientIds) && batch.recipientIds.every(id => typeof id === 'string')
    && Array.isArray(batch.events) && batch.events.every(event => typeof event.eventId === 'string'
      && typeof event.itemId === 'string' && (batch.type !== 'restocked' || typeof event.recordId === 'string') && typeof event.itemName === 'string')
  if (Array.isArray(saved?.pendingBatches) && saved.pendingBatches.some(batch => !validBatch(batch))) {
    console.error('[restock-notification] Invalid pending batch ignored; inspect stored notification data')
  }
  const pendingBatches = ref(Array.isArray(saved?.pendingBatches) ? saved.pendingBatches.filter(validBatch) : [])
  // IDs are retained after cancellation too: replaying an old successful operation is not a new event.
  const deliveryDiagnostics = ref(Array.isArray(saved?.deliveryDiagnostics) ? saved.deliveryDiagnostics.slice(-200) : [])
  const processedEventIds = ref(Array.isArray(saved?.processedEventIds) ? saved.processedEventIds.filter(id => typeof id === 'string') : [])
  const cancelledEventIds = ref(Array.isArray(saved?.cancelledEventIds) ? saved.cancelledEventIds : [])
  const recipientState = (entry, recipientId = 'self') => entry.recipientState?.[recipientId]
    ?? { read: entry.read === true, seen: entry.seen ?? entry.read === true }
  const visibleRecords = computed(() => records.value.filter(entry => entry.recipientIds.includes('self')).sort((a, b) => b.createdAt - a.createdAt))
  const hasUnseen = computed(() => visibleRecords.value.some(entry => !recipientState(entry).seen))
  const hasUnread = computed(() => visibleRecords.value.some(entry => !recipientState(entry).read))
  function markState(ids, changes, recipientId = 'self') {
    const selected = new Set(ids)
    const next = clone(records.value)
    for (const entry of next) {
      if (!selected.has(entry.id) || !entry.recipientIds.includes(recipientId)) continue
      entry.recipientState ??= {}
      entry.recipientState[recipientId] = { ...recipientState(entry, recipientId), ...changes }
    }
    return commit(next, clone(pendingBatches.value))
  }
  function markViewed(recipientId = 'self') { return markState(records.value.filter(entry => entry.recipientIds.includes(recipientId)).map(entry => entry.id), { seen: true }, recipientId) }
  function markRead(id, recipientId = 'self') { return markState([id], { read: true, seen: true }, recipientId) }
  function markAllRead(ids = visibleRecords.value.map(entry => entry.id), recipientId = 'self') { return markState(ids, { read: true, seen: true }, recipientId) }
  function cancelMemberEvents({ itemId, actorId, spaceId, now = Date.now() }) {
    const affected = clone(pendingBatches.value).map(batch => ({ ...batch, events: batch.events.filter(event =>
      ['claimed', 'takeover'].includes(batch.type) && batch.actorId === actorId && batch.spaceId === spaceId && now < batch.deadlineAt && event.itemId === itemId) }))
      .filter(batch => batch.events.length)
    const cancelled = affected.flatMap(batch => batch.events.map(event => event.eventId))
    cancelledEventIds.value = [...new Set([...cancelledEventIds.value, ...cancelled])]
    const next = clone(pendingBatches.value).map(batch => ({ ...batch, events: batch.events.filter(event => !cancelled.includes(event.eventId)) }))
      .filter(batch => batch.events.length)
    const result = commit(clone(records.value), next)
    let undone = false
    function undo() {
      if (undone) return { ok: true }
      const next = clone(pendingBatches.value)
      const restored = []
      for (const batch of affected) {
        if (Date.now() >= batch.deadlineAt) continue // Never rewrite a closed historical window.
        let existing = next.find(entry => entry.id === batch.id)
        if (!existing) { existing = { ...batch, events: [] }; next.push(existing) }
        for (const event of batch.events) {
          if (!existing.events.some(entry => entry.eventId === event.eventId)) existing.events.push(event)
          restored.push(event.eventId)
        }
      }
      cancelledEventIds.value = cancelledEventIds.value.filter(id => !restored.includes(id))
      const saved = commit(clone(records.value), next)
      if (saved.ok) undone = true
      return saved
    }
    return { ...result, undo }
  }
  function publishRestockReminders() {
    const source = sources.get(pinia)
    if (!source?.reminderGroups) return { ok: true }
    const next = clone(records.value)
    const processed = [...processedEventIds.value]
    const nativeTasks = loadPersisted(STORE_KEYS.nativeNotifications)?.tasks || []
    for (const { space, items, recipientIds } of source.reminderGroups()) {
      const groups = new Map()
      for (const recipientId of recipientIds) {
        const fresh = items.filter(item => {
          const snooze = item.reminderSnoozes?.[recipientId]
          // Native reminder scheduler owns personal snooze events, including 08:00 expiry.
          const task = Array.isArray(nativeTasks) ? nativeTasks.filter(task => !task.demo && task.itemId === item.id
            && task.date === snooze && (task.operationId || null) === (item.reminderSnoozeOperationIds?.[recipientId] || null)).at(-1) : null
          if (snooze && !snoozeObsolete(item, snooze) && (!task || task.fingerprint === reminderFingerprint(item))) return false
          const base = `due:${space.id}:${item.id}:${item.unitPeriodId}:${item.nextRestockDate}`
          const event = snooze ? `${base}:snooze:${recipientId}:${snooze}` : base
          return !processed.includes(`${event}:recipient:${recipientId}`) && (snooze || !processed.includes(base))
        })
        if (!fresh.length || (!space.shared && recipientId !== 'self')) continue
        const signature = JSON.stringify(fresh.map(item => item.id))
        if (!groups.has(signature)) groups.set(signature, { fresh, recipients: [] })
        groups.get(signature).recipients.push(recipientId)
      }
      for (const { fresh, recipients } of groups.values()) {
        const itemNames = fresh.map(item => item.name)
        const eventIds = fresh.flatMap(item => recipients.map(recipientId => {
          const base = `due:${space.id}:${item.id}:${item.unitPeriodId}:${item.nextRestockDate}`
          const snooze = item.reminderSnoozes?.[recipientId]
          return `${snooze ? `${base}:snooze:${recipientId}:${snooze}` : base}:recipient:${recipientId}`
        }))
        next.push({ id: generateId(), type: 'restock-due', source: 'event', spaceId: space.id, spaceName: space.name,
          recipientIds: recipients, itemIds: fresh.map(item => item.id), itemNames, eventIds, createdAt: Date.now(),
          recipientState: Object.fromEntries(recipients.map(id => [id, { seen: false, read: false }])),
          message: restockNotificationMessage(space.name, itemNames), targets: fresh.map(item => ({ itemId: item.id, completionRecordIds: [] })) })
        processed.push(...eventIds)
      }
    }
    if (next.length === records.value.length) return { ok: true }
    return commit(next, clone(pendingBatches.value), processed)
  }
  function publishScheduledSnooze(task, now = Date.now()) {
    const source = sources.get(pinia)
    const item = source?.getItem(task.itemId)
    const space = item && source?.getSpace(item.spaceId)
    if (!item || !space || !item.inShoppingList || item.shoppingCompletedAt != null
      || item.spaceId !== task.spaceId || item.reminderSnoozes?.self !== task.date || now < task.dueAt) return { ok: false, skipped: true }
    const eventId = `scheduled-snooze:${task.id}:self`
    if (processedEventIds.value.includes(eventId)) return { ok: true, record: records.value.find(entry => entry.eventIds?.includes(eventId)) }
    const record = { id: generateId(), type: 'restock-due', reminderKind: 'snoozed', source: 'event',
      spaceId: space.id, spaceName: space.name, recipientIds: ['self'], itemIds: [item.id], itemNames: [item.name],
      eventIds: [eventId], createdAt: now, recipientState: { self: { read: false, seen: false } },
      message: `「${space.name}」的${item.name}已到你設定的提醒時間。`, targets: [{ itemId: item.id, completionRecordIds: [] }] }
    const result = commit([...clone(records.value), record], clone(pendingBatches.value), [...processedEventIds.value, eventId])
    return result.ok ? { ok: true, record } : result
  }
  let previewHistorySeeded = saved?.previewHistorySeeded === true
  function seedPreviewHistory(spaces, items) {
    if (!import.meta.env.DEV || previewHistorySeeded) return { ok: true, skipped: true }
    const entries = previewNotificationHistory(spaces, items).filter(entry => !records.value.some(existing => existing.id === entry.id))
    if (!entries.length) return { ok: true, skipped: true }
    return commit([...clone(records.value), ...entries], clone(pendingBatches.value), processedEventIds.value, { previewHistorySeeded: true })
  }
  let applying = false
  let timer = null
  const clone = value => JSON.parse(JSON.stringify(value))
  function commit(nextRecords, nextPending, nextProcessed = processedEventIds.value, metadata = {}) {
    if (!savePersisted(STORE_KEYS.sharedNotifications, { ...saved, records: nextRecords,
      pendingBatches: nextPending, processedEventIds: nextProcessed, cancelledEventIds: cancelledEventIds.value, previewHistorySeeded, deliveryDiagnostics: deliveryDiagnostics.value, ...metadata })) {
      const error = new Error('通知資料儲存失敗，待發送批次未變更。')
      console.error('[restock-notification] Notification persistence failed', error)
      return { ok: false, error }
    }
    deliveryDiagnostics.value = metadata.deliveryDiagnostics ?? deliveryDiagnostics.value
    previewHistorySeeded = metadata.previewHistorySeeded ?? previewHistorySeeded
    applying = true
    try { records.value = nextRecords; pendingBatches.value = nextPending; processedEventIds.value = nextProcessed }
    finally { applying = false }
    schedule()
    return { ok: true }
  }
  function invalidEventReason(event, batch, source) {
    if (cancelledEventIds.value.includes(event.eventId)) return 'EVENT_CANCELLED'
    const space = source.getSpace(batch.spaceId)
    const item = source.getItem(event.itemId)
    if (!space?.shared) return 'SPACE_UNAVAILABLE'
    if (!item || item.spaceId !== batch.spaceId) return 'ITEM_UNAVAILABLE'
    if (batch.type === 'restocked') {
      return item.restockRecords?.some(record => record.id === event.recordId) ? null : 'RESTOCK_RECORD_MISSING'
    }
    if (!event.operationId || !item.shoppingClaimOperationId) return 'UNVERIFIABLE_CLAIM_IDENTITY'
    if (event.operationId !== item.shoppingClaimOperationId) return 'CLAIM_OPERATION_REPLACED'
    if (!item.inShoppingList || item.shoppingCompletedAt != null) return 'CLAIM_NO_LONGER_PENDING'
    if (item.shoppingClaimantId !== batch.actorId) return 'CLAIM_OWNER_CHANGED'
    return null
  }
  function message(batch, events) {
    const itemNames = [...new Map(events.map(event => [event.itemId, event.itemName])).values()]
    return memberNotificationMessage({ ...batch, itemNames })
  }
  function flushPending(now = Date.now()) {
    const source = sources.get(pinia)
    if (!source) { schedule(); return { ok: true } }
    const nextRecords = clone(records.value)
    const nextPending = []
    const diagnostics = clone(deliveryDiagnostics.value)
    const rejected = (batch, event, reason) => diagnostics.push({ batchId: batch.id,
      ...(event ? { eventId: event.eventId, itemId: event.itemId } : {}), reason, checkedAt: now })
    for (const batch of pendingBatches.value) {
      // Validate at delivery, not on every intervening state change during Undo/batch operations.
      if (now < batch.deadlineAt) {
        // Keep existing eager record-Undo reconciliation; claims are checked at delivery.
        const events = batch.type === 'restocked' ? batch.events.filter(event => {
          const reason = invalidEventReason(event, batch, source)
          if (reason) rejected(batch, event, reason)
          return !reason
        }) : batch.events
        if (events.length) nextPending.push({ ...clone(batch), events: clone(events) })
        continue
      }
      const events = batch.events.filter(event => {
        const reason = invalidEventReason(event, batch, source)
        if (reason) rejected(batch, event, reason)
        return !reason
      })
      if (!events.length) continue
      const members = source.getSpaceMembers?.(batch.spaceId)
      if (!Array.isArray(members)) { rejected(batch, null, 'MEMBERS_UNVERIFIABLE'); continue }
      const recipientIds = [...new Set(members.map(member => member?.id).filter(id => typeof id === 'string' && id && id !== batch.actorId))]
      if (!recipientIds.length) { rejected(batch, null, 'NO_ELIGIBLE_RECIPIENTS'); continue }
      const id = `restock-batch:${batch.id}`
      if (!nextRecords.some(entry => entry.id === id)) {
        const unique = [...new Map(events.map(event => [event.itemId, event])).values()]
        nextRecords.push({ id, batchId: batch.id, type: batch.type, source: 'event', actorId: batch.actorId,
          actorName: batch.actorName, spaceId: batch.spaceId, spaceName: batch.spaceName,
          recipientIds, createdAt: now, firstEventAt: batch.firstEventAt,
          deadlineAt: batch.deadlineAt, read: false, seen: false,
          recipientState: Object.fromEntries(recipientIds.map(id => [id, { read: false, seen: false }])),
          eventIds: events.map(event => event.eventId), itemIds: unique.map(event => event.itemId),
          itemNames: unique.map(event => event.itemName), message: message(batch, events) })
      }
    }
    if (JSON.stringify(nextPending) === JSON.stringify(pendingBatches.value) && nextRecords.length === records.value.length) {
      schedule(); return { ok: true }
    }
    return commit(nextRecords, nextPending, processedEventIds.value, { deliveryDiagnostics: diagnostics.slice(-200) })
  }
  function schedule() {
    clearTimeout(timer)
    timer = null
    if (!pendingBatches.value.length || !sources.has(pinia)) return
    const delay = Math.max(1, Math.min(...pendingBatches.value.map(batch => batch.deadlineAt)) - Date.now())
    timer = setTimeout(() => {
      timer = null
      try { flushPending() } catch (error) { console.error('[restock-notification] Delayed delivery failed', error) }
    }, delay)
  }
  function publishMemberEvent({ type, space, actorId, actorName, itemName, memberIds, itemId, recordId, operationId }) {
    if (!['restocked', 'claimed', 'takeover'].includes(type) || !space?.shared || !actorId) return { ok: true, skipped: true }
    if (!itemId || (type === 'restocked' ? !recordId : !operationId)) throw new Error('通知缺少用品或操作 ID。')
    const recipientIds = [...new Set(memberIds)].filter(id => id !== actorId)
    const eventId = JSON.stringify([space.id, itemId, type === 'restocked' ? recordId : `${type}:${operationId}`])
    if (processedEventIds.value.includes(eventId)) return { ok: true, duplicate: true }
    const now = Date.now()
    const nextPending = clone(pendingBatches.value)
    let batch = nextPending.find(batch => batch.actorId === actorId && batch.spaceId === space.id
      && batch.type === type && now >= batch.firstEventAt && now < batch.deadlineAt)
    if (!batch) {
      batch = { id: generateId(), type, actorId, actorName, spaceId: space.id, spaceName: space.name,
        recipientIds, firstEventAt: now, deadlineAt: now + RESTOCK_NOTIFICATION_DELAY_MS, events: [] }
      nextPending.push(batch)
    }
    batch.recipientIds = [...new Set([...batch.recipientIds, ...recipientIds])].filter(id => id !== actorId)
    batch.events.push({ eventId, itemId, ...(recordId ? { recordId } : { operationId }), itemName, occurredAt: now })
    return commit(clone(records.value), nextPending, [...processedEventIds.value, eventId])
  }
  function pruneExpired(now = Date.now()) {
    const cutoff = notificationCutoff(now)
    const retained = records.value.filter(entry => entry.createdAt >= cutoff)
    if (retained.length !== records.value.length) commit(clone(retained), clone(pendingBatches.value))
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
  // Preserve compatibility with existing direct records mutations and unknown WIP fields.
  watch(records, () => { if (!applying && !savePersisted(STORE_KEYS.sharedNotifications, {
    ...saved, records: records.value, pendingBatches: pendingBatches.value, processedEventIds: processedEventIds.value, cancelledEventIds: cancelledEventIds.value, previewHistorySeeded, deliveryDiagnostics: deliveryDiagnostics.value,
  })) console.error('[restock-notification] Notification records persistence failed') }, { deep: true, flush: 'sync' })
  const reconcile = () => {
    try { flushPending() } catch (error) { console.error('[restock-notification] Pending reconciliation failed', error) }
  }
  reconcilers.set(pinia, reconcile)
  const onVisible = () => { if (document.visibilityState === 'visible') { pruneExpired(); reconcile(); publishRestockReminders() } }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
  onScopeDispose(() => {
    clearTimeout(timer)
    if (reconcilers.get(pinia) === reconcile) reconcilers.delete(pinia)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
  })
  pruneExpired()
  schedule()
  return { records, pendingBatches, processedEventIds, deliveryDiagnostics, publishMemberEvent, trackRestockCompletion, pruneExpired, flushPending,
    publishScheduledSnooze, seedPreviewHistory, visibleRecords, hasUnseen, hasUnread, recipientState, markViewed, markRead, markAllRead, cancelMemberEvents, publishRestockReminders }
})
