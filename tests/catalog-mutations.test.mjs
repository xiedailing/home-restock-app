import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setMaxListeners } from 'node:events'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

test('Catalog stage 4A edits, overrides and deletions', async t => {
  const memory = new Map()
  const originals = new Map(['localStorage', 'document', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const install = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
  install('localStorage', storage)
  const documentMock = new EventTarget()
  documentMock.visibilityState = 'visible'
  install('document', documentMock)
  install('window', new EventTarget())
  // 本測試模擬多次重新載入，刻意建立多個 Store；只調整測試 EventTarget 的上限。
  setMaxListeners(0, documentMock, window)
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } })
  const stores = []
  try {
    const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
    const { PRESET_ITEMS } = await server.ssrLoadModule('/src/models/itemCategories.js')
    const { STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const originalPresets = JSON.stringify(PRESET_ITEMS)
    const key = 'home-restock:v1:catalog'
    const load = () => {
      setActivePinia(createPinia())
      const store = useCatalogStore()
      stores.push(store)
      return store
    }
    const fresh = data => {
      window.dispatchEvent(new Event('pagehide'))
      memory.clear()
      if (data) memory.set(key, JSON.stringify({ version: STORAGE_VERSION, data }))
      return load()
    }
    const add = (store, name = '原子筆') => store.addCatalogItem({ name, category: '文具', unit: '支', iconKey: null, iconPhoto: null, iconManual: false })
    const persisted = () => JSON.parse(memory.get(key)).data
    const snapshot = store => JSON.stringify({ items: store.allItems, overrides: store.presetOverrides, deleted: store.deletedCatalogItems })

    await t.test('custom edit trims fields, preserves ID/time/order, and immediately persists', () => {
      const store = fresh()
      const first = add(store)
      const second = add(store, '筆記本')
      const order = store.allItems.map(item => item.id)
      const result = store.updateCatalogItem(first.id, { name: ' 鋼筆 ', category: ' 個人護理 ', unit: ' 盒 ', iconKey: 'tissues', iconPhoto: 'data:image/jpeg;base64,test', iconManual: true })
      assert.equal(result.ok, true)
      assert.equal(result.item.id, first.id)
      assert.equal(result.item.createdAt, first.createdAt)
      assert.equal(result.item.name, '鋼筆')
      assert.equal(result.item.category, '個人護理')
      assert.equal(result.item.unit, '盒')
      assert.equal(result.item.iconManual, true)
      assert.deepEqual(store.allItems.map(item => item.id), order)
      assert.equal(store.catalogItems[0].id, second.id)
      assert.equal(persisted().catalogItems.find(item => item.id === first.id).name, '鋼筆')
      const reloaded = load()
      assert.equal(reloaded.getById(first.id).iconPhoto, 'data:image/jpeg;base64,test')
      assert.deepEqual(reloaded.catalogItems.map(item => item.id), [second.id, first.id])
    })
    await t.test('effective preset overrides preserve ID/order and immutable base data', () => {
      const store = fresh()
      const order = store.allItems.map(item => item.id)
      const id = 'preset:tissues'
      const result = store.updateCatalogItem(id, { name: '面紙', iconKey: 'trash-bags', category: '廚房', unit: '箱' })
      assert.equal(result.ok, true)
      assert.equal(result.item.id, id)
      assert.equal(store.getById(id).category, '廚房')
      assert.equal(store.isNameTaken(' 面紙 '), true)
      assert.equal(store.isNameTaken('面紙', id), false)
      assert.equal(store.isNameTaken('衛生紙'), false)
      assert.equal(store.isNameTaken('酒精'), true)
      assert.deepEqual(store.allItems.map(item => item.id), order)
      assert.equal(JSON.stringify(PRESET_ITEMS), originalPresets)
      assert.equal(persisted().catalogItems.length, 0)
      assert.equal(persisted().presetOverrides[id].unit, '箱')
      const reloaded = load()
      assert.equal(reloaded.getById(id).name, '面紙')
      assert.equal(reloaded.getById(id).iconKey, 'trash-bags')
      assert.deepEqual(reloaded.allItems.map(item => item.id), order)
    })
    await t.test('duplicate names are rejected across customs and overridden presets, excluding self', () => {
      const store = fresh()
      const item = add(store, 'Coffee')
      store.updateCatalogItem('preset:tissues', { name: '面紙' })
      const before = snapshot(store)
      assert.equal(store.isNameTaken(' COFFEE ', item.id), false)
      for (const name of [' 面紙 ', '酒精']) {
        const result = store.updateCatalogItem(item.id, { name })
        assert.equal(result.ok, false)
        assert.equal(result.error.code, 'NAME_TAKEN')
      }
      assert.equal(store.updateCatalogItem('preset:trash-bags', { name: ' coffee ' }).error.code, 'NAME_TAKEN')
      assert.equal(snapshot(store), before)
      assert.equal(store.updateCatalogItem(item.id, { name: ' coffee ' }).ok, true)
    })
    await t.test('invalid fields and protected identity are rejected without partial changes', () => {
      const store = fresh()
      const item = add(store)
      const before = snapshot(store)
      for (const patch of [null, [], {}, { id: 'new' }, { createdAt: '2000-01-01' }, { name: '' }, { unit: ' ' }, { category: 1 }, { iconKey: '' }, { iconPhoto: {} }, { iconManual: 1 }, { other: true }, { name: '新名', id: 'wrong' }]) {
        const result = store.updateCatalogItem(item.id, patch)
        assert.equal(result.ok, false)
        assert.equal(result.error.code, 'INVALID_INPUT')
      }
      assert.equal(snapshot(store), before)
      assert.equal(store.updateCatalogItem('unknown', { name: '新名' }).error.code, 'NOT_FOUND')
      assert.equal(store.updateCatalogItem(null, { name: '新名' }).error.code, 'INVALID_INPUT')
    })
    await t.test('reset restores defaults and rejects a conflicting restored name', () => {
      const store = fresh()
      const id = 'preset:tissues'
      store.updateCatalogItem(id, { name: '面紙', iconPhoto: 'data:image/jpeg;base64,test', unit: '箱' })
      assert.equal(store.resetPresetOverride(id).ok, true)
      assert.equal(store.getById(id).name, '衛生紙')
      assert.equal(store.getById(id).unit, '包')
      assert.equal(store.getById(id).iconPhoto, null)
      assert.equal(Object.hasOwn(store.presetOverrides, id), false)
      assert.equal(load().getById(id).name, '衛生紙')
      store.updateCatalogItem(id, { name: '面紙' })
      const custom = add(store, '衛生紙')
      const before = snapshot(store)
      assert.equal(store.resetPresetOverride(id).error.code, 'NAME_TAKEN')
      assert.equal(snapshot(store), before)
      assert.equal(store.resetPresetOverride(custom.id).error.code, 'INVALID_INPUT')
      assert.equal(store.resetPresetOverride('missing').error.code, 'NOT_FOUND')
    })
    await t.test('delete removes only custom items, persists a tombstone and clears its pending ID', () => {
      const store = fresh()
      const item = add(store)
      const spaceSnapshot = JSON.stringify({ items: [{ id: 'space-item', name: item.name, restockRecords: [{ id: 'record', date: '2026-01-01', quantity: 2 }] }] })
      memory.set('home-restock:v1:items', spaceSnapshot)
      const result = store.removeCatalogItem(item.id)
      assert.equal(result.ok, true)
      assert.equal(result.item.id, item.id)
      assert.equal(store.getById(item.id), null)
      assert.ok(!store.allItems.some(entry => entry.id === item.id))
      assert.equal(store.justAddedId, null)
      assert.equal(store.deletedCatalogItems[0].id, item.id)
      assert.equal(store.deletedCatalogItems[0].name, item.name)
      assert.ok(Number.isFinite(Date.parse(store.deletedCatalogItems[0].deletedAt)))
      assert.equal(memory.get('home-restock:v1:items'), spaceSnapshot)
      const reloaded = load()
      assert.equal(reloaded.getById(item.id), null)
      assert.equal(reloaded.deletedCatalogItems[0].id, item.id)
      const replacement = add(reloaded, item.name)
      assert.notEqual(replacement.id, item.id)
      assert.equal(reloaded.getById(item.id), null)
      assert.equal(reloaded.removeCatalogItem(item.id).error.code, 'NOT_FOUND')
    })
    await t.test('preset deletion is forbidden, including after overriding its icon and name', () => {
      const store = fresh()
      const id = 'preset:tissues'
      store.updateCatalogItem(id, { name: '面紙', iconKey: null })
      const before = snapshot(store)
      const result = store.removeCatalogItem(id)
      assert.equal(result.ok, false)
      assert.equal(result.error.code, 'PRESET_DELETE_FORBIDDEN')
      assert.equal(snapshot(store), before)
      assert.equal(store.removeCatalogItem('missing').error.code, 'NOT_FOUND')
      assert.equal(store.removeCatalogItem('').error.code, 'INVALID_INPUT')
    })
    await t.test('legacy catalog-only saves remain loadable, with no storage version reset', () => {
      const legacy = { id: 'legacy', name: '原子筆', category: '文具', unit: '支', iconKey: null, iconPhoto: null, iconManual: false, createdAt: '2026-01-01T00:00:00.000Z' }
      const store = fresh({ catalogItems: [legacy] })
      assert.equal(store.getById('legacy').name, '原子筆')
      assert.equal(store.allItems.length, 11)
      assert.deepEqual(store.presetOverrides, {})
      assert.equal(store.deletedCatalogItems.length, 0)
      assert.equal(store.updateCatalogItem('legacy', { category: '廚房' }).ok, true)
      assert.equal(JSON.parse(memory.get(key)).version, STORAGE_VERSION)
      assert.equal(load().getById('legacy').category, '廚房')
    })
    await t.test('storage failure returns an explicit error and changes no in-memory data', () => {
      const store = fresh()
      const item = add(store)
      const before = snapshot(store)
      install('localStorage', { ...storage, setItem() { throw new Error('quota exceeded') } })
      try {
        for (const result of [store.updateCatalogItem(item.id, { name: '鋼筆' }), store.updateCatalogItem('preset:tissues', { name: '面紙' }), store.resetPresetOverride('preset:tissues'), store.removeCatalogItem(item.id)]) {
          assert.equal(result.ok, false)
          assert.equal(result.error.code, 'STORAGE_FAILED')
        }
        assert.equal(snapshot(store), before)
        assert.equal(store.justAddedId, item.id)
      } finally { install('localStorage', storage) }
    })
    await t.test('invalid override keys cannot replace preset identity or inject extra fields', () => {
      const store = fresh({ catalogItems: [], presetOverrides: {
        'preset:tissues': { id: 'fake', name: '錯誤覆寫' },
        'preset:unknown': { name: '不存在' },
        'preset:trash-bags': { unit: '箱' },
      } })
      assert.equal(store.getById('preset:tissues').name, '衛生紙')
      assert.equal(store.getById('preset:unknown'), null)
      assert.equal(store.getById('preset:trash-bags').unit, '箱')
      assert.equal(store.allItems.length, 10)
    })
    await t.test('existing add/get/justAddedId contract stays compatible and editor uses guarded save', () => {
      const store = fresh()
      const item = add(store, 'COFFEE')
      assert.equal(store.justAddedId, item.id)
      assert.equal(store.addCatalogItem({ name: ' coffee ', category: '廚房', unit: '包' }), null)
      assert.equal(store.isNameTaken(' coffee '), true)
      store.clearJustAddedId()
      assert.equal(store.justAddedId, null)
      window.dispatchEvent(new Event('pagehide'))
      assert.equal(load().getById(item.id).name, 'COFFEE')
      const editor = readFileSync('src/components/settings/GlobalItemEditor.vue', 'utf8')
      assert.match(editor, /type="submit"[^>]*disabled/)
      assert.match(editor, /:disabled="!canSave"/)
      assert.match(editor, /unitChanged/)
    })
  } finally {
    window.dispatchEvent(new Event('pagehide'))
    for (const store of stores) store.$dispose()
    await server.close()
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
