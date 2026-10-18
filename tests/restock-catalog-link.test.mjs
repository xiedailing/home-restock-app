import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { setMaxListeners } from 'node:events'

test('recordRestockBatch resolves space items by catalogId', async t => {
  const originals = new Map(['localStorage', 'window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const memory = new Map()
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
  const install = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  install('localStorage', storage)
  const intervals = new Set()
  const piniaInstances = []
  const stopIntervals = () => { for (const timer of intervals) clearInterval(timer); intervals.clear() }
  install('window', Object.assign(new EventTarget(), {
    setInterval(fn, delay) { const timer = setInterval(fn, delay); timer.unref(); intervals.add(timer); return timer },
    clearInterval(timer) { clearInterval(timer); intervals.delete(timer) },
  }))
  install('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  setMaxListeners(0, window, document)
  // Store 的延遲存檔計時器不可讓測試程序一直掛著。
  const originalSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (...args) => { const timer = originalSetTimeout(...args); if (args[1] > 1000) timer.unref(); return timer }
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } })
  try {
    const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
    const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
    const { useSharedNotificationsStore } = await server.ssrLoadModule('/src/stores/sharedNotifications.js')
    const { getNextRestockDate } = await server.ssrLoadModule('/src/models/item.js')
    const { createItem } = await server.ssrLoadModule('/src/models/item.js')
    const { STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const encode = data => JSON.stringify({ version: STORAGE_VERSION, data })
    const key = name => `home-restock:v1:${name}`
    const tissues = createItem({ id: 'p', name: '衛生紙', category: '生活日用品', unit: '包', iconKey: 'tissues', spaceId: 'personal',
      restockRecords: [{ id: 'p-record', date: '2026-01-01', quantity: 2 }] })
    const fresh = () => {
      for (const pinia of piniaInstances) for (const store of pinia._s.values()) store.$dispose()
      piniaInstances.length = 0
      stopIntervals()
      window.dispatchEvent(new Event('pagehide'))
      memory.clear()
      memory.set(key('items'), encode({ items: [tissues], spaces: [{ id: 'personal', name: '個人', shared: false }, { id: 'family', name: '家庭', shared: true, members: [{ id: 'member-1', name: '小明' }] }],
        customCategories: [], departedSpaces: [], demoSeeds: ['family-unclaimed-alcohol-v1'] }))
      memory.set(key('catalog'), encode({ catalogItems: [], presetOverrides: {}, deletedCatalogItems: [] }))
      const pinia = createPinia()
      piniaInstances.push(pinia)
      setActivePinia(pinia)
      return { items: useItemsStore(), catalog: useCatalogStore() }
    }
    const date = '2026-10-17'

    await t.test('reuses the linked space item and creates missing ones', () => {
      const { items } = fresh()
      const batch = items.recordRestockBatch([
        { catalogId: 'preset:tissues', quantity: 1 },
        { catalogId: 'preset:trash-bags', quantity: 3 },
      ], { spaceId: 'personal', date })
      assert.equal(batch.ok, true)
      assert.equal(batch.results[0].id, 'p')
      assert.equal(items.getItem('p').restockRecords.length, 2)
      const created = items.getItemByCatalogId('personal', 'preset:trash-bags')
      assert.equal(created.restockRecords.length, 1)
      assert.equal(batch.results[1].id, created.id)
    })

    await t.test('still finds the same space item after the catalog item is renamed', () => {
      const { items, catalog } = fresh()
      assert.equal(catalog.updateCatalogItem('preset:tissues', { name: '抽取式衛生紙' }).ok, true)
      const batch = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 }], { spaceId: 'personal', date })
      assert.equal(batch.ok, true)
      assert.equal(batch.results[0].id, 'p')
      assert.equal(batch.results[0].name, '抽取式衛生紙')
      assert.equal(items.items.filter(item => item.spaceId === 'personal').length, 1)
    })

    await t.test('a failing entry rolls back the whole batch', () => {
      const { items } = fresh()
      const batch = items.recordRestockBatch([
        { catalogId: 'preset:tissues', quantity: 1 },
        { catalogId: 'preset:trash-bags', quantity: 1 },
        { catalogId: 'missing-catalog-id', quantity: 1 },
      ], { spaceId: 'personal', date })
      assert.equal(batch.ok, false)
      assert.equal(batch.error.code, 'NOT_FOUND')
      assert.equal(items.getItem('p').restockRecords.length, 1)
      assert.equal(items.getItemByCatalogId('personal', 'preset:trash-bags'), null)
    })

    await t.test('items loaded through catalog migration can still be snapshotted and removed', () => {
      const { items } = fresh()
      assert.doesNotThrow(() => items.removeItem('p'))
      assert.equal(items.getItem('p'), undefined)
    })

    await t.test('undo restores records and removes only newly created space items', () => {
      const { items } = fresh()
      const batch = items.recordRestockBatch([
        { catalogId: 'preset:tissues', quantity: 1 },
        { catalogId: 'preset:trash-bags', quantity: 1 },
      ], { spaceId: 'personal', date })
      batch.undo()
      assert.equal(items.getItem('p').restockRecords.length, 1)
      assert.equal(items.getItemByCatalogId('personal', 'preset:trash-bags'), null)
      assert.ok(items.getItem('p'))
    })
    await t.test('notifications never seed demos or accept unsupported operations', () => {
      const { items } = fresh()
      const notifications = useSharedNotificationsStore()
      assert.equal(notifications.records.length, 0)
      assert.equal('initializeDemo' in notifications, false)
      for (const type of ['unknown']) notifications.publishMemberEvent({ type,
        space: items.getSpace('family'), actorId: 'self', actorName: '測試者', itemName: '衛生紙', memberIds: ['self', 'member-1'] })
      assert.equal(notifications.records.length, 0)
      notifications.publishMemberEvent({ type: 'restocked', space: items.getSpace('personal'),
        actorId: 'self', actorName: '測試者', itemName: '衛生紙', memberIds: ['self', 'member-1'] })
      assert.equal(notifications.records.length, 0)
    })
    await t.test('notification events persist and existing WIP metadata is retained without adding demos', () => {
      const { items } = fresh()
      const oldEntry = { id: 'existing-wip', type: 'claimed', source: 'demo', spaceId: 'family',
        createdAt: Date.now(), recipientIds: ['self'], read: true, seen: true, message: '既有通知內容' }
      memory.set(key('shared-notifications'), encode({ records: [oldEntry], demoInitialized: true }))
      const notifications = useSharedNotificationsStore()
      const item = items.ensureCatalogItem('family', 'preset:tissues').item
      items.completeRestock(item.id, { date, quantity: 1 })
      assert.equal(notifications.records.length, 1)
      notifications.flushPending(Date.now() + 60000)
      const stored = JSON.parse(memory.get(key('shared-notifications'))).data
      assert.equal(stored.records.length, 2)
      assert.equal(stored.demoInitialized, true)
      assert.deepEqual(stored.records[0], oldEntry)
      notifications.$dispose()
      const reloaded = useSharedNotificationsStore()
      assert.equal(reloaded.records.length, 2)
      assert.equal(reloaded.records[1].type, 'restocked')
      assert.deepEqual(reloaded.records[0], oldEntry)
    })
    await t.test('single shared restock publishes once and tracks its record', () => {
      const { items } = fresh()
      const linked = items.ensureCatalogItem('family', 'preset:tissues').item
      const notifications = useSharedNotificationsStore()
      // 只建立測試 fixture；正式最小資料層不包含提醒產生器或展示通知。
      notifications.records.push({ id: 'due-fixture', type: 'restock-due', source: 'event', spaceId: 'family',
        createdAt: Date.now(), recipientIds: ['self'], message: '補貨提醒測試',
        targets: [{ itemId: linked.id, completionRecordIds: [] }] })
      items.completeRestock(linked.id, { date, quantity: 2 })
      assert.equal(linked.restockRecords.length, 1)
      assert.equal(notifications.records.filter(entry => entry.type === 'restocked').length, 0)
      notifications.flushPending(Date.now() + 60000)
      const events = notifications.records.filter(entry => entry.type === 'restocked')
      assert.equal(events.length, 1)
      assert.ok(!events[0].recipientIds.includes('self'))
      assert.deepEqual(notifications.records.find(entry => entry.type === 'restock-due').targets[0].completionRecordIds, [linked.restockRecords[0].id])
    })
    await t.test('failed shared batch publishes no notifications and restores all items', () => {
      const { items } = fresh()
      const notifications = useSharedNotificationsStore()
      const before = JSON.stringify(items.items)
      const batch = items.recordRestockBatch([
        { catalogId: 'preset:tissues', quantity: 1 },
        { catalogId: 'missing', quantity: 1 },
      ], { spaceId: 'family', date })
      assert.equal(batch.ok, false)
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(notifications.records.length, 0)
    })
    await t.test('successful batch publishes one event per item and undo restores existing records', () => {
      const { items } = fresh()
      const item = items.ensureCatalogItem('family', 'preset:tissues').item
      items.completeRestock(item.id, { date: '2026-01-01', quantity: 2 })
      const before = JSON.stringify(item.restockRecords)
      const notifications = useSharedNotificationsStore()
      const eventCount = notifications.records.filter(entry => entry.type === 'restocked').length
      const batch = items.recordRestockBatch([
        { catalogId: 'preset:tissues', quantity: 1 },
        { catalogId: 'preset:trash-bags', quantity: 1 },
      ], { spaceId: 'family', date })
      assert.equal(batch.ok, true)
      assert.equal(notifications.records.filter(entry => entry.type === 'restocked').length, eventCount)
      assert.equal(notifications.pendingBatches.length, 1)
      assert.equal(item.restockRecords.length, 2)
      batch.undo()
      assert.equal(JSON.stringify(item.restockRecords), before)
      assert.equal(items.getItemByCatalogId('family', 'preset:trash-bags'), null)
    })
    await t.test('59-second Undo cancels persistent pending events; restart never replays cancelled records', () => {
      const { items, catalog } = fresh()
      const item = items.ensureCatalogItem('family', 'preset:tissues').item
      const notices = useSharedNotificationsStore()
      const snapshot = items.snapshotItem(item.id)
      items.completeRestock(item.id, { date, quantity: 1 })
      const batch = notices.pendingBatches[0]
      assert.equal(batch.deadlineAt - batch.firstEventAt, 60000)
      notices.flushPending(batch.firstEventAt + 59000)
      assert.equal(notices.records.length, 0)
      const changed = catalog.updateCatalogItem('preset:tissues', { unit: '箱' }, { confirmUnitChange: true })
      assert.equal(changed.ok, true)
      const period = item.unitPeriodId
      const originalNow = Date.now
      Date.now = () => batch.firstEventAt + 59000
      try { items.restoreItem(snapshot) } finally { Date.now = originalNow }
      assert.equal(item.unit, '箱')
      assert.equal(item.unitPeriodId, period)
      assert.equal(notices.pendingBatches.length, 0)
      notices.$dispose()
      const reloaded = useSharedNotificationsStore()
      reloaded.flushPending(batch.deadlineAt)
      assert.equal(reloaded.records.length, 0)
      assert.equal(item.restockRecords.length, 0)
    })
    await t.test('fixed window merges items, deduplicates replay and survives reload with its deadline', () => {
      const { items } = fresh()
      const item = items.ensureCatalogItem('family', 'preset:tissues').item
      const second = items.ensureCatalogItem('family', 'preset:trash-bags').item
      const notices = useSharedNotificationsStore()
      items.completeRestock(item.id, { date, quantity: 1 })
      const deadline = notices.pendingBatches[0].deadlineAt
      items.completeRestock(second.id, { date, quantity: 1 })
      assert.equal(notices.pendingBatches.length, 1)
      assert.equal(notices.pendingBatches[0].deadlineAt, deadline)
      notices.publishMemberEvent({ type: 'restocked', space: items.getSpace('family'), actorId: 'self', actorName: '測試',
        itemId: item.id, recordId: item.restockRecords[0].id, itemName: item.name, memberIds: ['self', 'member-1'] })
      assert.equal(notices.pendingBatches[0].events.length, 2)
      notices.$dispose()
      const reloaded = useSharedNotificationsStore()
      assert.equal(reloaded.pendingBatches[0].deadlineAt, deadline)
      reloaded.flushPending(deadline - 1)
      assert.equal(reloaded.records.length, 0)
      reloaded.flushPending(deadline)
      assert.equal(reloaded.records.length, 1)
      assert.equal(reloaded.records[0].itemIds.length, 2)
      reloaded.flushPending(deadline + 1000)
      assert.equal(reloaded.records.length, 1)
    })
    await t.test('partial Undo keeps only valid records; failed publication keeps pending and restock data', () => {
      const { items } = fresh()
      const item = items.ensureCatalogItem('family', 'preset:tissues').item
      const second = items.ensureCatalogItem('family', 'preset:trash-bags').item
      const notices = useSharedNotificationsStore()
      const snapshot = items.snapshotItem(item.id)
      items.completeRestock(item.id, { date, quantity: 1 })
      items.completeRestock(second.id, { date, quantity: 1 })
      const deadline = notices.pendingBatches[0].deadlineAt
      items.restoreItem(snapshot)
      const before = JSON.stringify(items.items)
      install('localStorage', { ...storage, setItem() { throw new Error('quota') } })
      assert.equal(notices.flushPending(deadline).ok, false)
      assert.equal(notices.records.length, 0)
      assert.equal(notices.pendingBatches.length, 1)
      assert.equal(JSON.stringify(items.items), before)
      install('localStorage', storage)
      notices.flushPending(deadline)
      assert.deepEqual(notices.records[0].itemIds, [second.id])
    })
    await t.test('full app reload publishes overdue pending exactly once using persisted restock records', () => {
      const { items } = fresh()
      const item = items.ensureCatalogItem('family', 'preset:tissues').item
      items.completeRestock(item.id, { date, quantity: 1 })
      const notices = useSharedNotificationsStore()
      const deadline = notices.pendingBatches[0].deadlineAt
      window.dispatchEvent(new Event('pagehide'))
      for (const store of [...piniaInstances.at(-1)._s.values()]) store.$dispose()
      const pinia = createPinia(); piniaInstances.push(pinia); setActivePinia(pinia)
      const originalNow = Date.now
      Date.now = () => deadline + 100
      try {
        const reloadedItems = useItemsStore()
        const reloaded = useSharedNotificationsStore()
        assert.equal(reloaded.records.length, 1)
        assert.equal(reloaded.pendingBatches.length, 0)
        assert.equal(reloadedItems.getItem(item.id).restockRecords.length, 1)
        reloaded.$dispose()
        assert.equal(useSharedNotificationsStore().records.length, 1)
      } finally { Date.now = originalNow }
    })
    await t.test('restock data errors are not swallowed as notification failures', () => {
      const { items } = fresh()
      const item = items.getItem('p')
      item.restockRecords = null
      const reported = []
      const originalError = console.error
      console.error = (...args) => reported.push(args)
      try {
        assert.throws(() => items.completeRestock('p', { date }), TypeError)
        assert.equal(reported.length, 0)
        assert.equal(item.restockRecords, null)
      } finally { console.error = originalError }
    })
    await t.test('notification failures cannot interrupt single/batch restock or undo', () => {
      const { items } = fresh()
      const notifications = useSharedNotificationsStore()
      const reported = []
      const originalError = console.error
      console.error = (...args) => reported.push(args)
      notifications.publishMemberEvent = () => { throw new Error('delivery failed') }
      notifications.trackRestockCompletion = () => { throw new Error('tracking failed') }
      try {
        const item = items.getItem('p')
        const before = JSON.stringify(item.restockRecords)
        items.completeRestock('p', { date, quantity: 1 })
        assert.equal(item.restockRecords.length, 2)
        const expectedNextDate = getNextRestockDate(item, 5)
        assert.equal(reported.length, 1) // 個人用品不發共享通知；仍追蹤完成狀態。
        assert.equal(reported[0][1].recordId, item.restockRecords[1].id)
        assert.equal(reported[0][1].error.message, 'tracking failed')
        const batch = items.recordRestockBatch([
          { catalogId: 'preset:tissues', quantity: 1 },
          { catalogId: 'preset:trash-bags', quantity: 2 },
        ], { spaceId: 'family', date })
        assert.equal(batch.ok, true)
        assert.equal(batch.results.length, 2)
        for (const result of batch.results) assert.equal(items.getItem(result.id).restockRecords.length, 1)
        assert.equal(reported.length, 5)
        assert.equal(getNextRestockDate(item, 5), expectedNextDate)
        batch.undo()
        assert.equal(items.getItemByCatalogId('family', 'preset:tissues'), null)
        assert.equal(items.getItemByCatalogId('family', 'preset:trash-bags'), null)
        assert.equal(item.restockRecords.length, 2)
        assert.notEqual(JSON.stringify(item.restockRecords), before)
        assert.equal(new Set(item.restockRecords.map(record => record.id)).size, 2)
      } finally { console.error = originalError }
    })
    await t.test('stale-link repair never persists partial records from a failed batch, including abrupt restart', () => {
      const { items } = fresh()
      const a = items.ensureCatalogItem('family', 'preset:tissues').item
      const b = items.ensureCatalogItem('family', 'preset:trash-bags').item
      items.updateItem(b.id, { name: '舊名稱', unit: '盒' })
      window.dispatchEvent(new Event('pagehide'))
      // The last persisted baseline is captured before any batch mutation.
      const baseline = JSON.stringify(items.items)
      const writes = []
      install('localStorage', { ...storage, setItem(name, value) { if (name === key('items')) writes.push(value); storage.setItem(name, value) } })
      const result = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 },
        { catalogId: 'preset:trash-bags', quantity: 1 }, { catalogId: 'missing', quantity: 1 }], { spaceId: 'family', date })
      assert.equal(result.ok, false)
      assert.equal(JSON.stringify(items.items), baseline)
      assert.equal(writes.length, 0)
      assert.equal(JSON.parse(memory.get(key('items'))).data.items.find(item => item.id === a.id).restockRecords.length, 0)
      const disk = new Map(memory)
      for (const p of piniaInstances) for (const store of p._s.values()) store.$dispose()
      memory.clear(); for (const [name, value] of disk) memory.set(name, value)
      const p = createPinia(); piniaInstances.push(p); setActivePinia(p)
      assert.equal(useItemsStore().getItem(a.id).restockRecords.length, 0)
    })
    await t.test('batch commit write failure restores existing and newly created items with no notifications', () => {
      const { items } = fresh()
      const before = JSON.stringify(items.items)
      const disk = memory.get(key('items'))
      const notices = useSharedNotificationsStore()
      install('localStorage', { ...storage, setItem(name, value) { if (name === key('items')) throw new Error('quota'); storage.setItem(name, value) } })
      const result = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 },
        { catalogId: 'preset:trash-bags', quantity: 2 }], { spaceId: 'family', date })
      assert.equal(result.ok, false)
      assert.equal(result.error.code, 'STORAGE_FAILED')
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(memory.get(key('items')), disk)
      assert.equal(notices.pendingBatches.length, 0)
      install('localStorage', storage)
    })
    await t.test('successful batch writes only whole batches and is durable before notification delivery', () => {
      const { items } = fresh()
      const a = items.ensureCatalogItem('family', 'preset:tissues').item
      const b = items.ensureCatalogItem('family', 'preset:trash-bags').item
      items.updateItem(b.id, { name: '過時名稱' })
      const counts = []
      install('localStorage', { ...storage, setItem(name, value) {
        if (name === key('items')) { const all = JSON.parse(value).data.items; counts.push([a.id, b.id].map(id => all.find(item => item.id === id).restockRecords.length)) }
        storage.setItem(name, value)
      } })
      const result = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 },
        { catalogId: 'preset:trash-bags', quantity: 2 }], { spaceId: 'family', date })
      assert.equal(result.ok, true)
      assert.ok(counts.length > 0)
      assert.ok(counts.every(([first, second]) => first === 1 && second === 1))
      const before = JSON.stringify(items.items)
      const disk = memory.get(key('items'))
      install('localStorage', { ...storage, setItem(name, value) { if (name === key('items')) throw new Error('quota'); storage.setItem(name, value) } })
      assert.equal(result.undo().ok, false)
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(memory.get(key('items')), disk)
      install('localStorage', storage)
      assert.equal(result.undo().ok, true)
      assert.equal(items.getItem(a.id).restockRecords.length, 0)
      assert.equal(items.getItem(b.id).restockRecords.length, 0)
      assert.equal(JSON.parse(memory.get(key('items'))).data.items.find(item => item.id === a.id).restockRecords.length, 0)
      assert.equal(result.undo().ok, false)
    })

  } finally {
    for (const pinia of piniaInstances) for (const store of pinia._s.values()) store.$dispose()
    stopIntervals()
    await server.close()
    globalThis.setTimeout = originalSetTimeout
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
})
