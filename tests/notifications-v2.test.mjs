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
    const { useSharedNotificationsStore } = await server.ssrLoadModule('/src/stores/sharedNotifications.js')
    const { createItem } = await server.ssrLoadModule('/src/models/item.js')
    const { STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const { notificationDestination } = await server.ssrLoadModule('/src/utils/notificationNavigation.js')
    const { restockNotificationMessage, memberNotificationMessage } = await server.ssrLoadModule('/src/utils/notificationCopy.js')
    const key = name => `home-restock:v1:${name}`
    const encode = data => JSON.stringify({ version: STORAGE_VERSION, data })
    const close = () => { for (const pinia of piniaInstances) for (const store of [...pinia._s.values()]) store.$dispose() }
    const fresh = () => {
      close(); memory.clear(); install('localStorage', storage)
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
      n.publishMemberEvent({ type: 'claimed', space: items.getSpace('family'), actorId: 'm1', actorName: '小明',
        itemId: 'i2', itemName: '丙', operationId: 'other-op', memberIds: ['self', 'm1', 'm2'] })
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
    const selfEvent = n => n.publishMemberEvent({ type: 'claimed', space: { id: 'family', name: '家庭', shared: true },
      actorId: 'm1', actorName: '小明', itemId: 'i0', itemName: '甲', operationId: `operation-${now}`, memberIds: ['self', 'm1', 'm2'] })
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
      install('localStorage', { ...storage, setItem() { throw new Error('quota') } })
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
