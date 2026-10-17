import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia, getActivePinia } from 'pinia'
import { setMaxListeners } from 'node:events'

test('Unit periods preserve history and isolate calculation and undo', async t => {
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
    const { migrateUnitPeriods, currentUnitRecords } = await server.ssrLoadModule('/src/utils/unitPeriods.js')
    const { getLatestRecord } = await server.ssrLoadModule('/src/models/item.js')
    const change = (catalog, unit) => catalog.updateCatalogItem('preset:tissues', { unit }, { confirmUnitChange: true })



    await t.test('legacy migration is deterministic and preserves existing snapshots and IDs', () => {
      const legacy = { id: 'legacy', unit: '盒', restockRecords: [{ id: 'a', date: '2026-01-01', quantity: 2 }, { id: 'b', date: '2026-02-01', quantity: 1, unit: '瓶', unitPeriodId: 'older' }] }
      const migrated = migrateUnitPeriods(legacy)
      assert.deepEqual(migrateUnitPeriods(migrated), migrated)
      assert.equal(migrated.restockRecords[0].unit, '盒')
      assert.equal(migrated.restockRecords[1].unit, '瓶')
      assert.equal(migrated.restockRecords[1].unitPeriodId, 'older')
      assert.deepEqual(migrated.restockRecords.map(({ id, date, quantity }) => ({ id, date, quantity })), legacy.restockRecords.map(({ id, date, quantity }) => ({ id, date, quantity })))
    })
    await t.test('third and fourth records restart inference; same-day and old-period dates do not count', () => {
      const { items, catalog } = fresh()
      items.completeRestock('p', { date: '2026-01-11', quantity: 1 })
      assert.ok(getNextRestockDate(items.getItem('p')))
      const history = JSON.stringify(items.getItem('p').restockRecords)
      assert.equal(change(catalog, '盒').ok, true)
      const item = items.getItem('p')
      assert.equal(JSON.stringify(item.restockRecords), history)
      assert.equal(getNextRestockDate(item), null)
      items.completeRestock('p', { date: '2026-02-01', quantity: 2 })
      assert.equal(getNextRestockDate(item), null)
      items.completeRestock('p', { date: '2026-02-01', quantity: 1 })
      assert.equal(getNextRestockDate(item), null)
      items.completeRestock('p', { date: '2026-02-10', quantity: 1 })
      assert.equal(getNextRestockDate(item, 0), '2026-02-13')
      const period = item.unitPeriodId
      assert.equal(change(catalog, '盒').ok, true)
      assert.equal(item.unitPeriodId, period)
      assert.equal(change(catalog, '包').ok, true)
      assert.notEqual(item.unitPeriodId, period)
      assert.equal(getNextRestockDate(item), null)
      assert.equal(item.restockRecords[0].unit, '包')
      assert.equal(item.restockRecords[2].unit, '盒')
    })
    await t.test('different spaces receive independent periods and retain IDs and claim state', () => {
      const { items, catalog } = fresh()
      const family = items.ensureCatalogItem('family', 'preset:tissues').item
      items.updateItem(family.id, { inShoppingList: true, shoppingClaimantId: 'self', quantity: 3 })
      assert.equal(change(catalog, '箱').ok, true)
      assert.notEqual(items.getItem('p').unitPeriodId, family.unitPeriodId)
      items.completeRestock('p', { date: '2026-03-01', quantity: 1 })
      items.completeRestock('p', { date: '2026-03-10', quantity: 1 })
      assert.ok(getNextRestockDate(items.getItem('p')))
      assert.equal(getNextRestockDate(family), null)
      assert.equal(family.shoppingClaimantId, 'self')
      assert.equal(family.quantity, 3)
      assert.equal(items.getItem('p').id, 'p')
    })
    await t.test('unit changes do not link legacy records by name; mismatched linked units block atomically', () => {
      const { items, catalog } = fresh()
      items.updateItem('p', { catalogId: null })
      assert.equal(change(catalog, '箱').ok, true)
      assert.equal(items.getItem('p').catalogId, null)
      assert.equal(items.getItem('p').unit, '包')
      const second = fresh()
      second.items.updateItem('p', { unit: '盒' })
      const before = JSON.stringify(second.items.items)
      assert.equal(change(second.catalog, '箱').error.code, 'SPACE_UNIT_MISMATCH')
      assert.equal(second.catalog.getById('preset:tissues').unit, '包')
      assert.equal(JSON.stringify(second.items.items), before)
    })
    await t.test('unconfirmed changes and storage failures never leave partially committed periods', () => {
      const { items, catalog } = fresh()
      const before = JSON.stringify(items.items)
      assert.equal(catalog.updateCatalogItem('preset:tissues', { unit: '箱' }).error.code, 'UNIT_CHANGE_CONFIRMATION_REQUIRED')
      let fail = true
      install('localStorage', { ...storage, setItem(k, value) { if (k === key('items') && fail) { fail = false; throw new Error('disk full') } storage.setItem(k, value) } })
      assert.equal(change(catalog, '箱').ok, false)
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(catalog.getById('preset:tissues').unit, '包')
      install('localStorage', storage)
    })
    await t.test('editing/deleting old records preserves their unit and never affects the current inference', () => {
      const { items, catalog } = fresh()
      change(catalog, '盒')
      items.completeRestock('p', { date: '2026-02-01', quantity: 1 })
      items.completeRestock('p', { date: '2026-02-11', quantity: 1 })
      const item = items.getItem('p')
      const prediction = getNextRestockDate(item)
      const old = item.restockRecords[0]
      const snapshot = items.snapshotItem('p')
      items.updateRestockRecord('p', old.id, { date: '2026-03-01', quantity: 7 })
      assert.equal(item.restockRecords[0].unit, '包')
      assert.equal(getNextRestockDate(item), prediction)
      items.restoreItem(snapshot)
      assert.equal(item.restockRecords[0].date, '2026-01-01')
      items.removeRestockRecord('p', old.id)
      assert.equal(getNextRestockDate(item), prediction)
      items.removeRestockRecord('p', item.restockRecords.at(-1).id)
      assert.equal(getNextRestockDate(item), null)
    })
    await t.test('restock then change unit then undo only removes the corresponding record', () => {
      const { items, catalog } = fresh()
      const snapshot = items.snapshotItem('p')
      items.completeRestock('p', { date: '2026-01-10', quantity: 2 })
      const removedId = items.getItem('p').restockRecords.at(-1).id
      change(catalog, '盒')
      const period = items.getItem('p').unitPeriodId
      items.completeRestock('p', { date: '2026-02-01', quantity: 1 })
      items.restoreItem(snapshot)
      const item = items.getItem('p')
      assert.equal(item.unit, '盒')
      assert.equal(item.unitPeriodId, period)
      assert.equal(item.restockRecords.some(record => record.id === removedId), false)
      assert.equal(item.restockRecords.length, 2)
      assert.equal(item.restockRecords.at(-1).unit, '盒')
      items.restoreItem(snapshot)
      assert.equal(item.restockRecords.length, 2)
    })
    await t.test('batch inference counts current dates; batch Undo retains subsequent unit changes and records', () => {
      const { items, catalog } = fresh()
      change(catalog, '盒')
      const batch = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 }, { catalogId: 'preset:trash-bags', quantity: 1 }], { spaceId: 'personal', date: '2026-02-01' })
      assert.equal(batch.ok, true)
      assert.equal(batch.results[0].startedInferring, false)
      change(catalog, '箱')
      const item = items.getItem('p')
      const period = item.unitPeriodId
      items.completeRestock('p', { date: '2026-03-01', quantity: 2 })
      batch.undo()
      assert.equal(item.unitPeriodId, period)
      assert.equal(item.unit, '箱')
      assert.equal(item.restockRecords.length, 2)
      assert.equal(items.getItemByCatalogId('personal', 'preset:trash-bags'), null)
    })
    await t.test('batch mid-operation exception rolls back records and newly created items', () => {
      const { items } = fresh()
      const before = JSON.stringify(items.items)
      const entry = { catalogId: 'preset:trash-bags', get quantity() { throw new Error('entry failure') } }
      const batch = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 }, entry], { spaceId: 'personal', date })
      assert.equal(batch.ok, false)
      assert.equal(JSON.stringify(items.items), before)
    })
    await t.test('shopping completion Undo after a unit change preserves the new period', () => {
      const { items, catalog } = fresh()
      items.updateItem('p', { inShoppingList: true, quantity: 2 })
      const operation = items.completeShoppingItem('p')
      change(catalog, '盒')
      const period = items.getItem('p').unitPeriodId
      items.undoShoppingOperation(operation)
      assert.equal(items.getItem('p').unit, '盒')
      assert.equal(items.getItem('p').unitPeriodId, period)
      assert.equal(items.getItem('p').restockRecords.length, 1)
    })

    await t.test('undo of old deletion restores its original period without rolling back new unit', () => {
      const { items, catalog } = fresh()
      const snapshot = items.snapshotItem('p')
      items.removeRestockRecord('p', 'p-record')
      change(catalog, '盒')
      const period = items.getItem('p').unitPeriodId
      items.completeRestock('p', { date, quantity: 1 })
      items.restoreItem(snapshot)
      assert.equal(items.getItem('p').unitPeriodId, period)
      assert.equal(items.getItem('p').restockRecords.find(record => record.id === 'p-record').unit, '包')
      assert.equal(currentUnitRecords(items.getItem('p')).length, 1)
    })
    await t.test('batch rollback retains all spaces/periods and does not dispatch partial notifications', () => {
      const { items, catalog } = fresh()
      items.ensureCatalogItem('family', 'preset:tissues')
      change(catalog, '盒')
      const before = JSON.stringify(items.items)
      const notices = useSharedNotificationsStore()
      let published = 0
      notices.publishMemberEvent = () => { published++ }
      const batch = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 }, { catalogId: 'missing', quantity: 1 }], { spaceId: 'family', date })
      assert.equal(batch.ok, false)
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(published, 0)
    })
    await t.test('unit transaction failure in second space keeps every period and survives reload', () => {
      const { items, catalog } = fresh()
      items.ensureCatalogItem('family', 'preset:tissues')
      window.dispatchEvent(new Event('pagehide'))
      const before = JSON.stringify(items.items)
      let fail = true
      install('localStorage', { ...storage, setItem(k, value) { if (k === key('items') && fail) { fail = false; throw new Error('disk full') } storage.setItem(k, value) } })
      assert.equal(change(catalog, '盒').ok, false)
      assert.equal(JSON.stringify(items.items), before)
      install('localStorage', storage)
      setActivePinia(createPinia()); piniaInstances.push(getActivePinia())
      assert.equal(JSON.stringify(useItemsStore().items), before)
      assert.equal(useCatalogStore().getById('preset:tissues').unit, '包')
    })
    await t.test('confirmed stale units reject; resetting preset units also requires confirmation', () => {
      const { items, catalog } = fresh()
      change(catalog, '盒')
      const period = items.getItem('p').unitPeriodId
      assert.equal(catalog.updateCatalogItem('preset:tissues', { unit: '箱' }, { confirmUnitChange: true, expectedUnit: '包' }).error.code, 'STALE_UNIT')
      assert.equal(items.getItem('p').unitPeriodId, period)
      assert.equal(catalog.resetPresetOverride('preset:tissues').error.code, 'UNIT_CHANGE_CONFIRMATION_REQUIRED')
      assert.equal(catalog.resetPresetOverride('preset:tissues', { confirmUnitChange: true }).ok, true)
      assert.equal(items.getItem('p').unit, '包')
      assert.notEqual(items.getItem('p').unitPeriodId, period)
    })
    await t.test('reload persists each period and snapshot without regeneration', () => {
      const { items, catalog } = fresh()
      change(catalog, '盒')
      items.completeRestock('p', { date, quantity: 1 })
      window.dispatchEvent(new Event('pagehide'))
      const before = JSON.stringify(items.getItem('p'))
      setActivePinia(createPinia())
      const next = useItemsStore()
      piniaInstances.push(getActivePinia())
      assert.equal(JSON.stringify(next.getItem('p')), before)
      assert.equal(next.getItem('p').restockRecords.at(-1).unit, '盒')
    })
    await t.test('later edits to the same record are never overwritten by an older Undo', () => {
      const { items, catalog } = fresh()
      const snapshot = items.snapshotItem('p')
      items.updateRestockRecord('p', 'p-record', { date: '2026-01-02', quantity: 4 })
      change(catalog, '盒')
      items.updateRestockRecord('p', 'p-record', { date: '2026-01-03', quantity: 5 })
      items.restoreItem(snapshot)
      assert.equal(items.getItem('p').restockRecords[0].quantity, 5)
      assert.equal(items.getItem('p').restockRecords[0].date, '2026-01-03')
      assert.equal(items.getItem('p').unit, '盒')
    })
    await t.test('second new-period date starts inference; Undo/deletion returns to insufficient records', () => {
      const { items, catalog } = fresh()
      change(catalog, '盒')
      const first = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 }], { spaceId: 'personal', date: '2026-03-01' })
      assert.equal(first.results[0].startedInferring, false)
      const second = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 2 }], { spaceId: 'personal', date: '2026-03-11' })
      assert.equal(second.results[0].startedInferring, true)
      assert.equal(getNextRestockDate(items.getItem('p'), 0), '2026-03-31')
      second.undo()
      assert.equal(getNextRestockDate(items.getItem('p')), null)
      assert.equal(items.getItem('p').restockRecords[0].unit, '包')
    })
    await t.test('created batch items survive Undo when a later unit period was confirmed', () => {
      const { items, catalog } = fresh()
      const batch = items.recordRestockBatch([{ catalogId: 'preset:trash-bags', quantity: 1 }], { spaceId: 'personal', date })
      const item = items.getItemByCatalogId('personal', 'preset:trash-bags')
      assert.equal(catalog.updateCatalogItem('preset:trash-bags', { unit: '箱' }, { confirmUnitChange: true }).ok, true)
      const period = item.unitPeriodId
      batch.undo()
      assert.equal(items.getItem(item.id).unitPeriodId, period)
      assert.equal(item.unit, '箱')
      assert.equal(item.restockRecords.length, 0)
      batch.undo()
      assert.equal(items.getItem(item.id).unitPeriodId, period)
    })
    await t.test('unit transactions recover prepared and committed journals without mixed periods', () => {
      for (const state of ['prepared', 'committed']) {
        const { items, catalog } = fresh()
        window.dispatchEvent(new Event('pagehide'))
        const before = { catalog: memory.get(key('catalog')), items: memory.get(key('items')) }
        assert.equal(change(catalog, '盒').ok, true)
        const after = { catalog: memory.get(key('catalog')), items: memory.get(key('items')) }
        memory.set(key('catalog-integration'), encode({ state, before, after }))
        memory.set(key('catalog'), after.catalog)
        memory.set(key('items'), before.items)
        setActivePinia(createPinia()); piniaInstances.push(getActivePinia())
        const reloaded = useItemsStore()
        const expected = JSON.parse((state === 'prepared' ? before : after).items).data.items[0]
        assert.equal(reloaded.getItem('p').unitPeriodId, expected.unitPeriodId)
        assert.equal(reloaded.getItem('p').unit, expected.unit)
        assert.equal(useCatalogStore().getById('preset:tissues').unit, expected.unit)
        assert.equal(memory.has(key('catalog-integration')), false)
      }
    })
    await t.test('invalid current records are excluded and same-unit changes preserve period', () => {
      const { items, catalog } = fresh()
      const item = items.getItem('p')
      const period = item.unitPeriodId
      change(catalog, '包')
      assert.equal(item.unitPeriodId, period)
      const invalid = [
        { id: 'bad-date', date: '2026-02-30', quantity: 2, unit: '包', unitPeriodId: period },
        { id: 'bad-number', date: '2026-02-01', quantity: 0, unit: '包', unitPeriodId: period },
      ]
      item.restockRecords.push(...invalid)
      assert.equal(currentUnitRecords(item).length, 1)
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
