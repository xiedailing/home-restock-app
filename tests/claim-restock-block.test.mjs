import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { setMaxListeners } from 'node:events'

// 共享清單的認領規則（specs/009 FR-915、specs/011 FR-1110、UT-40）。
test('claimed-by-other shared items cannot be restocked until taken over', async t => {
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
    const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
    await server.ssrLoadModule('/src/stores/catalog.js')
    const { useSharedNotificationsStore } = await server.ssrLoadModule('/src/stores/sharedNotifications.js')
    const { createItem } = await server.ssrLoadModule('/src/models/item.js')
    const { STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
    const encode = data => JSON.stringify({ version: STORAGE_VERSION, data })
    const key = name => `home-restock:v1:${name}`
    const record = id => ({ id, date: '2026-01-01', quantity: 1 })
    const listed = { inShoppingList: true, quantity: 1, addedToShoppingListDate: '2026-10-01' }
    const fixtures = () => [
      createItem({ id: 'other', catalogId: 'preset:tissues', name: '衛生紙', category: '生活日用品', unit: '包', iconKey: 'tissues', spaceId: 'family',
        restockRecords: [record('r-other')], ...listed, shoppingClaimantId: 'member-1' }),
      createItem({ id: 'none', catalogId: 'preset:trash-bags', name: '垃圾袋', category: '生活日用品', unit: '捲', iconKey: 'trash-bags', spaceId: 'family',
        restockRecords: [record('r-none')], ...listed, shoppingClaimantId: null }),
      createItem({ id: 'mine', catalogId: 'preset:sponge', name: '海綿', category: '清潔', unit: '個', iconKey: 'sponge', spaceId: 'family',
        restockRecords: [record('r-mine')], ...listed, shoppingClaimantId: 'self' }),
      createItem({ id: 'free', catalogId: 'preset:dish-soap', name: '洗碗精', category: '廚房', unit: '瓶', iconKey: 'dish-soap', spaceId: 'family',
        restockRecords: [record('r-free')] }),
      createItem({ id: 'personal', catalogId: 'preset:tissues', name: '衛生紙', category: '生活日用品', unit: '包', iconKey: 'tissues', spaceId: 'personal',
        restockRecords: [record('r-personal')] }),
    ]
    const fresh = () => {
      for (const pinia of piniaInstances) for (const store of pinia._s.values()) store.$dispose()
      piniaInstances.length = 0
      stopIntervals()
      window.dispatchEvent(new Event('pagehide'))
      memory.clear()
      memory.set(key('items'), encode({ items: fixtures(), spaces: [{ id: 'personal', name: '個人', shared: false },
        { id: 'family', name: '家庭', shared: true, members: [{ id: 'member-1', name: '小明' }] }],
        customCategories: [], departedSpaces: [], demoSeeds: ['family-unclaimed-alcohol-v1'] }))
      memory.set(key('catalog'), encode({ catalogItems: [], presetOverrides: {}, deletedCatalogItems: [] }))
      const pinia = createPinia()
      piniaInstances.push(pinia)
      setActivePinia(pinia)
      useCatalogStore()
      return { items: useItemsStore(), notifications: useSharedNotificationsStore() }
    }
    const date = '2026-10-17'

    await t.test('getClaimInfo reports none, self and other only for shared listed items', () => {
      const { items } = fresh()
      assert.deepEqual(items.getClaimInfo(items.getItem('other')), { state: 'other', name: '小明' })
      assert.deepEqual(items.getClaimInfo(items.getItem('none')), { state: 'none', name: '' })
      assert.equal(items.getClaimInfo(items.getItem('mine')).state, 'self')
      assert.equal(items.getClaimInfo(items.getItem('free')), null)
      assert.equal(items.getClaimInfo(items.getItem('personal')), null)
      assert.equal(items.getClaimInfo(null), null)
    })

    await t.test('a batch with an item claimed by someone else records nothing', () => {
      const { items, notifications } = fresh()
      const before = JSON.stringify(items.items)
      const batch = items.recordRestockBatch([
        { catalogId: 'preset:trash-bags', quantity: 1 },
        { catalogId: 'preset:tissues', quantity: 1 },
      ], { spaceId: 'family', date })
      assert.equal(batch.ok, false)
      assert.equal(batch.error.code, 'CLAIMED_BY_OTHER')
      assert.match(batch.error.message, /小明已認領「衛生紙」/)
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(notifications.records.length, 0)
    })

    await t.test('unclaimed and self-claimed items can be recorded and leave no claimant behind', () => {
      const { items } = fresh()
      const batch = items.recordRestockBatch([
        { catalogId: 'preset:trash-bags', quantity: 1 },
        { catalogId: 'preset:sponge', quantity: 2 },
        { catalogId: 'preset:dish-soap', quantity: 1 },
      ], { spaceId: 'family', date })
      assert.equal(batch.ok, true)
      for (const id of ['none', 'mine']) {
        const item = items.getItem(id)
        assert.equal(item.inShoppingList, false)
        assert.equal(item.shoppingClaimantId, null)
        assert.equal(item.restockRecords.length, 2)
      }
      assert.equal(items.getItem('free').restockRecords.length, 2)
    })

    await t.test('the same catalog item in a personal space is never blocked', () => {
      const { items } = fresh()
      const batch = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 }], { spaceId: 'personal', date })
      assert.equal(batch.ok, true)
      assert.equal(items.getItem('personal').restockRecords.length, 2)
      assert.equal(items.getItem('other').inShoppingList, true)
      assert.equal(items.getItem('other').shoppingClaimantId, 'member-1')
    })

    await t.test('taking over then recording works, and clears the claimant', () => {
      const { items } = fresh()
      items.takeOverShoppingClaim('other')
      assert.equal(items.getClaimInfo(items.getItem('other')).state, 'self')
      const batch = items.recordRestockBatch([{ catalogId: 'preset:tissues', quantity: 1 }], { spaceId: 'family', date })
      assert.equal(batch.ok, true)
      assert.equal(items.getItem('other').shoppingClaimantId, null)
      assert.equal(items.getItem('other').inShoppingList, false)
    })

    await t.test('completeRestock clears the claimant, and completing from the shopping list still undoes cleanly', () => {
      const { items } = fresh()
      const operation = items.completeShoppingItem('mine')
      assert.ok(operation)
      assert.equal(items.getItem('mine').shoppingClaimantId, null)
      assert.equal(items.getItem('mine').restockRecords.length, 2)
      items.undoShoppingOperation(operation)
      const item = items.getItem('mine')
      assert.equal(item.shoppingClaimantId, 'self')
      assert.equal(item.inShoppingList, true)
      assert.equal(item.restockRecords.length, 1)
    })
    await t.test('shopping snooze persists its date and time and preserves history and claimant', () => {
      const { items } = fresh()
      const before = structuredClone(JSON.parse(JSON.stringify(items.getItem('mine'))))
      assert.equal(items.snoozeShoppingReminder('mine', '2099-01-10').ok, true)
      const after = JSON.parse(JSON.stringify(items.getItem('mine')))
      assert.deepEqual({ ...after, updatedAt: before.updatedAt, reminderSnoozeOperationIds: before.reminderSnoozeOperationIds }, { ...before, reminderSnoozes: { self: '2099-01-10' }, reminderSnoozeTimes: { self: '08:00' } })
      const persisted = JSON.parse(memory.get(key('items'))).data.items.find(item => item.id === 'mine')
      assert.equal(persisted.reminderSnoozes.self, '2099-01-10')
      assert.equal(persisted.reminderSnoozeTimes.self, '08:00')
    })
    await t.test('shopping snooze can be modified and cancelled without changing another member', () => {
      const { items } = fresh()
      items.updateItem('mine', { reminderSnoozes: { 'member-1': '2099-02-01' }, reminderSnoozeTimes: { 'member-1': '09:30' } })
      assert.equal(items.snoozeShoppingReminder('mine', '2099-01-10').ok, true)
      assert.equal(items.snoozeShoppingReminder('mine', '2099-01-20', '14:35').ok, true)
      assert.equal(items.getItem('mine').reminderSnoozes.self, '2099-01-20')
      assert.equal(items.getItem('mine').reminderSnoozeTimes.self, '14:35')
      const persistedTime = JSON.parse(memory.get(key('items'))).data.items.find(item => item.id === 'mine').reminderSnoozeTimes
      assert.deepEqual(persistedTime, { self: '14:35', 'member-1': '09:30' })
      assert.equal(items.cancelShoppingReminderSnooze('mine').ok, true)
      assert.deepEqual(items.getItem('mine').reminderSnoozes, { 'member-1': '2099-02-01' })
      assert.deepEqual(items.getItem('mine').reminderSnoozeTimes, { 'member-1': '09:30' })
      assert.deepEqual(JSON.parse(memory.get(key('items'))).data.items.find(item => item.id === 'mine').reminderSnoozes, { 'member-1': '2099-02-01' })
    })
    await t.test('shopping snooze cancellation rolls back on storage failure', () => {
      const { items } = fresh()
      items.snoozeShoppingReminder('mine', '2099-01-10')
      const before = memory.get(key('items'))
      const write = storage.setItem
      storage.setItem = () => { throw new Error('quota') }
      try { assert.equal(items.cancelShoppingReminderSnooze('mine').ok, false) }
      finally { storage.setItem = write }
      assert.equal(items.getItem('mine').reminderSnoozes.self, '2099-01-10')
      assert.equal(memory.get(key('items')), before)
    })
    await t.test('shopping snooze rejects invalid dates, removed and completed items', () => {
      const { items } = fresh()
      for (const date of ['2020-01-01', '2099-02-31', 'invalid']) assert.equal(items.snoozeShoppingReminder('mine', date).ok, false)
      assert.equal(items.snoozeShoppingReminder('missing', '2099-01-10').ok, false)
      assert.equal(items.snoozeShoppingReminder('free', '2099-01-10').ok, false)
      items.completeShoppingItem('mine')
      assert.equal(items.snoozeShoppingReminder('mine', '2099-01-10').ok, false)
    })
    await t.test('shopping snooze storage failure rolls back memory and disk', () => {
      const { items } = fresh()
      const before = memory.get(key('items'))
      const write = storage.setItem
      storage.setItem = () => { throw new Error('quota') }
      try { assert.equal(items.snoozeShoppingReminder('mine', '2099-01-10').ok, false) }
      finally { storage.setItem = write }
      assert.equal(items.getItem('mine').snoozedUntil, null)
      assert.equal(memory.get(key('items')), before)
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
