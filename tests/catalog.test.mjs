import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

// 以 Vite middleware 模式解析專案既有的無副檔名匯入。
test('Catalog handoff contract', async t => {
  const memory = new Map()
  const globals = ['localStorage', 'document', 'window', 'location', 'history']
  const original = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const install = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  install('localStorage', {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key),
  })
  const documentMock = new EventTarget()
  documentMock.visibilityState = 'visible'
  install('document', documentMock)
  install('window', new EventTarget())
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' })
  const piniaInstances = []
  try {
    const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
    const { PRESET_ITEMS } = await server.ssrLoadModule('/src/models/itemCategories.js')
    const { STORE_KEYS, STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const key = 'home-restock:v1:catalog'
    const fresh = () => {
      const pinia = createPinia()
      piniaInstances.push(pinia)
      setActivePinia(pinia)
      return useCatalogStore()
    }
    let catalog = fresh()
    await t.test('ten fixed presets, units and stable IDs', () => {
      assert.equal(PRESET_ITEMS.length, 10)
      assert.deepEqual(PRESET_ITEMS.map(item => item.unit), ['包', '包', '個', '瓶', '瓶', '包', '包', '瓶', '個', '包'])
      assert.equal(catalog.catalogItems.length, 0)
      assert.deepEqual(catalog.allItems.map(item => item.id), PRESET_ITEMS.map(item => `preset:${item.iconKey}`))
      assert.equal(catalog.getById('preset:tissues').name, '衛生紙')
      assert.equal(catalog.getById('missing'), null)
      assert.equal(catalog.justAddedId, null)
      assert.equal(STORE_KEYS.catalog, 'catalog')
      assert.ok(Number.isInteger(STORAGE_VERSION))
    })
    let first, second
    await t.test('create, normalize names, reject duplicates and preserve ordering', () => {
      first = catalog.addCatalogItem({ name: '  Coffee Filter  ', iconKey: null, iconPhoto: 'data:image/jpeg;base64,test', iconManual: true, category: '廚房', unit: '張' })
      second = catalog.addCatalogItem({ name: '筆記本', iconKey: 'generic-item', category: '文具', unit: '本' })
      assert.equal(first.name, 'Coffee Filter')
      assert.ok(first.id && Number.isFinite(Date.parse(first.createdAt)))
      assert.equal(first.iconManual, true)
      assert.equal(catalog.isNameTaken(' COFFEE filter '), true)
      assert.equal(catalog.isNameTaken(' 衛生紙 '), true)
      assert.equal(catalog.isNameTaken('不存在'), false)
      assert.equal(catalog.addCatalogItem({ name: 'coffee FILTER', category: '廚房', unit: '張' }), null)
      assert.equal(catalog.addCatalogItem({ name: ' 衛生紙 ', category: '生活日用品', unit: '包' }), null)
      assert.equal(catalog.addCatalogItem({ name: ' ', category: '廚房', unit: '張' }), null)
      assert.equal(catalog.addCatalogItem({ name: '新用品', unit: '個' }), null)
      assert.equal(catalog.catalogItems.length, 2)
      assert.deepEqual(catalog.allItems.slice(0, 2).map(item => item.id), [second.id, first.id])
      catalog.allItems.filter(item => item.category === '廚房').reverse()
      assert.deepEqual(catalog.catalogItems.map(item => item.id), [second.id, first.id])
      assert.equal(catalog.justAddedId, second.id)
      catalog.clearJustAddedId()
      assert.equal(catalog.justAddedId, null)
    })
    await t.test('debounced save and reload only custom items', async () => {
      await new Promise(resolve => setTimeout(resolve, 350))
      const saved = JSON.parse(memory.get(key))
      assert.equal(saved.version, STORAGE_VERSION)
      assert.deepEqual(Object.keys(saved.data).sort(), ['catalogItems', 'deletedCatalogItems', 'deletedCategories', 'presetOverrides'])
      assert.equal(saved.data.catalogItems.length, 2)
      assert.ok(saved.data.catalogItems.every(item => !item.id.startsWith('preset:')))
      catalog = fresh()
      assert.deepEqual(catalog.catalogItems.map(item => item.id), [second.id, first.id])
      assert.equal(catalog.getById(first.id).iconPhoto, first.iconPhoto)
      assert.equal(catalog.justAddedId, null)
      assert.equal(catalog.allItems.length, 12)
    })
    await t.test('pagehide flushes latest pending creation', () => {
      const latest = catalog.addCatalogItem({ name: '記事貼', category: '文具', unit: '本' })
      window.dispatchEvent(new Event('pagehide'))
      assert.equal(JSON.parse(memory.get(key)).data.catalogItems[0].id, latest.id)
    })
    await t.test('corrupt or unavailable storage does not break presets', () => {
      memory.set(key, '{invalid json')
      assert.equal(fresh().allItems.length, 10)
      memory.set(key, JSON.stringify({ version: STORAGE_VERSION, data: { catalogItems: [null, {}, { id: 'bad' }] } }))
      assert.equal(fresh().catalogItems.length, 0)
      const storage = globalThis.localStorage
      install('localStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
      const blocked = fresh()
      assert.equal(blocked.allItems.length, 10)
      assert.ok(blocked.addCatalogItem({ name: '牙刷', category: '個人護理', unit: '支' }))
      window.dispatchEvent(new Event('pagehide'))
      install('localStorage', storage)
    })
    await t.test('?reset=1 clears catalog without changing storage version', async () => {
      memory.set(key, 'test')
      install('location', { href: 'https://example.test/inventory?reset=1&keep=yes' })
      let resetUrl
      install('history', { state: null, replaceState(_state, _title, url) { resetUrl = url } })
      await server.ssrLoadModule('/src/utils/persist.js?catalog-reset-test')
      assert.equal(memory.has(key), false)
      assert.equal(resetUrl, '/inventory?keep=yes')
    })
  } finally {
    for (const pinia of piniaInstances) for (const store of pinia._s.values()) store.$dispose()
    await server.close()
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
