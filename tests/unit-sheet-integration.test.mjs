import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick, reactive, createSSRApp } from 'vue'

// 直接驗證頁面 setup 的資料與導覽契約；不模擬照片裁切或手機鍵盤。
test('shared unit options and unit-period Sheet integration', async t => {
  const originals = new Map(['localStorage', 'window', 'setInterval', 'setTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const originalSetInterval = globalThis.setInterval
  globalThis.setInterval = (...args) => { const timer = originalSetInterval(...args); timer.unref(); return timer }
  const originalSetTimeout = globalThis.setTimeout
  const longTimers = []
  globalThis.setTimeout = (...args) => { const timer = originalSetTimeout(...args); if (args[1] > 1000) { timer.unref(); longTimers.push(timer) } return timer }
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { history: { state: { back: '/settings/items/清潔' } } } })
  const route = reactive({ params: { category: '清潔' }, query: { from: 'item-management', category: '清潔' } })
  const router = { backCalls: 0, back() { this.backCalls++ }, replace() {}, push() {} }
  const guards = []
  globalThis.__settingsCatalogRouter = { useRoute: () => route, useRouter: () => router, onBeforeRouteLeave: guard => guards.push(guard) }
  const scopes = []
  const piniaInstances = []
  const freshPinia = () => { const p = createPinia(); piniaInstances.push(p); setActivePinia(p); return p }
  freshPinia()
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
  const setup = async (file, props = {}, options = {}) => {
    const path = `${process.cwd()}/${file}`.replace(/([^/]+)\.vue$/, '__settings_test_$1.js')
    const { default: component } = await server.ssrLoadModule(path)
    const scope = effectScope()
    scopes.push(scope)
    const warn = console.warn
    console.warn = () => {}
    try {
      const app = createSSRApp({})
      if (options.appToast) app.provide('appToast', options.appToast)
      return app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit: options.emit || (() => {}) })))
    }
    finally { console.warn = warn }
  }
  try {
    const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
    const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
    const { useUnitOptionsStore } = await server.ssrLoadModule('/src/stores/unitOptions.js')
    const { createItem, getNextRestockDate } = await server.ssrLoadModule('/src/models/item.js')
    const { STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const key = name => `home-restock:v1:${name}`
    const fresh = () => {
      storage.clear()
      storage.set(key('items'), JSON.stringify({ version: STORAGE_VERSION, data: {
        items: ['personal', 'family'].map((spaceId, index) => createItem({ id: `linked-${index}`, spaceId, catalogId: 'preset:tissues',
          name: '衛生紙', category: '生活日用品', unit: '包', restockRecords: [{ id: `r-${index}`, date: '2026-01-01', quantity: 1 }] })),
        spaces: [{ id: 'personal', name: '個人' }, { id: 'family', name: '家庭', shared: true }],
        customCategories: [], departedSpaces: [], demoSeeds: ['family-unclaimed-alcohol-v1'],
      } }))
      freshPinia()
      return { items: useItemsStore(), catalog: useCatalogStore(), units: useUnitOptionsStore() }
    }
    const openEditor = async (catalog, options = {}) => {
      const props = reactive({ open: false, item: { ...catalog.getById('preset:tissues') } })
      const editor = await setup('src/components/settings/GlobalItemEditor.vue', props, options)
      props.open = true
      await nextTick(); await nextTick()
      return { editor, props }
    }
    await t.test('custom unit completion persists, auto-selects and survives cancellation of AddItem', async () => {
      const { units, catalog } = fresh()
      const before = JSON.stringify(catalog.allItems)
      const add = await setup('src/views/AddItemView.vue')
      await add.selectUnit('custom')
      add.customUnit.value = '盒'
      add.finishCustomUnit()
      assert.equal(add.unit.value, '盒')
      assert.equal(add.openPanel.value, null)
      assert.deepEqual([...units.customUnits], ['盒'])
      assert.deepEqual(JSON.parse(storage.get(key('unit-options'))).data.customUnits, ['盒'])
      add.discardDialog.value = { close() {} }
      add.discard()
      assert.deepEqual([...units.customUnits], ['盒'])
      assert.equal(JSON.stringify(catalog.allItems), before)
      freshPinia()
      assert.deepEqual([...useUnitOptionsStore().customUnits], ['盒'])
      const nextAdd = await setup('src/views/AddItemView.vue')
      await nextAdd.selectUnit('盒')
      assert.equal(nextAdd.unit.value, '盒')
    })
    await t.test('editor custom unit completion and cancel never modify item units, history or periods', async () => {
      const { units, items, catalog } = fresh()
      const before = JSON.stringify(items.items)
      const { editor, props } = await openEditor(catalog)
      editor.chooseUnit('custom')
      editor.customUnit.value = '箱'
      assert.equal(editor.canFinishUnit.value, true)
      editor.finishCustomUnit()
      assert.equal(editor.unit.value, '箱')
      assert.deepEqual([...units.customUnits], ['箱'])
      assert.equal(JSON.stringify(items.items), before)
      editor.save()
      assert.deepEqual(editor.confirmedChanges.value, { oldUnit: '包', newUnit: '箱' })
      editor.cancelUnitChange()
      props.open = false
      await nextTick()
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(catalog.getById('preset:tissues').unit, '包')
      freshPinia()
      assert.deepEqual([...useUnitOptionsStore().customUnits], ['箱'])
    })
    await t.test('only confirmed saving creates independent periods; options and periods survive reload', async () => {
      const { units, items, catalog } = fresh()
      const before = items.items.map(item => ({ id: item.id, period: item.unitPeriodId, records: JSON.stringify(item.restockRecords) }))
      const { editor } = await openEditor(catalog)
      editor.chooseUnit('custom'); editor.customUnit.value = '盒'; editor.finishCustomUnit()
      editor.save()
      assert.equal(editor.linkedSpaceCount.value, 2)
      assert.deepEqual(items.items.map(item => item.unitPeriodId), before.map(item => item.period))
      editor.confirmUnitChange()
      assert.equal(catalog.getById('preset:tissues').unit, '盒')
      assert.equal(new Set(items.items.map(item => item.unitPeriodId)).size, 2)
      for (const old of before) {
        const item = items.getItem(old.id)
        assert.notEqual(item.unitPeriodId, old.period)
        assert.equal(JSON.stringify(item.restockRecords), old.records)
        assert.equal(getNextRestockDate(item), null)
      }
      const periods = items.items.map(item => item.unitPeriodId)
      freshPinia()
      assert.deepEqual([...useUnitOptionsStore().customUnits], ['盒'])
      assert.deepEqual(useItemsStore().items.map(item => item.unitPeriodId), periods)
      assert.equal(useCatalogStore().getById('preset:tissues').unit, '盒')
    })
    await t.test('deleting a common unit only removes the option; editing selected legacy unit and Undo remain safe', async () => {
      const { units, items, catalog } = fresh()
      units.addUnit('盒')
      catalog.updateCatalogItem('preset:tissues', { unit: '盒' }, { confirmUnitChange: true })
      const before = JSON.stringify(items.items)
      const globalBefore = JSON.stringify(catalog.allItems)
      const { editor } = await openEditor(catalog)
      editor.deleteUnitDialog.value = { showModal() {}, close() {} }
      editor.editingUnits.value = true
      editor.requestUnitDeletion('盒')
      editor.confirmUnitDeletion()
      assert.equal(units.customUnits.includes('盒'), false)
      assert.equal(editor.unit.value, '盒')
      assert.equal(editor.unitChanged.value, false)
      assert.equal(editor.unitToast.value.message, '已刪除「盒」單位')
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(JSON.stringify(catalog.allItems), globalBefore)
      editor.undoUnitRemoval()
      assert.equal(units.customUnits.includes('盒'), true)
      assert.equal(JSON.stringify(items.items), before)
      const add = await setup('src/views/AddItemView.vue')
      await add.selectUnit('盒')
      add.editingUnits.value = true
      assert.equal(add.removeCustomUnit('盒').ok, true)
      assert.equal(add.unit.value, '')
      assert.equal(JSON.stringify(items.items), before)
      assert.equal(JSON.stringify(catalog.allItems), globalBefore)
    })
    await t.test('saving name/category metadata never starts a new unit period', async () => {
      const { items, catalog } = fresh()
      const periods = items.items.map(item => item.unitPeriodId)
      const records = items.items.map(item => JSON.stringify(item.restockRecords))
      const { editor } = await openEditor(catalog)
      editor.draft.value.name = '新名稱'
      const icon = editor.iconKey.value
      editor.draft.value.name = ''
      assert.equal(editor.iconKey.value, icon)
      editor.draft.value.name = '抽取紙巾'
      editor.chooseCategory('清潔')
      editor.save()
      assert.equal(editor.confirmedChanges.value, null)
      assert.deepEqual(items.items.map(item => item.unitPeriodId), periods)
      assert.deepEqual(items.items.map(item => JSON.stringify(item.restockRecords)), records)
      assert.ok(items.items.every(item => item.category === '清潔'))
    })
    await t.test('success Toast appears only on committed saves; cancellation and failure never announce success', async () => {
      const { units, items, catalog } = fresh()
      units.addUnit('箱')
      const messages = []
      let closed = 0
      const options = { appToast: { showToast: message => messages.push(message) }, emit: event => { if (event === 'close') closed++ } }
      const periods = items.items.map(item => item.unitPeriodId)
      const { editor } = await openEditor(catalog, options)
      editor.draft.value.name = '抽取式衛生紙'
      editor.save()
      assert.deepEqual(messages, ['已成功儲存編輯'])
      assert.equal(closed, 1)
      assert.equal(editor.confirmedChanges.value, null)
      assert.deepEqual(items.items.map(item => item.unitPeriodId), periods)
      const { editor: next, props } = await openEditor(catalog, options)
      next.chooseUnit('箱')
      next.save()
      next.cancelUnitChange()
      props.open = false
      await nextTick()
      assert.deepEqual(messages, ['已成功儲存編輯'])
      assert.deepEqual(items.items.map(item => item.unitPeriodId), periods)
      props.open = true
      await nextTick(); await nextTick()
      next.chooseUnit('箱')
      next.save()
      const originalSet = localStorage.setItem
      localStorage.setItem = (key, value) => { if (key === 'home-restock:v1:catalog-integration') throw new Error('storage full'); return originalSet(key, value) }
      try { next.confirmUnitChange() } finally { localStorage.setItem = originalSet }
      assert.equal(next.saveFailureToast.value.variant, 'error')
      assert.ok(next.operationError.value)
      assert.ok(next.confirmedChanges.value)
      assert.equal(closed, 1)
      assert.deepEqual(messages, ['已成功儲存編輯'])
      assert.deepEqual(items.items.map(item => item.unitPeriodId), periods)
      next.confirmUnitChange()
      assert.equal(closed, 2)
      assert.deepEqual(messages, ['已成功儲存編輯', '已成功儲存編輯'])
      assert.ok(items.items.every(item => item.unit === '箱'))
    })
    await t.test('unit deletion Undo rejects case-insensitive collisions without overwriting the replacement', async () => {
      const { useUnitOptionsStore } = await server.ssrLoadModule('/src/stores/unitOptions.js')
      const units = useUnitOptionsStore()
      assert.equal(units.addUnit('Box').ok, true)
      const removed = units.removeUnit(' Box ')
      assert.equal(removed.ok, true)
      assert.equal(units.addUnit('box').ok, true)
      const restored = removed.undo()
      assert.equal(restored.ok, false)
      assert.equal(restored.code, 'NAME_TAKEN')
      assert.equal(units.customUnits.filter(value => value.toLowerCase() === 'box').length, 1)
      assert.ok(units.customUnits.includes('box'))
      assert.equal(units.customUnits.includes('Box'), false)
    })
    await t.test('both forms reject preset/custom duplicate and overlength units', async () => {
      const { units, catalog } = fresh()
      units.addUnit('盒')
      const { editor } = await openEditor(catalog)
      const add = await setup('src/views/AddItemView.vue')
      for (const name of ['包', '盒', '超長自訂單位']) {
        editor.chooseUnit('custom'); editor.customUnit.value = name
        assert.equal(editor.canFinishUnit.value, false)
        editor.finishCustomUnit()
        await add.selectUnit('custom'); add.customUnit.value = name
        assert.equal(add.canFinishUnit.value, false)
        add.finishCustomUnit()
      }
      assert.deepEqual([...units.customUnits], ['盒'])
    })
  } finally {
    for (const scope of scopes) scope.stop()
    for (const p of piniaInstances) for (const store of p._s.values()) store.$dispose()
    for (const timer of longTimers) clearTimeout(timer)
    await server.close()
    delete globalThis.__settingsCatalogRouter
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
