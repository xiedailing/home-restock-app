import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, effectScope, reactive, watch } from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { setMaxListeners } from 'node:events'

test('Catalog ID association and recoverable synchronization', async t => {
  const originals = new Map(['localStorage', 'window', 'document', 'setTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const memory = new Map()
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
  const install = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  install('localStorage', storage)
  install('window', new EventTarget())
  install('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  setMaxListeners(0, window, document)
  const timers = []
  const originalSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (...args) => { const timer = originalSetTimeout(...args); if (args[1] > 1000) { timer.unref(); timers.push(timer) } return timer }
  const filename = `${process.cwd()}/src/components/settings/__links_editor_test.js`
  const editorSource = compileScript(parse(readFileSync('src/components/settings/GlobalItemEditor.vue', 'utf8')).descriptor, { id: 'links-editor' }).content.replace(/import (\w+) from '[^']+\.vue'/g, 'const $1 = {}')
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, plugins: [{ name: 'links-editor-test', resolveId(id) { if (id === filename) return id }, load(id) { if (id === filename) return editorSource } }] })
  const piniaInstances = [], scopes = []
  try {
    const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
    const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
    const { createItem } = await server.ssrLoadModule('/src/models/item.js')
    const { migrateCatalogLinks } = await server.ssrLoadModule('/src/utils/catalogLinks.js')
    const { loadPersisted, STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const encode = data => JSON.stringify({ version: STORAGE_VERSION, data })
    const key = name => `home-restock:v1:${name}`
    const baseCatalog = { catalogItems: [], presetOverrides: {}, deletedCatalogItems: [] }
    const make = (id, spaceId = 'personal', changes = {}) => createItem({ id, name: '衛生紙', category: '生活日用品', unit: '包', iconKey: 'tissues', spaceId,
      inShoppingList: true, shoppingClaimantId: 'other', reminderEnabled: false, quantity: 2,
      restockRecords: [{ id: `${id}-record`, date: '2026-01-01', quantity: 2 }], ...changes })
    const itemData = items => ({ items, spaces: [{ id: 'personal', name: '個人', shared: false }, { id: 'family', name: '家庭', shared: true }], customCategories: [], departedSpaces: [], demoSeeds: ['family-unclaimed-alcohol-v1'] })
    const pinia = () => { const p = createPinia(); piniaInstances.push(p); setActivePinia(p); return p }
    const fresh = (items = [make('p'), make('f', 'family')], catalog = baseCatalog) => {
      install('localStorage', storage)
      window.dispatchEvent(new Event('pagehide'))
      memory.clear()
      memory.set(key('items'), encode(itemData(items)))
      memory.set(key('catalog'), encode(catalog))
      pinia()
      return { items: useItemsStore(), catalog: useCatalogStore() }
    }
    await t.test('unique legacy items link across spaces, ambiguous/mismatched/deleted candidates remain null', () => {
      const candidate = { id: 'preset:tissues', name: '衛生紙', category: '生活日用品', unit: '包' }
      const old = [make('p'), make('f', 'family')]
      const linked = migrateCatalogLinks(old, [candidate])
      assert.ok(linked.every(item => item.catalogId === candidate.id))
      assert.deepEqual(migrateCatalogLinks(linked, [candidate]), linked)
      const cases = [ [make('a'), make('b')], [make('a', 'personal', { unit: '箱' })], [make('a', 'personal', { category: '清潔' })] ]
      for (const values of cases) assert.ok(migrateCatalogLinks(values, [candidate]).every(item => item.catalogId === null))
      assert.equal(migrateCatalogLinks([make('a')], [], [])[0].catalogId, null)
      assert.equal(migrateCatalogLinks([make('a')], [candidate], [{ name: '衛生紙' }])[0].catalogId, null)
      assert.equal(migrateCatalogLinks([make('a', 'personal', { catalogId: 'old-deleted' })], [candidate])[0].catalogId, 'old-deleted')
    })
    await t.test('creation enforces unique catalog per space and exposes a restock-page ensure API', () => {
      const { items } = fresh()
      assert.equal(items.getItemByCatalogId('personal', 'preset:tissues').id, 'p')
      assert.equal(items.ensureCatalogItem('personal', 'preset:tissues').created, false)
      const first = items.ensureCatalogItem('family', 'preset:trash-bags')
      assert.equal(first.ok, true)
      assert.equal(first.created, true)
      assert.equal(first.item.catalogId, 'preset:trash-bags')
      assert.equal(first.item.restockRecords.length, 0)
      assert.equal(items.ensureCatalogItem('family', 'preset:trash-bags').created, false)
      assert.throws(() => items.addItem({ name: '另一筆', spaceId: 'family', catalogId: 'preset:trash-bags' }), { code: 'DUPLICATE_CATALOG_LINK' })
      assert.throws(() => items.updateItem('f', { spaceId: 'personal' }), { code: 'DUPLICATE_CATALOG_LINK' })
      assert.equal(items.ensureCatalogItem('missing', 'preset:tissues').ok, false)
      assert.equal(items.ensureCatalogItem('family', 'missing').ok, false)
    })
    await t.test('pre-existing ambiguous links remain intact and unrelated item operations are not blocked', () => {
      const { items } = fresh([make('a', 'personal', { catalogId: 'preset:tissues' }), make('b', 'personal', { catalogId: 'preset:tissues' })])
      assert.throws(() => items.getItemByCatalogId('personal', 'preset:tissues'), { code: 'AMBIGUOUS_CATALOG_LINK' })
      items.updateItem('a', { quantity: 7 })
      assert.equal(items.getItem('a').quantity, 7)
      const snapshot = items.snapshotItem('a')
      items.restoreItem(snapshot)
      assert.equal(items.items.length, 2)
      assert.equal(items.getItem('a').restockRecords[0].id, 'a-record')
    })
    await t.test('category reaches zero only after space categories synchronize; empty-category deletion preserves moved items', () => {
      const custom = { id: 'custom-stationery', name: '筆', category: '文具', unit: '個', createdAt: '2026-01-01T00:00:00Z' }
      const { items, catalog } = fresh([
        make('p', 'personal', { name: '筆', category: '文具', catalogId: custom.id, unit: '個' }),
        make('f', 'family', { name: '筆', category: '文具', catalogId: custom.id, unit: '個' }),
      ], { ...baseCatalog, catalogItems: [custom] })
      items.customCategories = ['文具']
      const records = items.items.map(item => JSON.stringify(item.restockRecords))
      let observedZero = false
      const stop = watch(() => catalog.allItems.filter(item => item.category === '文具').length, count => {
        if (count === 0) {
          observedZero = true
          assert.ok(items.items.every(item => item.category === '清潔'))
          assert.ok(loadPersisted('items').items.every(item => item.category === '清潔'))
        }
      }, { flush: 'sync' })
      try {
        assert.equal(catalog.updateCatalogItem(custom.id, { category: '清潔' }).ok, true)
        assert.equal(observedZero, true)
        assert.equal(catalog.removeCustomCategory('文具').ok, true)
        assert.ok(items.items.every(item => item.category === '清潔'))
        assert.deepEqual(items.items.map(item => JSON.stringify(item.restockRecords)), records)
        pinia()
        assert.ok(useItemsStore().items.every(item => item.category === '清潔'))
        assert.equal(useCatalogStore().getById(custom.id).category, '清潔')
      } finally { stop() }
    })
    await t.test('rename and category sync preserve IDs, history array and all non-metadata state', () => {
      const { items, catalog } = fresh()
      const original = items.items.map(item => ({ id: item.id, recordArray: item.restockRecords, state: JSON.stringify(item) }))
      assert.equal(catalog.updateCatalogItem('preset:tissues', { name: '抽取式衛生紙', category: '清潔' }).ok, true)
      for (const before of original) {
        const item = items.getItem(before.id)
        const expected = { ...JSON.parse(before.state), name: '抽取式衛生紙', category: '清潔' }
        assert.deepEqual(JSON.parse(JSON.stringify(item)), expected)
        assert.equal(item.restockRecords, before.recordArray)
      }
      pinia()
      assert.equal(useCatalogStore().getById('preset:tissues').name, '抽取式衛生紙')
      assert.ok(useItemsStore().items.every(item => item.name === '抽取式衛生紙'))
      assert.equal(memory.has(key('catalog-integration')), false)
    })
    await t.test('manual icons/photos survive while inherited icons continue following global changes', () => {
      const { items, catalog } = fresh([make('p'), make('f', 'family', { iconManual: true, iconKey: 'dish-soap', iconPhoto: 'data:local' })])
      assert.equal(catalog.updateCatalogItem('preset:tissues', { iconKey: 'trash-bags', iconPhoto: 'data:global', iconManual: true }).ok, true)
      assert.equal(items.getItem('p').iconPhoto, 'data:global')
      assert.equal(items.getItem('p').catalogIconInherited, true)
      assert.equal(items.getItem('f').iconPhoto, 'data:local')
      assert.equal(catalog.updateCatalogItem('preset:tissues', { iconPhoto: null, iconKey: 'sponge' }).ok, true)
      assert.equal(items.getItem('p').iconKey, 'sponge')
      items.updateItem('p', { iconKey: 'dish-soap', iconManual: true })
      assert.equal(items.getItem('p').catalogIconInherited, false)
      catalog.updateCatalogItem('preset:tissues', { iconKey: 'light-bulb' })
      assert.equal(items.getItem('p').iconKey, 'dish-soap')
    })
    await t.test('space-name conflicts and linked unit edits reject before changing either store', () => {
      const { items, catalog } = fresh([make('p'), make('other', 'personal', { name: '面紙', unit: '盒', catalogId: null })])
      const before = JSON.stringify(items.items)
      assert.equal(catalog.updateCatalogItem('preset:tissues', { name: ' 面紙 ' }).error.code, 'SPACE_NAME_TAKEN')
      assert.equal(catalog.getById('preset:tissues').name, '衛生紙')
      assert.equal(catalog.updateCatalogItem('preset:tissues', { unit: '箱' }).error.code, 'UNIT_CHANGE_CONFIRMATION_REQUIRED')
      assert.equal(JSON.stringify(items.items), before)
    })
    await t.test('deleting a custom option preserves linked space data and cannot reconnect a recreated name', () => {
      const custom = { id: 'custom-one', name: '衛生紙', category: '生活日用品', unit: '包', createdAt: '2026-01-01T00:00:00Z' }
      // 避免與預設撞名，改用真正自訂名稱。
      custom.name = '特製紙巾'
      const { items, catalog } = fresh([make('p', 'personal', { name: custom.name })], { ...baseCatalog, catalogItems: [custom] })
      const before = JSON.stringify(items.items)
      assert.equal(catalog.removeCatalogItem(custom.id).ok, true)
      assert.equal(JSON.stringify(items.items), before)
      const replacement = catalog.addCatalogItem({ name: custom.name, category: custom.category, unit: custom.unit })
      assert.notEqual(replacement.id, custom.id)
      assert.equal(items.getItem('p').catalogId, custom.id)
      assert.equal(items.ensureCatalogItem('personal', replacement.id).error.code, 'SPACE_NAME_TAKEN')
      items.addItem({ id: 'legacy', spaceId: 'family', name: custom.name, category: custom.category, unit: custom.unit })
      assert.equal(items.migrateCatalogAssociations().ok, true)
      assert.equal(items.getItem('legacy').catalogId, null)
    })
    await t.test('a mid-write failure rolls both keys back; failed recovery blocks mixed loads until retry', () => {
      let { items, catalog } = fresh()
      let failures = 1
      install('localStorage', { ...storage, setItem(k, value) { if (k === key('items') && failures-- > 0) throw new Error('quota'); storage.setItem(k, value) } })
      assert.equal(catalog.updateCatalogItem('preset:tissues', { name: '面紙' }).ok, false)
      assert.equal(catalog.getById('preset:tissues').name, '衛生紙')
      assert.equal(items.getItem('p').name, '衛生紙')
      assert.equal(memory.has(key('catalog-integration')), false)
      ;({ items, catalog } = fresh())
      install('localStorage', { ...storage, setItem(k, value) { if (k === key('items')) throw new Error('still blocked'); storage.setItem(k, value) } })
      assert.equal(catalog.updateCatalogItem('preset:tissues', { name: '面紙' }).error.code, 'RECOVERY_REQUIRED')
      assert.equal(catalog.getById('preset:tissues').name, '衛生紙')
      assert.throws(() => loadPersisted('catalog'), { code: 'RECOVERY_REQUIRED' })
      install('localStorage', storage)
      assert.equal(loadPersisted('catalog').presetOverrides['preset:tissues'], undefined)
      assert.equal(memory.has(key('catalog-integration')), false)
    })
    await t.test('startup restores prepared journals and completes committed journals before loading', () => {
      fresh()
      const before = { catalog: encode(baseCatalog), items: encode(itemData([make('p')])) }
      const after = { catalog: encode({ ...baseCatalog, presetOverrides: { 'preset:tissues': { name: '面紙' } } }), items: encode(itemData([make('p', 'personal', { name: '面紙', catalogId: 'preset:tissues' })])) }
      for (const state of ['prepared', 'committed']) {
        memory.set(key('catalog'), after.catalog)
        memory.set(key('items'), before.items)
        memory.set(key('catalog-integration'), encode({ state, before, after }))
        const expected = state === 'prepared' ? '衛生紙' : '面紙'
        pinia()
        assert.equal(useCatalogStore().getById('preset:tissues').name, expected)
        assert.equal(useItemsStore().getItem('p').name, expected)
        assert.equal(memory.has(key('catalog-integration')), false)
      }
    })
    await t.test('journal preparation and commit-marker failures return errors without partial metadata changes', () => {
      for (const failAt of [1, 2]) {
        const { items, catalog } = fresh()
        let writes = 0
        install('localStorage', { ...storage, setItem(k, value) {
          if (k === key('catalog-integration') && ++writes === failAt) throw new Error('journal blocked')
          storage.setItem(k, value)
        } })
        const result = catalog.updateCatalogItem('preset:tissues', { name: '面紙' })
        assert.equal(result.ok, false)
        assert.equal(result.error.code, 'STORAGE_FAILED')
        assert.equal(catalog.getById('preset:tissues').name, '衛生紙')
        assert.equal(items.getItem('p').name, '衛生紙')
        install('localStorage', storage)
        assert.equal(memory.has(key('catalog-integration')), false)
      }
    })
    await t.test('category deletion removes global options atomically but preserves linked space items and history', async () => {
      const customs = Array.from({ length: 5 }, (_, index) => ({ id: `baby-${index}`, name: `嬰兒用品${index}`, category: '嬰幼兒用品', unit: '包', createdAt: '2026-01-01T00:00:00Z' }))
      const { items, catalog } = fresh([make('existing', 'family', { name: customs[0].name, category: '嬰幼兒用品', catalogId: customs[0].id })], { ...baseCatalog, catalogItems: customs })
      items.addCategory('嬰幼兒用品')
      const before = JSON.stringify(items.items)
      const records = items.getItem('existing').restockRecords
      const result = catalog.removeCustomCategory('嬰幼兒用品')
      assert.equal(result.ok, true)
      assert.equal(result.removedIds.length, 5)
      assert.equal(catalog.allItems.filter(item => item.category === '嬰幼兒用品').length, 0)
      assert.equal(catalog.deletedCatalogItems.length, 5)
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(items.getItem('existing').restockRecords, records)
      assert.equal(items.categoryOptions.includes('嬰幼兒用品'), false)
      assert.equal(catalog.justAddedId, null)
      assert.equal(JSON.parse(memory.get(key('items'))).data.customCategories.includes('嬰幼兒用品'), false)
      assert.ok(JSON.parse(memory.get(key('catalog'))).data.deletedCategories.includes('嬰幼兒用品'))
      // 重建 Store 模擬重整；舊空間用品不使已刪分類再次出現。
      await nextTick()
      window.dispatchEvent(new Event('pagehide'))
      pinia()
      const reloaded = useItemsStore()
      assert.equal(reloaded.categoryOptions.includes('嬰幼兒用品'), false)
      assert.equal(reloaded.getItem('existing').catalogId, customs[0].id)
      assert.equal(reloaded.getItem('existing').restockRecords.length, 1)
      assert.equal(reloaded.addCategory('嬰幼兒用品').ok, true)
      assert.ok(reloaded.categoryOptions.includes('嬰幼兒用品'))
      const newItem = useCatalogStore().addCatalogItem({ name: customs[0].name, category: '嬰幼兒用品', unit: '包' })
      assert.notEqual(newItem.id, customs[0].id)
      assert.equal(reloaded.getItem('existing').catalogId, customs[0].id)
    })
    await t.test('empty custom category can be deleted; system or preset-containing categories are protected', () => {
      const { items, catalog } = fresh()
      assert.equal(items.addCategory('空分類').ok, true)
      assert.equal(catalog.removeCustomCategory('空分類').ok, true)
      assert.equal(items.categoryOptions.includes('空分類'), false)
      assert.equal(catalog.removeCustomCategory('生活日用品').error.code, 'INVALID_INPUT')
      assert.equal(catalog.removeCustomCategory('不存在').error.code, 'NOT_FOUND')
      items.addCategory('預設保護')
      assert.equal(catalog.updateCatalogItem('preset:tissues', { category: '預設保護' }).ok, true)
      assert.equal(catalog.removeCustomCategory('預設保護').error.code, 'PRESET_DELETE_FORBIDDEN')
      assert.equal(catalog.getById('preset:tissues').category, '預設保護')
      assert.ok(items.categoryOptions.includes('預設保護'))
    })
    await t.test('category transaction storage failure changes neither catalog nor categories', () => {
      const custom = { id: 'category-fail', name: '嬰兒用品', category: '嬰幼兒用品', unit: '包', createdAt: '2026-01-01T00:00:00Z' }
      const { items, catalog } = fresh([], { ...baseCatalog, catalogItems: [custom] })
      items.addCategory('嬰幼兒用品')
      let rejected = false
      install('localStorage', { ...storage, setItem(name, value) {
        if (name === key('items') && !rejected) { rejected = true; throw new Error('quota') }
        storage.setItem(name, value)
      } })
      const result = catalog.removeCustomCategory('嬰幼兒用品')
      assert.equal(result.ok, false)
      assert.equal(result.error.code, 'STORAGE_FAILED')
      assert.ok(items.categoryOptions.includes('嬰幼兒用品'))
      assert.ok(catalog.getById(custom.id))
      assert.equal(catalog.deletedCategories.includes('嬰幼兒用品'), false)
      assert.equal(catalog.deletedCatalogItems.length, 0)
      assert.ok(JSON.parse(memory.get(key('catalog'))).data.catalogItems.some(item => item.id === custom.id))
      assert.ok(JSON.parse(memory.get(key('items'))).data.customCategories.includes('嬰幼兒用品'))
    })
    await t.test('category undo restores original IDs, settings and order without overwriting later edits', () => {
      const custom = (id, category, extra = {}) => ({ id, name: id, category, unit: '包', iconKey: 'tissues', iconManual: true, iconPhoto: 'data:image/jpeg;base64,test', createdAt: '2026-01-01T00:00:00Z', ...extra })
      const originals = [custom('first', '玩具'), custom('other', '其他'), custom('last', '玩具')]
      const { items, catalog } = fresh([make('linked', 'family', { name: 'first', category: '玩具', catalogId: 'first' })], { ...baseCatalog, catalogItems: originals })
      items.addCategory('其他')
      items.addCategory('玩具')
      items.addCategory('下一個')
      const categoriesBefore = [...items.customCategories]
      const spaceBefore = JSON.stringify(items.items)
      const deleted = catalog.removeCustomCategory('玩具')
      assert.equal(deleted.ok, true)
      assert.equal(catalog.updateCatalogItem('other', { name: '其他已改名' }).ok, true)
      const added = catalog.addCatalogItem({ name: '新建用品', category: '其他', unit: '個' })
      assert.equal(deleted.undo().ok, true)
      assert.deepEqual(items.customCategories, categoriesBefore)
      assert.equal(JSON.stringify(items.items), spaceBefore)
      assert.equal(catalog.getById('other').name, '其他已改名')
      assert.deepEqual(catalog.catalogItems.map(item => item.id), [added.id, 'first', 'other', 'last'])
      for (const original of [originals[0], originals[2]]) assert.deepEqual(JSON.parse(JSON.stringify(catalog.getById(original.id))), original)
      assert.equal(catalog.deletedCategories.includes('玩具'), false)
      assert.equal(catalog.deletedCatalogItems.some(item => ['first','last'].includes(item.id)), false)
      assert.equal(deleted.undo().error.code, 'UNDO_UNAVAILABLE')
      const stored = JSON.parse(memory.get(key('catalog'))).data
      assert.deepEqual(stored.catalogItems.find(item => item.id === 'first'), originals[0])
      assert.deepEqual(JSON.parse(memory.get(key('items'))).data.customCategories, categoriesBefore)
    })
    await t.test('empty category undo works; recreating same category or item blocks overwrite', () => {
      const { items, catalog } = fresh()
      items.addCategory('空分類')
      const empty = catalog.removeCustomCategory('空分類')
      assert.equal(empty.undo().ok, true)
      assert.ok(items.categoryOptions.includes('空分類'))
      const duplicateCategory = catalog.removeCustomCategory('空分類')
      items.addCategory('空分類')
      assert.equal(duplicateCategory.undo().error.code, 'CATEGORY_NAME_TAKEN')
      items.addCategory('玩具')
      const original = catalog.addCatalogItem({ name: '玩具車', category: '玩具', unit: '個' })
      const deleted = catalog.removeCustomCategory('玩具')
      const replacement = catalog.addCatalogItem({ name: '玩具車', category: '生活日用品', unit: '個' })
      assert.equal(deleted.undo().error.code, 'NAME_TAKEN')
      assert.equal(catalog.getById(original.id), null)
      assert.ok(catalog.getById(replacement.id))
      assert.equal(items.categoryOptions.includes('玩具'), false)
    })
    await t.test('failed category undo rolls back both stores and can retry safely', () => {
      const { items, catalog } = fresh()
      items.addCategory('玩具')
      const original = catalog.addCatalogItem({ name: '玩具車', category: '玩具', unit: '個' })
      const deleted = catalog.removeCustomCategory('玩具')
      let failed = false
      install('localStorage', { ...storage, setItem(name, value) {
        if (name === key('items') && !failed) { failed = true; throw new Error('quota') }
        storage.setItem(name, value)
      } })
      assert.equal(deleted.undo().error.code, 'STORAGE_FAILED')
      assert.equal(catalog.getById(original.id), null)
      assert.equal(items.categoryOptions.includes('玩具'), false)
      assert.equal(JSON.parse(memory.get(key('catalog'))).data.catalogItems.some(item => item.id === original.id), false)
      assert.equal(JSON.parse(memory.get(key('items'))).data.customCategories.includes('玩具'), false)
      assert.equal(deleted.undo().ok, true)
      assert.equal(catalog.getById(original.id).id, original.id)
      assert.ok(items.categoryOptions.includes('玩具'))
    })
    await t.test('selected catalog deletion is atomic and retains space items', () => {
      const { catalog, items } = fresh()
      const first = catalog.addCatalogItem({ name: '玩具甲', category: '玩具', unit: '個' })
      const second = catalog.addCatalogItem({ name: '玩具乙', category: '玩具', unit: '個' })
      items.ensureCatalogItem('personal', first.id)
      const before = JSON.stringify(items.items)
      assert.equal(catalog.removeCatalogItems([first.id, 'preset:tissues']).ok, false)
      assert.ok(catalog.getById(first.id))
      assert.equal(catalog.removeCatalogItems([first.id, 'missing']).ok, false)
      assert.ok(catalog.getById(first.id))
      const deletion = catalog.removeCatalogItems([first.id, second.id])
      assert.equal(deletion.ok, true)
      assert.equal(catalog.getById(first.id), null)
      assert.equal(catalog.getById(second.id), null)
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(deletion.undo().ok, true)
      assert.deepEqual(catalog.getById(first.id), first)
      assert.deepEqual(catalog.getById(second.id), second)
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(deletion.undo().ok, false)
    })
    await t.test('category deletion/undo and confirmed unit changes preserve each other after integration', () => {
      const { catalog, items } = fresh()
      items.addCategory('整合測試')
      const added = catalog.addCatalogItem({ name: '週期用品', category: '整合測試', unit: '盒' })
      const linked = items.ensureCatalogItem('personal', added.id)
      assert.equal(linked.ok, true)
      const linkedId = linked.item.id
      const periodBefore = items.getItem(linkedId).unitPeriodId
      const update = catalog.updateCatalogItem(added.id, { unit: '箱', category: '清潔' }, { confirmUnitChange: true, expectedUnit: '盒' })
      assert.equal(update.ok, true)
      const changed = items.getItem(linkedId)
      assert.equal(changed.unit, '箱')
      assert.equal(changed.category, '清潔')
      assert.notEqual(changed.unitPeriodId, periodBefore)
      const periodAfter = changed.unitPeriodId
      const deletion = catalog.removeCustomCategory('整合測試')
      assert.equal(deletion.ok, true)
      assert.equal(deletion.undo().ok, true)
      assert.equal(items.getItem(linkedId).unitPeriodId, periodAfter)
      assert.equal(catalog.getById(added.id).unit, '箱')
      assert.equal(catalog.deletedCategories.includes('整合測試'), false)
    })
    await t.test('editor confirmation is cancellable, reports multi-space impact and retains drafts on failure', async () => {
      const { catalog, items } = fresh()
      const props = reactive({ open: false, item: { ...catalog.getById('preset:tissues') } })
      const { default: component } = await server.ssrLoadModule(filename)
      const scope = effectScope(); scopes.push(scope)
      let closed = 0
      const editor = scope.run(() => component.setup(props, { expose() {}, emit(event) { if (event === 'close') closed++ } }))
      props.open = true
      await nextTick(); await nextTick()
      assert.equal(editor.linkedSpaceCount.value, 2)
      editor.chooseUnit('箱')
      const before = JSON.stringify(items.items)
      editor.save()
      assert.equal(JSON.stringify(items.items), before)
      editor.cancelUnitChange()
      assert.equal(JSON.stringify(items.items), before)
      editor.save()
      let fail = true
      install('localStorage', { ...storage, setItem(k, value) { if (k === key('items') && fail) { fail = false; throw new Error('full') } storage.setItem(k, value) } })
      editor.confirmUnitChange()
      assert.equal(closed, 0)
      assert.equal(editor.unit.value, '箱')
      assert.ok(editor.operationError.value)
      assert.equal(editor.saveFailureToast.value.variant, 'error')
      assert.ok(editor.confirmedChanges.value)
      assert.equal(JSON.stringify(items.items), before)
      install('localStorage', storage)
      editor.confirmUnitChange()
      assert.equal(closed, 1)
      assert.ok(items.items.every(item => item.unit === '箱'))
      assert.notEqual(items.items[0].unitPeriodId, items.items[1].unitPeriodId)
    })
    await t.test('editor saves unit changes only after confirmation', async () => {
      const { catalog, items } = fresh()
      const custom = catalog.addCatalogItem({ name: '自訂紙巾', category: '生活日用品', unit: '包' })
      items.ensureCatalogItem('personal', custom.id)
      const props = reactive({ open: false, item: { ...custom } })
      const { default: component } = await server.ssrLoadModule(filename)
      const scope = effectScope(); scopes.push(scope)
      const editor = scope.run(() => component.setup(props, { expose() {}, emit() {} }))
      editor.deleteDialog.value = { close() {} }
      props.open = true
      await nextTick(); await nextTick()
      assert.equal(editor.canSave.value, true)
      const originalIcon = editor.iconKey.value
      editor.draft.value.name = ''
      assert.equal(editor.iconKey.value, originalIcon)
      editor.draft.value.name = '另一個名稱'
      assert.equal(editor.iconKey.value, originalIcon)
      editor.restoreDefaults()
      assert.equal(editor.draft.value.name, custom.name)
      assert.equal(editor.iconKey.value, custom.iconKey)
      assert.equal(catalog.getById(custom.id).name, custom.name)
      assert.equal(editor.unitOptions.addUnit('盒').ok, true)
      editor.deleteUnitDialog.value = { showModal() {}, close() {} }
      editor.editingUnits.value = true
      editor.requestUnitDeletion('盒')
      editor.confirmUnitDeletion()
      assert.equal(editor.unitOptions.customUnits.includes('盒'), false)
      assert.equal(editor.unit.value, '包')
      editor.undoUnitRemoval()
      assert.equal(editor.unitOptions.customUnits.includes('盒'), true)
      editor.editingUnits.value = false
      editor.chooseUnit('箱')
      assert.equal(editor.canSave.value, true)
      editor.save()
      assert.equal(catalog.getById(custom.id).unit, '包')
      editor.cancelUnitChange()
      assert.equal(catalog.getById(custom.id).unit, '包')
      editor.save()
      editor.confirmUnitChange()
      assert.equal(catalog.getById(custom.id).unit, '箱')
      props.item = { ...catalog.getById(custom.id) }
      editor.chooseUnit('箱')
      editor.draft.value.name = '新的紙巾'
      editor.save()
      assert.equal(catalog.getById(custom.id).name, '新的紙巾')
      assert.equal(items.getItemByCatalogId('personal', custom.id).name, '新的紙巾')
      editor.remove()
      assert.equal(catalog.getById(custom.id), null)
      assert.ok(items.getItemByCatalogId('personal', custom.id))
    })
  } finally {
    install('localStorage', storage)
    window.dispatchEvent(new Event('pagehide'))
    for (const scope of scopes) scope.stop()
    for (const p of piniaInstances) for (const store of p._s.values()) store.$dispose()
    for (const timer of timers) clearTimeout(timer)
    await server.close()
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
})
