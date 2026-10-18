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
  let query = {}
  globalThis.__addItemCatalogRouter = { useRouter: () => router, useRoute: () => ({ query }), onBeforeRouteLeave: fn => { guard = fn } }
  const filename = `${process.cwd()}/src/views/__additem_catalog_test.js`
  const source = readFileSync('src/views/AddItemView.vue', 'utf8')
  const script = compileScript(parse(source).descriptor, { id: 'additem-test' }).content
    .replace(/import \{ ([^}]+) \} from 'vue-router'/, 'const { $1 } = globalThis.__addItemCatalogRouter')
    .replace(/import (\w+) from '[^']+\.vue'/g, 'const $1 = {}')
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
    const { useUnitOptionsStore } = await server.ssrLoadModule('/src/stores/unitOptions.js')
    const items = useItemsStore()
    const catalog = useCatalogStore()
    const spaceItemsBefore = JSON.stringify(items.items)
    const setup = (routeQuery = {}) => {
      query = routeQuery
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
      assert.equal(form.duplicateName.value, false, 'successful creation must not flash a duplicate-name warning during navigation')
      assert.equal(guard({ fullPath: '/restock/new' }), true)
      await form.createItem()
      assert.equal(catalog.catalogItems.length, count + 1)
      assert.equal(JSON.stringify(items.items), spaceItemsBefore)
    })
    await t.test('both entry sources share initial fields, validation and controls', async () => {
      for (const from of [undefined, 'item-management']) {
        const form = setup({ ...(from ? { from } : {}), category: '清潔' })
        assert.equal(form.name.value, '')
        assert.equal(form.category.value, '清潔')
        assert.equal(form.unit.value, '')
        assert.equal(form.isDirty.value, false)
        assert.equal(guard({ fullPath: '/previous' }), true)
        await form.createItem()
        assert.deepEqual(Object.keys(form.errors.value), ['name', 'unit'])
        assert.equal(form.openPanel.value, null)
        form.name.value = from ? '管理測試刷' : '補貨測試刷'
        await form.createItem()
        assert.equal(form.openPanel.value, 'unit')
        form.selectCategory('廚房')
        assert.equal(form.category.value, '廚房')
        await form.selectUnit('個')
        const count = router.backCalls
        await form.createItem()
        assert.equal(router.backCalls, count + 1)
        assert.equal(catalog.justAddedId, from ? null : catalog.catalogItems[0].id)
      }
      for (const category of ['全部', '不存在']) assert.equal(setup({ category }).category.value, null)
      const template = source.slice(source.indexOf('<template>'), source.indexOf('<style'))
      assert.doesNotMatch(template, /fromItemManagement|route\.query/)
      assert.match(template, /selector-value--placeholder/)
      assert.match(template, /field-hint/)
    })
    await t.test('custom category uses settings store, validates and persists without creating a space item', async () => {
      const form = setup()
      const beforeItems = JSON.stringify(items.items)
      const beforeCatalog = catalog.catalogItems.length
      form.customCategoryName.value = ''
      form.finishCustomCategory()
      assert.equal(form.customCategoryError.value, '')
      assert.equal(form.canFinishCategory.value, false)
      form.customCategoryName.value = '清潔'
      form.finishCustomCategory()
      assert.equal(form.customCategoryError.value, '已有重複分類名稱')
      form.customCategoryName.value = '分類名稱超過八個中文字'
      assert.equal(form.customCategoryLimitExceeded.value, true)
      form.finishCustomCategory()
      assert.ok(!items.categoryOptions.includes(form.customCategoryName.value))
      form.customCategoryName.value = '1234567890123456'
      assert.equal(form.customCategoryCount.value, '16/16')
      assert.equal(form.customCategoryLimitExceeded.value, false)
      form.customCategoryName.value = '園藝'
      assert.equal(form.customCategoryCount.value, '2/8')
      form.customCategoryName.value = ' 園藝 '
      form.addingCategory.value = true
      form.openPanel.value = 'category'
      form.finishCustomCategory()
      assert.equal(form.category.value, '園藝')
      assert.equal(form.openPanel.value, null)
      assert.equal(form.addingCategory.value, false)
      assert.equal(form.customCategoryName.value, '')
      assert.equal(items.customCategories.filter(name => name === '園藝').length, 1)
      assert.ok(items.categoryOptions.includes('園藝'))
      assert.ok(setup().itemsStore.categoryOptions.includes('園藝'))
      assert.equal(JSON.stringify(items.items), beforeItems)
      assert.equal(catalog.catalogItems.length, beforeCatalog)
      // 沿用真實 Store 的 debounce 保存，再讀取存檔確認重新載入可取得分類。
      await new Promise(resolve => setTimeout(resolve, 450))
      const saved = JSON.parse(storage.get('home-restock:v1:items')).data
      assert.ok(saved.customCategories.includes('園藝'))
      form.customCategoryName.value = '園藝'
      form.finishCustomCategory()
      assert.equal(items.customCategories.filter(name => name === '園藝').length, 1)
      assert.equal(form.customCategoryError.value, '已有重複分類名稱')
    })
    await t.test('custom unit options persist and deleting an option clears only the draft selection and preserves existing item units', async () => {
      const form = setup()
      await form.selectUnit('custom')
      form.customUnit.value = '盒'
      form.finishCustomUnit()
      assert.equal(form.unit.value, '盒')
      assert.ok(form.unitOptions.customUnits.includes('盒'))
      assert.ok(setup().unitOptions.customUnits.includes('盒'))
      assert.equal(form.unitOptions.addUnit(' 盒 ').ok, false)
      assert.equal(form.unitOptions.customUnits.filter(value => value === '盒').length, 1)
      assert.equal(form.unitOptions.addUnit('瓶').ok, false)
      assert.equal(form.unitOptions.customUnits.includes('瓶'), false)
      assert.equal(form.unitOptions.addUnit('超過四個字了').ok, false)
      const item = items.addItem({ name: '保留單位測試用品', category: '清潔', unit: '盒',
        restockRecords: [{ id: 'unit-record', date: '2026-01-01', quantity: 2 }] })
      const existing = JSON.stringify(item)
      const global = catalog.addCatalogItem({ name: '全域單位保留測試', category: '清潔', unit: '盒' })
      form.removeCustomUnit('盒')
      assert.equal(form.unitOptions.customUnits.includes('盒'), false)
      assert.equal(form.unit.value, '')
      assert.equal(JSON.stringify(item), existing)
      assert.equal(catalog.getById(global.id).unit, '盒')
      assert.equal(form.unitOptions.removeUnit('瓶').ok, false)
      form.unitOptions.addUnit('罐')
      form.unitOptions.$dispose()
      const reloaded = useUnitOptionsStore()
      assert.ok(reloaded.customUnits.includes('罐'))
      assert.equal(reloaded.customUnits.includes('盒'), false)
      assert.ok(JSON.parse(storage.get('home-restock:v1:unit-options')).data.customUnits.includes('罐'))
    })
    await t.test('custom unit storage failure does not pretend to add or delete options', () => {
      const options = useUnitOptionsStore()
      options.addUnit('袋')
      const before = [...options.customUnits]
      const original = globalThis.localStorage
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: original.getItem, setItem() { throw new Error('quota') },
      } })
      try {
        assert.equal(options.addUnit('箱').ok, false)
        assert.equal(options.removeUnit('袋').ok, false)
        assert.deepEqual([...options.customUnits], before)
      } finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original }) }
    })
    await t.test('editing units blocks selection and add; deletion toast restores option without reselecting the deleted draft unit', async () => {
      const form = setup()
      form.unitOptions.addUnit('盒')
      form.unitOptions.addUnit('箱')
      form.unitChoice.value = '盒'
      const beforeItems = JSON.stringify(items.items)
      const beforeCatalog = JSON.stringify(catalog.allItems)
      const beforeOptions = [...form.unitOptions.customUnits]
      form.editingUnits.value = true
      form.openPanel.value = 'unit'
      await form.selectUnit('瓶')
      assert.equal(form.unit.value, '盒')
      form.togglePanel('category')
      assert.equal(form.openPanel.value, 'unit')
      form.customUnit.value = '筒'
      form.finishCustomUnit()
      assert.equal(form.unitOptions.customUnits.includes('筒'), false)
      form.removeCustomUnit('盒')
      assert.equal(form.unitOptions.customUnits.includes('盒'), false)
      assert.equal(form.unit.value, '')
      assert.equal(form.unitToast.value.message, '已刪除「盒」單位')
      assert.equal(form.unitToast.value.actionLabel, '復原')
      form.undoUnitRemoval()
      assert.deepEqual([...form.unitOptions.customUnits], beforeOptions)
      assert.equal(form.unit.value, '')
      assert.equal(JSON.stringify(items.items), beforeItems)
      assert.equal(JSON.stringify(catalog.allItems), beforeCatalog)
      assert.equal(form.unitToast.value, null)
      form.editingUnits.value = false
      await form.selectUnit('瓶')
      assert.equal(form.unit.value, '瓶')
    })
    await t.test('unit undo preserves later options and refuses duplicate restore; failures keep storage unchanged', () => {
      const options = useUnitOptionsStore()
      options.addUnit('盒')
      const deletion = options.removeUnit('盒')
      options.addUnit('筒')
      assert.equal(deletion.undo().ok, true)
      assert.ok(options.customUnits.includes('筒'))
      assert.equal(deletion.undo().ok, false)
      const replaced = options.removeUnit('盒')
      options.addUnit('盒')
      assert.equal(replaced.undo().ok, false)
      assert.equal(options.customUnits.filter(value => value === '盒').length, 1)
      const failed = options.removeUnit('盒')
      const original = globalThis.localStorage
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: original.getItem, setItem() { throw new Error('quota') },
      } })
      try {
        assert.equal(failed.undo().ok, false)
        assert.equal(options.customUnits.includes('盒'), false)
      } finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original }) }
      assert.equal(failed.undo().ok, true)
    })
    await t.test('custom unit pill selects normally but only opens confirmation while editing', async () => {
      const form = setup()
      form.unitOptions.addUnit('盒')
      let open = false
      form.deleteUnitDialog.value = { showModal() { open = true }, close() { open = false } }
      form.openPanel.value = 'unit'
      await form.activateCustomUnit('盒')
      assert.equal(form.unit.value, '盒')
      assert.equal(open, false)
      form.editingUnits.value = true
      const beforeItems = JSON.stringify(items.items)
      const beforeCatalog = JSON.stringify(catalog.allItems)
      form.activateCustomUnit('盒')
      assert.equal(open, true)
      assert.equal(form.pendingUnitDeletion.value, '盒')
      assert.ok(form.unitOptions.customUnits.includes('盒'))
      assert.equal(form.unitToast.value, null)
      form.cancelUnitDeletion()
      assert.equal(open, false)
      assert.ok(form.unitOptions.customUnits.includes('盒'))
      form.activateCustomUnit('盒')
      form.confirmUnitDeletion()
      assert.equal(open, false)
      assert.equal(form.unitOptions.customUnits.includes('盒'), false)
      assert.equal(form.unit.value, '')
      assert.equal(form.unitToast.value.message, '已刪除「盒」單位')
      form.undoUnitRemoval()
      assert.ok(form.unitOptions.customUnits.includes('盒'))
      assert.equal(JSON.stringify(items.items), beforeItems)
      assert.equal(JSON.stringify(catalog.allItems), beforeCatalog)
    })
    await t.test('duplicate default/custom unit or category shows feedback and prevents adding', async () => {
      const form = setup()
      form.unitOptions.addUnit('盒')
      const unitsBefore = [...form.unitOptions.customUnits]
      for (const value of ['瓶', ' 盒 ']) {
        await form.selectUnit('custom')
        form.customUnit.value = value
        assert.equal(form.duplicateCustomUnit.value, true)
        assert.equal(form.unitOptionMessage.value, '此單位已經存在')
        form.finishCustomUnit()
        assert.equal(form.openPanel.value, 'unit')
        assert.deepEqual([...form.unitOptions.customUnits], unitsBefore)
        form.name.value = '單位撞名不能新增用品'
        form.selectCategory('清潔')
        const before = catalog.catalogItems.length
        await form.createItem()
        assert.equal(catalog.catalogItems.length, before)
      }
      for (const value of ['清潔', ' 園藝 ']) {
        form.customCategoryName.value = value
        assert.equal(form.duplicateCustomCategory.value, true)
        assert.equal(form.customCategoryMessage.value, '已有重複分類名稱')
        const count = items.customCategories.length
        form.finishCustomCategory()
        assert.equal(items.customCategories.length, count)
      }
      form.customUnit.value = '新單位'
      assert.equal(form.duplicateCustomUnit.value, false)
      form.unitOptions.addUnit('ML')
      assert.equal(form.unitOptions.addUnit(' ml ').ok, false)
    })
    await t.test('toast undo restores deleted option in UI store and persistent storage', () => {
      const form = setup()
      form.unitOptions.addUnit('盒')
      form.removeCustomUnit('盒')
      assert.equal(form.unitOptions.customUnits.includes('盒'), false)
      assert.equal(JSON.parse(storage.get('home-restock:v1:unit-options')).data.customUnits.includes('盒'), false)
      assert.equal(typeof form.unitToast.value.undo, 'function')
      form.undoUnitRemoval()
      assert.ok(form.unitOptions.customUnits.includes('盒'))
      assert.ok(JSON.parse(storage.get('home-restock:v1:unit-options')).data.customUnits.includes('盒'))
    })
    await t.test('complete controls require nonempty valid unique names without click-only length prompts', () => {
      const form = setup()
      assert.equal(form.canFinishCategory.value, false)
      assert.equal(form.canFinishUnit.value, false)
      form.finishCustomCategory()
      form.finishCustomUnit()
      assert.equal(form.customCategoryError.value, '')
      assert.equal(form.unitOptionError.value, '')
      form.customCategoryName.value = '有效新分類'
      form.customUnit.value = '有效'
      assert.equal(form.canFinishCategory.value, true)
      assert.equal(form.canFinishUnit.value, true)
      form.customCategoryName.value = '清潔'
      form.customUnit.value = '瓶'
      assert.equal(form.canFinishCategory.value, false)
      assert.equal(form.canFinishUnit.value, false)
      form.customCategoryName.value = '這個分類名稱已經超長'
      form.customUnit.value = '這是過長單位'
      assert.equal(form.canFinishCategory.value, false)
      assert.equal(form.canFinishUnit.value, false)
      form.customUnit.value = '有效'
      form.editingUnits.value = true
      assert.equal(form.canFinishUnit.value, false)
    })
    await t.test('overlength item names show space-name feedback and cannot be saved', async () => {
      const form = setup()
      form.selectCategory('清潔')
      await form.selectUnit('瓶')
      form.updateName({ target: { value: '一二三四五六七八九' }, isComposing: false })
      assert.equal(form.nameLimitExceeded.value, true)
      const before = catalog.catalogItems.length
      await form.createItem()
      assert.equal(form.errors.value.name, '名稱過長，請縮短。')
      assert.equal(catalog.catalogItems.length, before)
      form.updateName({ target: { value: '一二三四五六七八' }, isComposing: false })
      assert.equal(form.nameLimitExceeded.value, false)
      assert.equal(form.errors.value.name, undefined)
    })
    await t.test('custom unit overlength retains text and blocks completion and item creation', async () => {
      const form = setup()
      await form.selectUnit('custom')
      form.customUnit.value = '超過四個字的單位'
      assert.equal(form.customUnitLimitExceeded.value, true)
      assert.equal(form.unitOptionMessage.value, '名稱過長，請縮短。')
      assert.equal(form.customUnitCount.value, '8/4')
      assert.equal(form.canFinishUnit.value, false)
      form.finishCustomUnit()
      assert.equal(form.customUnit.value, '超過四個字的單位')
      form.name.value = '超長單位測試用品'
      form.selectCategory('清潔')
      const before = catalog.catalogItems.length
      await form.createItem()
      assert.equal(catalog.catalogItems.length, before)
      assert.equal(form.errors.value.unit, '名稱過長，請縮短。')
      form.customUnit.value = '小盒'
      assert.equal(form.customUnitLimitExceeded.value, false)
      assert.equal(form.canFinishUnit.value, true)
      assert.equal(form.unitOptionMessage.value, '')
    })
    await t.test('deleting another unit or a failed deletion does not clear the draft selection', () => {
      const form = setup()
      form.unitOptions.addUnit('盒')
      form.unitOptions.addUnit('箱')
      form.unitChoice.value = '盒'
      form.removeCustomUnit('箱')
      assert.equal(form.unit.value, '盒')
      const original = globalThis.localStorage
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: original.getItem, setItem() { throw new Error('quota') },
      } })
      try {
        assert.equal(form.removeCustomUnit('盒').ok, false)
        assert.equal(form.unit.value, '盒')
      } finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original }) }
      form.removeCustomUnit('盒')
      assert.equal(form.unitChoice.value, null)
      assert.equal(form.unit.value, '')
      form.undoUnitRemoval()
      assert.ok(form.unitOptions.customUnits.includes('盒'))
      assert.equal(form.unit.value, '')
    })
    await t.test('IME length handling and space-item writes remain isolated', () => {
      const form = setup()
      form.updateName({ target: { value: '12345678901234567890' }, isComposing: false })
      assert.equal(form.name.value, '12345678901234567890')
      assert.equal(form.nameLimitExceeded.value, true)
      const before = form.name.value
      form.updateName({ target: { value: '尚在組字' }, isComposing: true })
      assert.equal(form.name.value, before)
      assert.doesNotMatch(source, /generateId/)
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
