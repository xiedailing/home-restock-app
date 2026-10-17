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
  install('window', new EventTarget())
  install('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  setMaxListeners(0, window, document)
  // Store 的延遲存檔計時器不可讓測試程序一直掛著。
  const originalSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (...args) => { const timer = originalSetTimeout(...args); if (args[1] > 1000) timer.unref(); return timer }
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } })
  try {
    const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
    const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
    const { createItem } = await server.ssrLoadModule('/src/models/item.js')
    const { STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const encode = data => JSON.stringify({ version: STORAGE_VERSION, data })
    const key = name => `home-restock:v1:${name}`
    const tissues = createItem({ id: 'p', name: '衛生紙', category: '生活日用品', unit: '包', iconKey: 'tissues', spaceId: 'personal',
      restockRecords: [{ id: 'p-record', date: '2026-01-01', quantity: 2 }] })
    const fresh = () => {
      window.dispatchEvent(new Event('pagehide'))
      memory.clear()
      memory.set(key('items'), encode({ items: [tissues], spaces: [{ id: 'personal', name: '個人', shared: false }, { id: 'family', name: '家庭', shared: true }],
        customCategories: [], departedSpaces: [], demoSeeds: ['family-unclaimed-alcohol-v1'] }))
      memory.set(key('catalog'), encode({ catalogItems: [], presetOverrides: {}, deletedCatalogItems: [] }))
      setActivePinia(createPinia())
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
  } finally {
    await server.close()
    globalThis.setTimeout = originalSetTimeout
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
})
