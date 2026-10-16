import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'

// 驗證第二階段表單契約；瀏覽器圖示裁切、鍵盤實機行為另行驗收。
test('AddItemView creates global catalog items', async t => {
  const originals = new Map(['localStorage', 'window', 'setTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { history: { state: { back: '/restock/new' } } } })
  const timers = []
  const originalSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (...args) => {
    const timer = originalSetTimeout(...args)
    if (args[1] > 1000) { timer.unref(); timers.push(timer) }
    return timer
  }
  const router = { backCalls: 0, back() { this.backCalls++ }, replace() {}, push() {} }
  let guard
  globalThis.__addItemCatalogRouter = { useRouter: () => router, onBeforeRouteLeave: fn => { guard = fn } }
  const filename = `${process.cwd()}/src/views/__additem_catalog_test.js`
  const source = readFileSync('src/views/AddItemView.vue', 'utf8')
  const script = compileScript(parse(source).descriptor, { id: 'additem-test' }).content
    .replace(/import \{ onBeforeRouteLeave, useRouter \} from 'vue-router'/, 'const { onBeforeRouteLeave, useRouter } = globalThis.__addItemCatalogRouter')
    .replace(/import ItemIconEditor from '[^']+'/, 'const ItemIconEditor = {}')
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, plugins: [{
    name: 'additem-script-test', resolveId(id) { if (id === filename) return id }, load(id) { if (id === filename) return script },
  }] })
  const pinia = createPinia()
  setActivePinia(pinia)
  const scopes = []
  try {
    const { default: component } = await server.ssrLoadModule(filename)
    const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
    const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
    const items = useItemsStore()
    const catalog = useCatalogStore()
    const spaceItemsBefore = JSON.stringify(items.items)
    const setup = () => {
      const scope = effectScope()
      scopes.push(scope)
      const warn = console.warn
      console.warn = () => {}
      try {
        const form = scope.run(() => component.setup({}, { expose() {} }))
        const input = { scrollIntoView() {}, focus() {}, matches: () => true }
        const row = { scrollIntoView() {}, matches: () => false, querySelector: () => input }
        form.nameField.value = input
        form.categoryField.value = row
        form.unitField.value = row
        form.customUnitField.value = input
        form.discardDialog.value = { open: false, showModal() { this.open = true }, close() { this.open = false } }
        return form
      } finally { console.warn = warn }
    }
    await t.test('initial fields are empty and missing fields become invalid in order', async () => {
      const form = setup()
      assert.equal(form.name.value, '')
      assert.equal(form.category.value, null)
      assert.equal(form.unit.value, '')
      assert.equal(form.isDirty.value, false)
      assert.equal(form.duplicateName.value, false)
      await form.createItem()
      assert.deepEqual(Object.keys(form.errors.value), ['name', 'category', 'unit'])
      form.name.value = '清潔刷'
      await form.createItem()
      assert.equal(form.openPanel.value, 'category')
      form.selectCategory('清潔')
      await form.createItem()
      assert.equal(form.openPanel.value, 'unit')
      assert.equal(catalog.catalogItems.length, 0)
    })
    await t.test('preset and custom duplicates use catalog validation and cannot save', async () => {
      catalog.addCatalogItem({ name: 'Coffee', category: '廚房', unit: '包' })
      const count = catalog.catalogItems.length
      const form = setup()
      for (const name of [' 衛生紙 ', ' COFFEE ']) {
        form.updateName({ target: { value: name }, isComposing: false })
        assert.equal(form.duplicateName.value, true)
        await form.createItem()
        assert.equal(catalog.catalogItems.length, count)
      }
      assert.match(source, /此用品已經存在/)
      assert.match(source, /:disabled="duplicateName \|\| submitting"/)
    })
    await t.test('automatic icons, manual icons and photos follow the existing rules', () => {
      const form = setup()
      form.name.value = '迷你酒精'
      assert.equal(form.iconKey.value, 'rubbing-alcohol')
      form.selectPresetIcon('tissues')
      form.name.value = '新的洗碗精'
      assert.equal(form.iconKey.value, 'tissues')
      form.applyIconPhoto('data:image/jpeg;base64,photo')
      form.name.value = '洗衣精'
      assert.equal(form.iconKey.value, 'tissues')
      assert.equal(form.iconPhoto.value, 'data:image/jpeg;base64,photo')
      assert.equal(form.iconManual.value, true)
    })
    await t.test('custom categories, exclusive panels and custom unit completion', async () => {
      items.addCategory('文具')
      const form = setup()
      assert.ok(form.itemsStore.categoryOptions.includes('文具'))
      form.togglePanel('category')
      form.togglePanel('unit')
      assert.equal(form.openPanel.value, 'unit')
      form.selectCategory('文具')
      assert.equal(form.openPanel.value, null)
      await form.selectUnit('custom')
      assert.equal(form.openPanel.value, 'unit')
      form.customUnit.value = '盒'
      form.finishCustomUnit()
      assert.equal(form.unit.value, '盒')
      assert.equal(form.openPanel.value, null)
    })
    await t.test('dirty form invokes discard guard; successful save returns and retains justAddedId', async () => {
      const form = setup()
      assert.equal(guard({ fullPath: '/inventory' }), true)
      form.name.value = '小白板'
      form.selectCategory('文具')
      await form.selectUnit('個')
      assert.equal(guard({ fullPath: '/inventory' }), false)
      assert.equal(form.discardDialog.value.open, true)
      form.discardDialog.value.close()
      const count = catalog.catalogItems.length
      await form.createItem()
      assert.equal(catalog.catalogItems.length, count + 1)
      assert.equal(router.backCalls, 1)
      assert.equal(catalog.justAddedId, catalog.catalogItems[0].id)
      assert.equal(catalog.catalogItems[0].name, '小白板')
      assert.equal(guard({ fullPath: '/restock/new' }), true)
      await form.createItem()
      assert.equal(catalog.catalogItems.length, count + 1)
      assert.equal(JSON.stringify(items.items), spaceItemsBefore)
    })
    await t.test('IME length handling and phase-two scope remain isolated', () => {
      const form = setup()
      form.updateName({ target: { value: '12345678901234567890' }, isComposing: false })
      assert.equal(form.name.value, '1234567890123456')
      const before = form.name.value
      form.updateName({ target: { value: '尚在組字' }, isComposing: true })
      assert.equal(form.name.value, before)
      assert.doesNotMatch(source, /fromItemManagement|initialCategory|clearJustAddedId|route\.query|generateId/)
      assert.doesNotMatch(source, /itemsStore\.(addItem|updateItem|removeItem)/)
      assert.match(source, /itemsStore.categoryOptions/)
      assert.match(source, /catalog.addCatalogItem/)
      assert.match(source, /ItemIconEditor/)
    })
  } finally {
    for (const scope of scopes) scope.stop()
    for (const store of pinia._s.values()) store.$dispose()
    for (const timer of timers) clearTimeout(timer)
    await server.close()
    delete globalThis.__addItemCatalogRouter
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
