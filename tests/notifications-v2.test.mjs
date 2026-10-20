import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { setMaxListeners } from 'node:events'

test('notification V2 integration', async t => {
  const originals = new Map(['localStorage', 'window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const memory = new Map()
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
  const install = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  install('localStorage', storage)
  install('window', new EventTarget())
  install('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  setMaxListeners(0, window, document)
  const originalSetTimeout = globalThis.setTimeout
  const longTimers = new Set()
  globalThis.setTimeout = (...args) => {
    const timer = originalSetTimeout(...args)
    if (args[1] > 1000) { timer.unref(); longTimers.add(timer) }
    return timer
  }
  const originalNow = Date.now
  let now = originalNow()
  Date.now = () => now
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } })
  const piniaInstances = []
  try {
    const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
    const { useSharedNotificationsStore, registerRestockNotificationSource } = await server.ssrLoadModule('/src/stores/sharedNotifications.js')
    const { createItem } = await server.ssrLoadModule('/src/models/item.js')
    const { STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const { notificationDestination } = await server.ssrLoadModule('/src/utils/notificationNavigation.js')
    const { restockNotificationMessage, memberNotificationMessage } = await server.ssrLoadModule('/src/utils/notificationCopy.js')
    const key = name => `home-restock:v1:${name}`
    const encode = data => JSON.stringify({ version: STORAGE_VERSION, data })
    const close = () => { for (const pinia of piniaInstances) for (const store of [...pinia._s.values()]) store.$dispose() }
    const fresh = () => {
      // Drain earlier fixture savers before replacing storage; pagehide must not replay a disposed store.
      install('localStorage', storage); window.dispatchEvent(new Event('pagehide'))
      close(); memory.clear()
      const items = ['甲', '乙', '丙'].map((name, i) => createItem({ id: `i${i}`, name, unit: '包', category: '生活日用品',
        spaceId: 'family', inShoppingList: true, shoppingClaimantId: null }))
      memory.set(key('items'), encode({ items, spaces: [{ id: 'personal', name: '個人', shared: false },
        { id: 'family', name: '家庭', shared: true, members: [{ id: 'm1', name: '小明' }, { id: 'm2', name: '花花' }] }],
        customCategories: [], departedSpaces: [], demoSeeds: ['family-unclaimed-alcohol-v1'] }))
      const pinia = createPinia(); piniaInstances.push(pinia); setActivePinia(pinia)
      return { items: useItemsStore(), notifications: useSharedNotificationsStore() }
    }
    await t.test('claims merge for fixed 60 seconds, stay invisible before deadline and snapshot names', () => {
      const { items, notifications: n } = fresh()
      const first = now
      items.claimShoppingItem('i0')
      assert.equal(items.getItem('i0').shoppingClaimantId, 'self')
      now = first + 25000; items.claimShoppingItem('i1')
      now = first + 50000; items.claimShoppingItem('i2')
      assert.equal(n.pendingBatches.length, 1)
      assert.equal(n.pendingBatches[0].deadlineAt, first + 60000)
      items.updateItem('i0', { name: '新名稱' })
      n.flushPending(first + 59999); assert.equal(n.records.length, 0)
      n.flushPending(first + 60000)
      assert.equal(n.records.length, 1)
      assert.equal(n.records[0].itemNames[0], '甲')
      assert.match(n.records[0].message, /3 項用品/)
      assert.deepEqual(n.records[0].recipientIds, ['m1', 'm2'])
      n.flushPending(first + 61000); assert.equal(n.records.length, 1)
    })
    await t.test('partial and full claim cancellation do not publish cancelled items', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0'); items.claimShoppingItem('i1')
      const deadline = n.pendingBatches[0].deadlineAt
      now = deadline - 1000
      items.cancelShoppingClaim('i0')
      assert.equal(n.pendingBatches[0].events.length, 1)
      n.flushPending(deadline)
      assert.deepEqual(n.records[0].itemIds, ['i1'])
      items.claimShoppingItem('i0'); items.cancelShoppingClaim('i0')
      assert.equal(n.pendingBatches.length, 0)
      n.flushPending(now + 60000); assert.equal(n.records.length, 1)
    })
    await t.test('later operations use new windows; actors, types and spaces do not mix', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const first = now
      items.updateItem('i1', { shoppingClaimantId: 'm1' }); items.takeOverShoppingClaim('i1')
      const other = items.addItem({ name: '他人用品', unit: '包', category: '清潔', spaceId: 'family', inShoppingList: true })
      items.updateItem(other.id, { shoppingClaimantId: 'm1' })
      n.publishMemberEvent({ type: 'claimed', space: items.getSpace('family'), actorId: 'm1', actorName: '小明',
        itemId: other.id, itemName: other.name, operationId: other.shoppingClaimOperationId, memberIds: ['self', 'm1', 'm2'] })
      assert.equal(n.pendingBatches.length, 3)
      const company = items.addSpace({ name: '公司', shared: true })
      items.addSpaceMember(company.id, { id: 'm3', name: '同事' })
      const companyItem = items.addItem({ name: '公司用品', category: '生活日用品', unit: '包', spaceId: company.id, inShoppingList: true })
      items.claimShoppingItem(companyItem.id)
      assert.equal(n.pendingBatches.length, 4)
      now = first + 60001; items.claimShoppingItem('i2')
      assert.equal(n.pendingBatches.length, 5)
      n.flushPending(now)
      assert.equal(n.records.length, 4)
      assert.equal(n.pendingBatches.length, 1)
      assert.ok(n.records.some(entry => entry.type === 'takeover'))
      assert.ok(n.records.find(entry => entry.actorId === 'm1').recipientIds.includes('self'))
      assert.ok(!n.records.find(entry => entry.actorId === 'm1').recipientIds.includes('m1'))
    })
    await t.test('pending claims survive full reload without restarting deadlines', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const deadline = n.pendingBatches[0].deadlineAt
      awaitableFlush()
      function awaitableFlush() { window.dispatchEvent(new Event('pagehide')) }
      close()
      const pinia = createPinia(); piniaInstances.push(pinia); setActivePinia(pinia)
      now = deadline + 1
      useItemsStore()
      const reloaded = useSharedNotificationsStore()
      assert.equal(reloaded.records.length, 1)
      assert.equal(reloaded.records[0].deadlineAt, deadline)
      assert.equal(reloaded.pendingBatches.length, 0)
    })
    const selfEvent = n => {
      const items = useItemsStore()
      const operationId = `operation-${now}`
      items.updateItem('i0', { shoppingClaimantId: 'm1', shoppingClaimOperationId: operationId })
      return n.publishMemberEvent({ type: 'claimed', space: items.getSpace('family'),
        actorId: 'm1', actorName: '小明', itemId: 'i0', itemName: '甲', operationId, memberIds: ['self', 'm1', 'm2'] })
    }
    await t.test('viewing clears only seen; individual and all-read changes are per recipient', () => {
      const { notifications: n } = fresh()
      selfEvent(n); n.flushPending(now + 60000)
      assert.equal(n.hasUnseen, true); assert.equal(n.hasUnread, true)
      assert.equal(n.markViewed().ok, true)
      assert.equal(n.hasUnseen, false); assert.equal(n.hasUnread, true)
      const id = n.records[0].id
      n.markRead(id)
      assert.equal(n.hasUnread, false)
      assert.equal(n.recipientState(n.records[0], 'm2').read, false)
      now += 70000; selfEvent(n); n.flushPending(now + 60000)
      assert.equal(n.hasUnseen, true)
      n.markAllRead()
      assert.equal(n.hasUnread, false)
      n.$dispose()
      const reload = useSharedNotificationsStore()
      assert.equal(reload.hasUnread, false)
      assert.equal(reload.recipientState(reload.records[0], 'm2').read, false)
    })
    await t.test('old records and metadata persist, no fake IDs or rewritten historical messages', () => {
      fresh(); close()
      const old = { id: 'legacy', type: 'claimed', source: 'event', spaceId: 'family', recipientIds: ['self'],
        createdAt: now, read: false, seen: true, message: '舊文字不修改' }
      memory.set(key('shared-notifications'), encode({ records: [old], unknownField: 'keep' }))
      const p = createPinia(); piniaInstances.push(p); setActivePinia(p)
      const n = useSharedNotificationsStore()
      assert.equal(n.hasUnseen, false); assert.equal(n.hasUnread, true)
      n.markRead('legacy')
      assert.equal(n.records[0].message, old.message)
      assert.equal(n.records[0].createdAt, old.createdAt)
      assert.equal(n.records[0].itemIds, undefined)
      assert.equal(JSON.parse(memory.get(key('shared-notifications'))).data.unknownField, 'keep')
    })
    await t.test('notification persistence failures cannot mark read or publish a pending event', () => {
      const { notifications: n } = fresh()
      selfEvent(n); const deadline = n.pendingBatches[0].deadlineAt
      install('localStorage', { ...storage, setItem() { throw new Error('quota') } })
      assert.equal(n.flushPending(deadline).ok, false)
      assert.equal(n.records.length, 0); assert.equal(n.pendingBatches.length, 1)
      install('localStorage', storage); n.flushPending(deadline)
      install('localStorage', { ...storage, setItem() { throw new Error('quota') } })
      assert.equal(n.markAllRead().ok, false)
      assert.equal(n.hasUnread, true)
      install('localStorage', storage)
    })
    await t.test('navigation uses current space/items, deletion precedence and correct two destinations', () => {
      const { items } = fresh()
      const base = { spaceId: 'family', itemIds: ['i0', 'missing'], type: 'restocked' }
      const dest = notificationDestination(base, items)
      assert.equal(dest.route.name, 'inventory'); assert.equal(dest.inventorySpaceId, 'family')
      assert.equal(dest.message, '此通知有部分用品已刪除')
      assert.equal(notificationDestination({ ...base, itemIds: ['missing'] }, items).message, '此通知的用品皆已刪除')
      assert.equal(notificationDestination({ ...base, spaceId: 'gone' }, items).message, '此空間已不存在或無法查看')
      assert.equal(notificationDestination({ ...base, type: 'takeover', itemIds: ['i0'] }, items).route.query.tab, 'shared')
      assert.equal(notificationDestination({ ...base, itemIds: undefined }, items).route.name, 'inventory')
    })
    await t.test('six-month cleanup removes only notifications, including read and unread', () => {
      const { items, notifications: n } = fresh()
      const before = JSON.stringify(items.items)
      n.records.push(...[true, false].map((read, i) => ({ id: `old-${i}`, type: 'restocked', source: 'event',
        spaceId: 'family', recipientIds: ['self'], read, createdAt: now - 220 * 86400000, message: '過期' })))
      n.pruneExpired(now)
      assert.equal(n.records.length, 0)
      assert.equal(JSON.stringify(items.items), before)
    })
    await t.test('due reminders use existing forecast, group shared items and deduplicate across reload', () => {
      const { items, notifications: n } = fresh()
      const item = items.getItem('i0')
      items.updateItem(item.id, { restockRecords: [
        { id: 'due-r1', date: '2026-01-01', quantity: 1, unit: item.unit, unitPeriodId: item.unitPeriodId },
        { id: 'due-r2', date: '2026-01-10', quantity: 1, unit: item.unit, unitPeriodId: item.unitPeriodId },
      ] })
      assert.equal(n.publishRestockReminders().ok, true)
      assert.equal(n.records.length, 1)
      assert.equal(n.records[0].type, 'restock-due')
      assert.deepEqual(n.records[0].itemIds, ['i0'])
      n.publishRestockReminders(); assert.equal(n.records.length, 1)
      n.$dispose()
      const reload = useSharedNotificationsStore()
      reload.publishRestockReminders(); assert.equal(reload.records.length, 1)
    })
    await t.test('personal snooze excludes only its operator and resumes once at expiry', () => {
      const { items, notifications: n } = fresh()
      const item = items.getItem('i0')
      items.updateItem('i0', { restockRecords: [
        { id: 'personal-due-1', date: '2026-01-01', quantity: 1, unit: item.unit, unitPeriodId: item.unitPeriodId },
        { id: 'personal-due-2', date: '2026-01-10', quantity: 1, unit: item.unit, unitPeriodId: item.unitPeriodId },
      ] })
      assert.equal(items.snoozeShoppingReminder('i0', '2099-01-10').ok, true)
      n.publishRestockReminders()
      assert.equal(n.records.length, 1)
      assert.equal(n.records[0].recipientIds.includes('self'), false)
      assert.equal(n.records[0].recipientIds.includes('m1'), true)
      assert.equal(n.records[0].recipientIds.includes('m2'), true)
      assert.equal(item.snoozedUntil, null)
      items.updateItem('i0', { reminderSnoozes: { self: '2026-02-01' } })
      n.publishRestockReminders()
      assert.equal(n.records.length, 1, 'expiry is owned by the scheduled 08:00 event, not ordinary due publication')
      n.publishScheduledSnooze({ id: 'snooze-expiry', itemId: 'i0', spaceId: 'family', date: '2026-02-01', dueAt: 0 })
      assert.equal(n.records.length, 2)
      assert.deepEqual(n.records[1].recipientIds, ['self'])
      n.publishRestockReminders()
      assert.equal(n.records.length, 2)
    })
    await t.test('personal restock-due reaches only self, opens its space and deduplicates after reload', () => {
      const { items, notifications: n } = fresh()
      const item = items.getItem('i0')
      items.updateItem('i0', { spaceId: 'personal', restockRecords: [
        { id: 'p-due-1', date: '2026-01-01', quantity: 1, unit: item.unit, unitPeriodId: item.unitPeriodId },
        { id: 'p-due-2', date: '2026-01-10', quantity: 1, unit: item.unit, unitPeriodId: item.unitPeriodId },
      ] })
      assert.equal(n.publishRestockReminders().ok, true)
      assert.equal(n.visibleRecords.length, 1)
      const entry = n.visibleRecords[0]
      assert.deepEqual(entry.recipientIds, ['self'])
      assert.equal(n.hasUnseen, true)
      assert.deepEqual(notificationDestination(entry, items).route, { name: 'inventory' })
      assert.equal(notificationDestination(entry, items).inventorySpaceId, 'personal')
      n.publishRestockReminders(); assert.equal(n.records.length, 1)
      n.$dispose()
      const reload = useSharedNotificationsStore()
      reload.publishRestockReminders(); assert.equal(reload.records.length, 1)
    })
    await t.test('personal restock-due respects item reminder switch and personal snooze', () => {
      const { items, notifications: n } = fresh()
      const item = items.getItem('i0')
      items.updateItem('i0', { spaceId: 'personal', reminderEnabled: false, restockRecords: [
        { id: 'p-off-1', date: '2026-01-01', quantity: 1, unit: item.unit, unitPeriodId: item.unitPeriodId },
        { id: 'p-off-2', date: '2026-01-10', quantity: 1, unit: item.unit, unitPeriodId: item.unitPeriodId },
      ] })
      n.publishRestockReminders(); assert.equal(n.records.length, 0)
      items.updateItem('i0', { reminderEnabled: true })
      items.snoozeShoppingReminder('i0', '2099-01-10')
      n.publishRestockReminders(); assert.equal(n.records.length, 0)
      items.cancelShoppingReminderSnooze('i0')
      n.publishRestockReminders(); assert.equal(n.records.length, 1)
    })
    await t.test('personal member operations do not enqueue shared notifications', () => {
      const { items, notifications: n } = fresh()
      const space = items.getSpace('personal')
      for (const type of ['claimed', 'takeover', 'restocked']) {
        assert.equal(n.publishMemberEvent({ type, space, actorId: 'self', actorName: '本人', itemId: 'i0', itemName: '甲', memberIds: ['self', 'm1'], operationId: type, recordId: type }).skipped, true)
      }
      assert.equal(n.pendingBatches.length, 0)
      assert.equal(n.records.length, 0)
    })
    await t.test('claim and takeover notification faults never interrupt successful member operations', () => {
      const { items, notifications: n } = fresh()
      n.publishMemberEvent = () => { throw new Error('delivery failed') }
      items.claimShoppingItem('i0')
      assert.equal(items.getItem('i0').shoppingClaimantId, 'self')
      items.updateItem('i1', { shoppingClaimantId: 'm1' }); items.takeOverShoppingClaim('i1')
      assert.equal(items.getItem('i1').shoppingClaimantId, 'self')
    })
    await t.test('failed cancellation save suppresses delivery without rolling back the completed cancellation', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0'); const deadline = n.pendingBatches[0].deadlineAt
      install('localStorage', { ...storage, setItem(name, value) { if (name === key('shared-notifications')) throw new Error('quota'); storage.setItem(name, value) } })
      items.cancelShoppingClaim('i0')
      assert.equal(items.getItem('i0').shoppingClaimantId, null)
      install('localStorage', storage)
      n.flushPending(deadline)
      assert.equal(n.records.length, 0)
      assert.equal(n.pendingBatches.length, 0)
    })
    await t.test('undo of claim cancellation restores the original pending deadline without extending it', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0'); const deadline = n.pendingBatches[0].deadlineAt
      now += 25000
      const operation = items.cancelShoppingClaim('i0')
      assert.equal(n.pendingBatches.length, 0)
      now += 5000; items.undoShoppingOperation(operation)
      assert.equal(items.getItem('i0').shoppingClaimantId, 'self')
      assert.equal(n.pendingBatches[0].deadlineAt, deadline)
      n.flushPending(deadline)
      assert.equal(n.records.length, 1)
    })
    await t.test('real scheduled callback publishes at the deadline without manual flushing', child => {
      const { items, notifications: n } = fresh()
      child.mock.timers.enable({ apis: ['setTimeout'] })
      const first = now
      items.claimShoppingItem('i0')
      now = first + 59999; child.mock.timers.tick(59999)
      assert.equal(n.records.length, 0)
      now = first + 60000; child.mock.timers.tick(1)
      assert.equal(n.records.length, 1)
      assert.equal(n.pendingBatches.length, 0)
    })
    await t.test('development history is labelled demo, shared only, persisted once and does not alter items', () => {
      const { items, notifications: n } = fresh()
      const before = JSON.stringify(items.items)
      assert.equal(n.seedPreviewHistory(items.spaces, items.items).ok, true)
      assert.equal(n.records.length, 12)
      assert.ok(n.records.every(entry => entry.source === 'demo' && entry.previewOnly && items.getSpace(entry.spaceId).shared))
      assert.ok(n.records.some(entry => entry.type === 'restock-due' && entry.itemNames.length === 5 && entry.message.endsWith('…')))
      assert.equal(JSON.stringify(items.items), before)
      n.seedPreviewHistory(items.spaces, items.items)
      assert.equal(n.records.length, 12)
      n.markAllRead(); n.$dispose()
      const reloaded = useSharedNotificationsStore()
      reloaded.seedPreviewHistory(items.spaces, items.items)
      assert.equal(reloaded.records.length, 12)
      assert.equal(reloaded.hasUnread, false)
    })
    await t.test('delivery uses current members and never rewrites historical recipients or read state', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const deadline = n.pendingBatches[0].deadlineAt
      items.getSpace('family').members = [{ id: 'm2', name: '花花' }, { id: 'new', name: '新成員' }]
      n.flushPending(deadline)
      assert.deepEqual(n.records[0].recipientIds, ['m2', 'new'])
      n.markRead(n.records[0].id, 'new')
      const historical = JSON.stringify(n.records[0])
      items.getSpace('family').members = []
      n.flushPending(deadline + 1000)
      assert.equal(JSON.stringify(n.records[0]), historical)
    })
    await t.test('an initially empty recipient list does not discard events before a new member joins', () => {
      const { items, notifications: n } = fresh()
      items.getSpace('family').members = []
      items.claimShoppingItem('i0')
      assert.equal(n.pendingBatches.length, 1)
      items.addSpaceMember('family', { id: 'new', name: '新成員' })
      n.flushPending(n.pendingBatches[0].deadlineAt)
      assert.deepEqual(n.records[0].recipientIds, ['new'])
    })
    await t.test('no eligible recipients cancels delivery with a persisted diagnostic', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const deadline = n.pendingBatches[0].deadlineAt
      items.getSpace('family').members = []
      n.flushPending(deadline)
      assert.equal(n.records.length, 0)
      assert.equal(n.pendingBatches.length, 0)
      assert.equal(n.deliveryDiagnostics.at(-1).reason, 'NO_ELIGIBLE_RECIPIENTS')
      assert.equal(JSON.parse(memory.get(key('shared-notifications'))).data.deliveryDiagnostics.at(-1).reason, 'NO_ELIGIBLE_RECIPIENTS')
    })
    await t.test('cancel and reclaim cannot resurrect a stale claim even if an old pending batch is restored', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const old = JSON.parse(JSON.stringify(n.pendingBatches[0]))
      items.cancelShoppingClaim('i0')
      now += 1000
      items.claimShoppingItem('i0')
      assert.notEqual(items.getItem('i0').shoppingClaimOperationId, old.events[0].operationId)
      n.pendingBatches.push(old)
      n.flushPending(old.deadlineAt)
      assert.equal(n.records.length, 0)
      assert.ok(n.deliveryDiagnostics.some(entry => entry.eventId === old.events[0].eventId))
      n.flushPending(now + 60000)
      assert.equal(n.records.length, 1)
      assert.equal(n.records[0].eventIds.length, 1)
    })
    await t.test('mixed claim batches retain only current pending owners and discard completed items', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0'); items.claimShoppingItem('i1'); items.claimShoppingItem('i2')
      const deadline = n.pendingBatches[0].deadlineAt
      items.updateItem('i0', { shoppingClaimantId: 'm1' })
      items.updateItem('i1', { shoppingCompletedAt: now })
      n.flushPending(deadline)
      assert.deepEqual(n.records[0].itemIds, ['i2'])
      assert.equal(n.records[0].message, '使用者已認領「家庭」的丙。'.replace('使用者', n.records[0].actorName))
      assert.equal(n.deliveryDiagnostics.length, 2)
    })
    await t.test('takeover identity is invalidated by reassignment and a later takeover is a distinct event', () => {
      const { items, notifications: n } = fresh()
      items.updateItem('i0', { shoppingClaimantId: 'm1' }); items.takeOverShoppingClaim('i0')
      const old = JSON.parse(JSON.stringify(n.pendingBatches[0]))
      items.updateItem('i0', { shoppingClaimantId: 'm2' })
      now += 1000; items.takeOverShoppingClaim('i0')
      assert.equal(n.pendingBatches[0].deadlineAt, old.deadlineAt)
      assert.notEqual(n.pendingBatches[0].events[1].operationId, old.events[0].operationId)
      n.flushPending(old.deadlineAt)
      assert.equal(n.records.length, 1)
      assert.deepEqual(n.records[0].eventIds, [n.processedEventIds.at(-1)])
    })
    await t.test('legacy claims without verifiable operation identity are dropped while legacy restock records remain valid', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      delete n.pendingBatches[0].events[0].operationId
      items.completeRestock('i1', { quantity: 1 })
      const deadline = Math.max(...n.pendingBatches.map(batch => batch.deadlineAt))
      n.flushPending(deadline)
      assert.equal(n.records.length, 1)
      assert.equal(n.records[0].type, 'restocked')
      assert.ok(n.deliveryDiagnostics.some(entry => entry.reason === 'UNVERIFIABLE_CLAIM_IDENTITY'))
    })
    await t.test('full reload revalidates stored claims against new membership rather than saved recipients', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const deadline = n.pendingBatches[0].deadlineAt
      const source = JSON.parse(memory.get(key('items')))
      source.data.spaces.find(space => space.id === 'family').members = [{ id: 'new', name: '新成員' }]
      close()
      memory.set(key('items'), JSON.stringify(source))
      const p = createPinia(); piniaInstances.push(p); setActivePinia(p)
      now = deadline + 1
      useItemsStore()
      const loaded = useSharedNotificationsStore()
      assert.deepEqual(loaded.records[0].recipientIds, ['new'])
      assert.equal(loaded.records[0].deadlineAt, deadline)
    })
    await t.test('delivery storage failure retains pending state and retries with the latest membership only once', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0'); items.claimShoppingItem('i1')
      const deadline = n.pendingBatches[0].deadlineAt
      items.updateItem('i1', { shoppingClaimantId: 'm1' })
      const before = JSON.stringify(n.pendingBatches)
      install('localStorage', { ...storage, setItem() { throw new Error('quota') } })
      assert.equal(n.flushPending(deadline).ok, false)
      assert.equal(n.records.length, 0)
      assert.equal(n.deliveryDiagnostics.length, 0)
      assert.equal(JSON.stringify(n.pendingBatches), before)
      items.getSpace('family').members = [{ id: 'new', name: '新成員' }]
      install('localStorage', storage)
      n.flushPending(deadline); n.flushPending(deadline + 1)
      assert.equal(n.records.length, 1)
      assert.deepEqual(n.records[0].recipientIds, ['new'])
      assert.deepEqual(n.records[0].itemIds, ['i0'])
      assert.equal(n.deliveryDiagnostics.length, 1)
    })
    await t.test('removed items or spaces cannot send stale claims', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0'); items.claimShoppingItem('i1')
      const deadline = n.pendingBatches[0].deadlineAt
      items.removeItem('i0')
      items.spaces.splice(items.spaces.findIndex(space => space.id === 'family'), 1)
      n.flushPending(deadline)
      assert.equal(n.records.length, 0)
      assert.equal(n.pendingBatches.length, 0)
      assert.ok(n.deliveryDiagnostics.every(entry => entry.reason === 'SPACE_UNAVAILABLE'))
    })
    await t.test('source persistence failure never queues an unverifiable claim or rolls back the claim operation', () => {
      const { items, notifications: n } = fresh()
      install('localStorage', { ...storage, setItem(name, value) {
        if (name === key('items')) throw new Error('quota')
        storage.setItem(name, value)
      } })
      items.claimShoppingItem('i0')
      assert.equal(items.getItem('i0').shoppingClaimantId, 'self')
      assert.equal(n.pendingBatches.length, 0)
      install('localStorage', storage)
    })
    await t.test('missing live membership lookup never falls back to stale recipient IDs', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const dispose = registerRestockNotificationSource(piniaInstances.at(-1), { getItem: items.getItem, getSpace: items.getSpace })
      try {
        n.flushPending(n.pendingBatches[0].deadlineAt)
        assert.equal(n.records.length, 0)
        assert.equal(n.pendingBatches.length, 0)
        assert.equal(n.deliveryDiagnostics.at(-1).reason, 'MEMBERS_UNVERIFIABLE')
      } finally { dispose() }
    })
    await t.test('legacy pending claims are rejected on reload and retain durable reasons without changing old records', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const deadline = n.pendingBatches[0].deadlineAt
      const saved = JSON.parse(memory.get(key('shared-notifications')))
      delete saved.data.pendingBatches[0].events[0].operationId
      const historical = { id: 'history', type: 'claimed', source: 'event', spaceId: 'family', recipientIds: ['m1'],
        message: '原通知', createdAt: now, recipientState: { m1: { seen: true, read: true } } }
      saved.data.records.push(historical)
      close(); memory.set(key('shared-notifications'), JSON.stringify(saved))
      const p = createPinia(); piniaInstances.push(p); setActivePinia(p)
      now = deadline + 1; useItemsStore()
      const loaded = useSharedNotificationsStore()
      assert.deepEqual(JSON.parse(JSON.stringify(loaded.records)), [historical])
      assert.equal(loaded.pendingBatches.length, 0)
      assert.equal(loaded.deliveryDiagnostics.at(-1).reason, 'UNVERIFIABLE_CLAIM_IDENTITY')
      assert.equal(JSON.parse(memory.get(key('shared-notifications'))).data.deliveryDiagnostics.at(-1).reason, 'UNVERIFIABLE_CLAIM_IDENTITY')
    })
    await t.test('a stale cancellation Undo cannot resurrect a claim after a later claim/cancel cycle', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const oldCancellation = items.cancelShoppingClaim('i0')
      now += 1000; items.claimShoppingItem('i0')
      items.cancelShoppingClaim('i0')
      const latestIdentity = items.getItem('i0').shoppingClaimOperationId
      items.undoShoppingOperation(oldCancellation)
      assert.equal(items.getItem('i0').shoppingClaimantId, null)
      assert.equal(items.getItem('i0').shoppingClaimOperationId, latestIdentity)
      n.flushPending(now + 60000)
      assert.equal(n.records.length, 0)
    })
    const abruptReload = () => {
      const disk = new Map(memory)
      close()
      memory.clear(); for (const [name, value] of disk) memory.set(name, value)
      install('localStorage', storage)
      const p = createPinia(); piniaInstances.push(p); setActivePinia(p)
      return { items: useItemsStore(), n: useSharedNotificationsStore() }
    }
    await t.test('failed notification cancellation cannot resurrect a claim after abrupt restart', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0'); const deadline = n.pendingBatches[0].deadlineAt
      install('localStorage', { ...storage, setItem(name, value) { if (name === key('shared-notifications')) throw new Error('quota'); storage.setItem(name, value) } })
      assert.ok(items.cancelShoppingClaim('i0'))
      assert.equal(JSON.parse(memory.get(key('items'))).data.items.find(item => item.id === 'i0').shoppingClaimantId, null)
      const loaded = abruptReload()
      loaded.n.flushPending(deadline)
      assert.equal(loaded.items.getItem('i0').shoppingClaimantId, null)
      assert.equal(loaded.n.records.length, 0)
    })
    await t.test('source cancellation write failure leaves memory and durable claim unchanged and retryable', () => {
      const { items, notifications: n } = fresh()
      items.claimShoppingItem('i0')
      const before = JSON.stringify(items.getItem('i0'))
      const pending = JSON.stringify(n.pendingBatches)
      install('localStorage', { ...storage, setItem(name, value) { if (name === key('items')) throw new Error('quota'); storage.setItem(name, value) } })
      assert.equal(items.cancelShoppingClaim('i0'), null)
      assert.equal(JSON.stringify(items.getItem('i0')), before)
      assert.equal(JSON.stringify(n.pendingBatches), pending)
      assert.equal(JSON.parse(memory.get(key('items'))).data.items.find(item => item.id === 'i0').shoppingClaimantId, 'self')
      install('localStorage', storage)
      assert.ok(items.cancelShoppingClaim('i0'))
    })
    await t.test('failed source Undo preserves cancellation and pending data; successful retry persists original identity', () => {
      const { items, notifications: n } = fresh()
      const claim = items.claimShoppingItem('i0')
      const cancellation = items.cancelShoppingClaim('i0')
      const cancelled = JSON.stringify(items.getItem('i0'))
      install('localStorage', { ...storage, setItem(name, value) { if (name === key('items')) throw new Error('quota'); storage.setItem(name, value) } })
      assert.equal(items.undoShoppingOperation(cancellation).ok, false)
      assert.equal(JSON.stringify(items.getItem('i0')), cancelled)
      assert.equal(n.pendingBatches.length, 0)
      install('localStorage', storage)
      assert.equal(items.undoShoppingOperation(cancellation).ok, true)
      assert.equal(items.getItem('i0').shoppingClaimOperationId, claim.operationId)
      const loaded = abruptReload()
      assert.equal(loaded.items.getItem('i0').shoppingClaimOperationId, claim.operationId)
      loaded.n.flushPending(loaded.n.pendingBatches[0].deadlineAt)
      assert.equal(loaded.n.records.length, 1)
    })
    await t.test('Store claim and takeover credentials reject legacy, stale and repeated Undo', () => {
      const { items, notifications: n } = fresh()
      const old = items.claimShoppingItem('i0')
      assert.equal(old.operationId, items.getItem('i0').shoppingClaimOperationId)
      items.cancelShoppingClaim('i0')
      const current = items.claimShoppingItem('i0')
      assert.equal(items.undoShoppingOperation(old).ok, false)
      assert.equal(items.undoShoppingOperation({ id: 'i0', before: { shoppingClaimantId: null }, after: { shoppingClaimantId: 'self' } }).ok, false)
      assert.equal(items.getItem('i0').shoppingClaimOperationId, current.operationId)
      assert.equal(items.undoShoppingOperation(current).ok, true)
      assert.equal(items.undoShoppingOperation(current).ok, false)
      items.updateItem('i1', { shoppingClaimantId: 'm1' })
      const takeover = items.takeOverShoppingClaim('i1')
      assert.equal(takeover.operationId, items.getItem('i1').shoppingClaimOperationId)
      assert.equal(items.undoShoppingOperation(takeover).ok, true)
      assert.equal(items.getItem('i1').shoppingClaimantId, 'm1')
      n.flushPending(now + 60000)
      assert.equal(n.records.length, 0)
    })
    await t.test('claim Undo is durable even if notification cancellation fails, including abrupt restart', () => {
      const { items, notifications: n } = fresh()
      const claim = items.claimShoppingItem('i0')
      const deadline = n.pendingBatches[0].deadlineAt
      install('localStorage', { ...storage, setItem(name, value) { if (name === key('shared-notifications')) throw new Error('quota'); storage.setItem(name, value) } })
      assert.equal(items.undoShoppingOperation(claim).ok, true)
      const loaded = abruptReload()
      loaded.n.flushPending(deadline)
      assert.equal(loaded.n.records.length, 0)
      assert.equal(loaded.items.getItem('i0').shoppingClaimantId, null)
    })
    await t.test('all four message rules retain exact names, counts and punctuation', () => {
      assert.equal(restockNotificationMessage('家庭', ['衛生紙']), '「家庭」的衛生紙該補貨了')
      assert.equal(restockNotificationMessage('家庭', ['甲', '乙', '丙']), '「家庭」有 3 項用品該補貨：甲、乙、丙')
      assert.equal(restockNotificationMessage('家庭', ['甲', '乙', '丙', '丁']), '「家庭」有 4 項用品該補貨：甲、乙…')
      assert.equal(memberNotificationMessage({ type: 'takeover', actorName: '花花', spaceName: '家庭', itemNames: ['甲'] }), '花花已接手「家庭」的甲。')
    })
    await nextTick()
    close()
  } finally {
    for (const pinia of piniaInstances) for (const store of [...pinia._s.values()]) store.$dispose()
    for (const timer of longTimers) clearTimeout(timer)
    globalThis.setTimeout = originalSetTimeout
    Date.now = originalNow
    await server.close()
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
