import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, effectScope, reactive } from 'vue'
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
      assert.equal(catalog.updateCatalogItem('preset:tissues', { unit: '箱' }).error.code, 'UNIT_CHANGE_NOT_SUPPORTED')
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
    await t.test('editor can save metadata/delete but blocks unit changes', async () => {
      const { catalog, items } = fresh()
      const custom = catalog.addCatalogItem({ name: '自訂紙巾', category: '生活日用品', unit: '包' })
      items.ensureCatalogItem('personal', custom.id)
      const props = reactive({ open: false, item: { ...custom } })
      const { default: component } = await server.ssrLoadModule(filename)
      const scope = effectScope(); scopes.push(scope)
      const editor = scope.run(() => component.setup(props, { expose() {}, emit() {} }))
      editor.dialog.value = { open: false, showModal() { this.open = true }, close() {} }
      editor.deleteDialog.value = { close() {} }
      props.open = true
      await nextTick(); await nextTick()
      assert.equal(editor.canSave.value, true)
      editor.chooseUnit('箱')
      assert.equal(editor.canSave.value, false)
      editor.save()
      assert.equal(catalog.getById(custom.id).unit, '包')
      editor.chooseUnit('包')
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
