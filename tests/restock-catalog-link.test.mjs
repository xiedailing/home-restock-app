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
    await t.test('minimal notifications never seed demos or publish unsupported operations', () => {
      const { items } = fresh()
      const notifications = useSharedNotificationsStore()
      assert.equal(notifications.records.length, 0)
      assert.equal('initializeDemo' in notifications, false)
      for (const type of ['claimed', 'takeover']) notifications.publishMemberEvent({ type,
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
      assert.equal(notifications.records.filter(entry => entry.type === 'restocked').length, eventCount + 2)
      assert.equal(item.restockRecords.length, 2)
      batch.undo()
      assert.equal(JSON.stringify(item.restockRecords), before)
      assert.equal(items.getItemByCatalogId('family', 'preset:trash-bags'), null)
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
