import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick, reactive, createSSRApp } from 'vue'

// 直接驗證頁面 setup 的資料與導覽契約；不模擬照片裁切或手機鍵盤。
test('settings global catalog integration', async t => {
  const originals = new Map(['localStorage', 'window', 'setInterval', 'setTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const originalSetInterval = globalThis.setInterval
  globalThis.setInterval = (...args) => { const timer = originalSetInterval(...args); timer.unref(); return timer }
  const originalSetTimeout = globalThis.setTimeout
  const longTimers = []
  globalThis.setTimeout = (...args) => { const timer = originalSetTimeout(...args); if (args[1] > 1000) { timer.unref(); longTimers.push(timer) } return timer }
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { history: { state: { back: '/settings/items/清潔' } } } })
  const route = reactive({ params: { category: '清潔' }, query: { from: 'item-management', category: '清潔' } })
  const router = { backCalls: 0, back() { this.backCalls++ }, replace() {}, push() {} }
  const guards = []
  globalThis.__settingsCatalogRouter = { useRoute: () => route, useRouter: () => router, onBeforeRouteLeave: guard => guards.push(guard) }
  const scopes = []
  const pinia = createPinia()
  setActivePinia(pinia)
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, plugins: [{
    name: 'settings-script-test',
    resolveId(id) { if (id.includes('__settings_test_')) return id },
    load(id) {
      if (!id.includes('__settings_test_')) return
      const filename = id.replace('__settings_test_', '').replace(/\.js$/, '.vue')
      const script = compileScript(parse(readFileSync(filename, 'utf8')).descriptor, { id: 'settings-test' }).content
      return script.replace(/import \{ ([^}]+) \} from 'vue-router'/g, 'const { $1 } = globalThis.__settingsCatalogRouter')
        .replace(/import (\w+) from '[^']+\.vue'/g, 'const $1 = {}')
    },
  }] })
  let items, catalog
  const setup = async (file, props = {}) => {
    const path = `${process.cwd()}/${file}`.replace(/([^/]+)\.vue$/, '__settings_test_$1.js')
    const { default: component } = await server.ssrLoadModule(path)
    const scope = effectScope()
    scopes.push(scope)
    const warn = console.warn
    console.warn = () => {}
    try { return scope.run(() => component.setup(props, { expose() {}, emit() {} })) }
    finally { console.warn = warn }
  }
  try {
    const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
    const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
    items = useItemsStore()
    catalog = useCatalogStore()
    const beforeItems = JSON.stringify(items.items)
    const helpers = await server.ssrLoadModule('/src/components/settings/globalItemPreview.js')
    let categoryPage, management
    await t.test('counts use all ten presets and custom catalog items, not space items', async () => {
      items.addCategory('文具')
      management = await setup('src/views/SettingsItemsView.vue')
      categoryPage = await setup('src/views/SettingsItemCategory.vue')
      assert.equal(management.systemCounts.value.reduce((n, category) => n + category.count, 0), 10)
      assert.equal(management.customCounts.value.find(category => category.name === '文具').count, 0)
      assert.equal(categoryPage.items.value.length, 2)
      const custom = catalog.addCatalogItem({ name: '桌面清潔劑', category: '清潔', unit: '瓶' })
      assert.ok(categoryPage.items.value.some(item => item.id === custom.id))
      assert.equal(management.systemCounts.value.find(category => category.name === '清潔').count, 3)
      assert.equal(helpers.isOtherCatalogNameTaken(catalog.allItems, ' 桌面清潔劑 ', custom.id), false)
      assert.equal(helpers.isOtherCatalogNameTaken(catalog.allItems, ' 衛生紙 ', custom.id), true)
    })
    await t.test('management source preselects category and consumes justAddedId', async () => {
      const add = await setup('src/views/AddItemView.vue')
      assert.equal(add.category.value, '清潔')
      assert.equal(add.isDirty.value, false)
      add.name.value = '消毒噴霧'
      add.selectCategory('文具')
      await add.selectUnit('瓶')
      await add.createItem()
      assert.equal(router.backCalls, 1)
      assert.equal(catalog.justAddedId, null)
      assert.equal(catalog.allItems[0].category, '文具')
      assert.ok(!categoryPage.items.value.some(item => item.name === '消毒噴霧'))
      route.params.category = '文具'
      assert.ok(categoryPage.items.value.some(item => item.name === '消毒噴霧'))
      assert.equal(management.customCounts.value.find(category => category.name === '文具').count, 1)
    })
    await t.test('restock source still leaves justAddedId for its caller', async () => {
      route.query = {}
      const add = await setup('src/views/AddItemView.vue')
      assert.equal(add.category.value, null)
      add.name.value = '測試用品'
      add.selectCategory('清潔')
      await add.selectUnit('個')
      await add.createItem()
      assert.equal(catalog.justAddedId, catalog.allItems[0].id)
      assert.equal(router.backCalls, 2)
    })
    await t.test('editor preserves ID, excludes itself from duplicates and never mutates catalog', async () => {
      const item = catalog.getById('preset:tissues')
      const props = reactive({ open: false, item })
      const editor = await setup('src/components/settings/GlobalItemEditor.vue', props)
      editor.dialog.value = { open: false, showModal() { this.open = true }, close() { this.open = false } }
      const before = JSON.stringify(catalog.allItems)
      props.open = true
      await nextTick(); await nextTick()
      assert.equal(editor.draft.value.id, item.id)
      assert.equal(editor.isPreset.value, true)
      assert.equal(editor.duplicate.value, false)
      editor.draft.value.name = '酒精'
      assert.equal(editor.duplicate.value, true)
      editor.chooseUnit('custom')
      editor.customUnit.value = '箱'
      assert.equal(editor.unit.value, '箱')
      editor.chooseCategory('文具')
      editor.selectIcon('dish-soap')
      assert.equal(editor.iconKey.value, 'dish-soap')
      assert.equal(JSON.stringify(catalog.allItems), before)
      props.open = false
      await nextTick()
      assert.equal(editor.dialog.value.open, false)
    })
    await t.test('unit history hint distinguishes unknown, no history and known history', async () => {
      const props = reactive({ oldUnit: '包', newUnit: '包', hasHistory: null })
      const hint = await setup('src/components/settings/UnitChangeHint.vue', props)
      assert.equal(hint.changed.value, false)
      props.newUnit = '箱'
      assert.equal(hint.changed.value, true)
      const { renderToString } = await import('vue/server-renderer')
      const template = parse(readFileSync('src/components/settings/UnitChangeHint.vue', 'utf8')).descriptor.template.content
      // 使用 Vue SSR 的編譯模板驗證三種可見文案狀態。
      const { compile } = await import('@vue/compiler-ssr')
      const compiled = compile(template)
      const { createRequire } = await import('node:module')
      const require = createRequire(import.meta.url)
      const ssrRender = new Function('require', compiled.code)(require)
      const render = data => renderToString(createSSRApp({ setup: () => data, ssrRender }))
      assert.match(await render({ changed: true, oldUnit: '包', newUnit: '箱', hasHistory: true }), /舊紀錄保留『包』，改用『箱』後重新推算補貨時間。/)
      assert.match(await render({ changed: true, oldUnit: '包', newUnit: '箱', hasHistory: null }), /判斷尚未串接/)
      assert.doesNotMatch(await render({ changed: true, oldUnit: '包', newUnit: '箱', hasHistory: false }), /舊紀錄|尚未串接/)
      assert.doesNotMatch(await render({ changed: false, oldUnit: '包', newUnit: '包', hasHistory: true }), /舊紀錄/)
    })
    await t.test('category deletion stays disabled; editor writes are gated and no unsolicited space changes', () => {
      assert.equal(JSON.stringify(items.items), beforeItems)
      const editor = readFileSync('src/components/settings/GlobalItemEditor.vue', 'utf8')
      assert.match(editor, /type="submit"[^>]*disabled/)
      assert.doesNotMatch(editor, /emit\('preview'|applyItemPreview|addCatalogItem|itemsStore\.removeItem/)
      assert.match(editor, /:disabled="!canSave"/)
      const categories = readFileSync('src/views/SettingsItemsView.vue', 'utf8')
      assert.doesNotMatch(categories, /removeCategories\(|deleteCategories\(/)
      assert.match(categories, /disabled>刪除（尚未開放）/)
      const page = readFileSync('src/views/SettingsItemCategory.vue', 'utf8')
      assert.match(page, /name: 'add-item'/)
      assert.doesNotMatch(page, /SpaceTag|item-detail|removeItem|previewItems/)
    })
  } finally {
    for (const scope of scopes) scope.stop()
    for (const store of pinia._s.values()) store.$dispose()
    for (const timer of longTimers) clearTimeout(timer)
    // 清理測試載入的既有午夜更新時計，不改動實際 Store。
    await server.close()
    delete globalThis.__settingsCatalogRouter
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
