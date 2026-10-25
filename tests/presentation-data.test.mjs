import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'
import { PRESENTATION_KEYS, PRESENTATION_PREFIX as prefix, PRESENTATION_JOURNAL, PRESENTATION_BACKUP, presentationSnapshot, commitPresentationTransaction, recoverPresentationTransaction } from '../src/utils/presentationTransaction.js'
import { withPresentationExclusive, holdPresentationAccess } from '../src/utils/presentationAccess.js'
import { DEMO_PREVIEW_ORIGIN, DEMO_PRODUCTION_ORIGIN } from '../src/utils/notificationDemoMode.js'
const memory = () => {
  const map = new Map()
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
}
const raw = value => JSON.stringify({ version: 2, data: value })
const snapshot = value => Object.fromEntries(PRESENTATION_KEYS.map(key => [key, key === 'catalog-integration' ? null : raw({ marker: value })]))

test('presentation transaction commits all keys, resets settings and keeps an exact backup', () => {
  const storage = memory(), before = snapshot('old'), after = snapshot('new')
  for (const [key, value] of Object.entries(before)) if (value) storage.setItem(prefix + key, value)
  commitPresentationTransaction(storage, after)
  assert.deepEqual(presentationSnapshot(storage), after)
  assert.deepEqual(JSON.parse(storage.getItem(PRESENTATION_BACKUP)).before, before)
  assert.equal(storage.getItem(prefix + 'notifications'), after.notifications)
  assert.equal(storage.getItem(prefix + 'profile'), after.profile)
  assert.equal(storage.getItem(PRESENTATION_JOURNAL), null)
})
for (const failKey of [PRESENTATION_BACKUP, PRESENTATION_JOURNAL, prefix + 'catalog', prefix + 'native-notifications']) {
  test(`failure at ${failKey} leaves original complete snapshot`, () => {
    const storage = memory(), before = snapshot('old')
    for (const [key, value] of Object.entries(before)) if (value) storage.setItem(prefix + key, value)
    const write = storage.setItem; let failed = false
    storage.setItem = (key, value) => { if (!failed && key === failKey) { failed = true; throw new Error('quota') } write(key, value) }
    assert.throws(() => commitPresentationTransaction(storage, snapshot('new')))
    assert.deepEqual(presentationSnapshot(storage), before)
  })
}
for (const state of ['prepared', 'committed']) test(`crash recovery: ${state}`, () => {
  const storage = memory(), before = snapshot('old'), after = snapshot('new')
  storage.setItem(prefix + 'items', after.items)
  storage.setItem(PRESENTATION_JOURNAL, JSON.stringify({ version: 1, state, before, after }))
  recoverPresentationTransaction(storage)
  assert.deepEqual(presentationSnapshot(storage), state === 'prepared' ? before : after)
})
test('persistent rollback failure keeps journal and can recover after storage is restored', () => {
  const storage = memory(), before = snapshot('old'), write = storage.setItem
  for (const [key, value] of Object.entries(before)) if (value) write(prefix + key, value)
  storage.setItem = (key, value) => { if (key === prefix + 'catalog') throw new Error('blocked'); write(key, value) }
  assert.throws(() => commitPresentationTransaction(storage, snapshot('new')), /中斷/)
  assert.ok(storage.getItem(PRESENTATION_JOURNAL))
  storage.setItem = write; recoverPresentationTransaction(storage)
  assert.deepEqual(presentationSnapshot(storage), before)
})
test('commit-marker failure rolls back; malformed journal blocks loading', () => {
  const storage = memory(), before = snapshot('old'), write = storage.setItem
  for (const [key, value] of Object.entries(before)) if (value) write(prefix + key, value)
  storage.setItem = (key, value) => { if (key === PRESENTATION_JOURNAL && JSON.parse(value).state === 'committed') throw new Error('quota'); write(key, value) }
  assert.throws(() => commitPresentationTransaction(storage, snapshot('new')))
  assert.deepEqual(presentationSnapshot(storage), before)
  write(PRESENTATION_JOURNAL, '{')
  assert.throws(() => recoverPresentationTransaction(storage))
})
test('exclusive setup refuses unknown origins, unsupported and busy browsers', async () => {
  let invoked = false
  for (const origin of ['https://unknown.vercel.app']) await assert.rejects(withPresentationExclusive(() => { invoked = true }, { location: { origin }, navigator: {} }))
  await assert.rejects(withPresentationExclusive(() => {}, { location: { origin: DEMO_PREVIEW_ORIGIN }, navigator: {} }), /不支援/)
  await assert.rejects(withPresentationExclusive(() => { invoked = true }, { location: { origin: DEMO_PREVIEW_ORIGIN }, navigator: { locks: { request: (_name, _options, callback) => callback(null) } } }), /關閉/)
  assert.equal(invoked, false)
})

test('Preview app keeps its shared lock until pagehide and reloads stale BFCache pages', async () => {
  const listeners = {}, calls = []; let mounted = false, released = false
  const env = { location: { origin: DEMO_PREVIEW_ORIGIN, reload: () => calls.push('reload') },
    addEventListener: (type, callback) => { listeners[type] = callback },
    navigator: { locks: { request: async (_name, options, callback) => { calls.push(options.mode); await callback({}); released = true } } } }
  const lifetime = holdPresentationAccess(async () => { mounted = true }, env)
  await Promise.resolve(); assert.equal(mounted, true); assert.equal(released, false)
  assert.deepEqual(calls, ['shared'])
  listeners.pagehide(); await lifetime; assert.equal(released, true)
  listeners.pageshow({ persisted: true }); assert.deepEqual(calls, ['shared', 'reload'])
})

test('six-item presentation uses real state calculations, model fields and safe reset snapshots', async t => {
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const realTimeout = globalThis.setTimeout, timers = []
  globalThis.setTimeout = (...args) => { const timer = realTimeout(...args); if (args[1] > 1000) { timer.unref(); timers.push(timer) } return timer }
  const storage = memory()
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  try {
    const model = await server.ssrLoadModule('/src/models/item.js')
    const { currentUnitRecords } = await server.ssrLoadModule('/src/utils/unitPeriods.js')
    const setup = await server.ssrLoadModule('/src/utils/presentationSetup.js')
    const today = '2026-10-21', state = model.createPresentationState(today)
    const get = name => state.items.find(item => item.name === name)
    await t.test('three spaces including empty private travel, six items, one other member Huahua and no bulb', () => {
      assert.equal(state.items.length, 6); assert.deepEqual(state.spaces.map(s => s.name), ['個人', '家庭', '旅行'])
      const travel = state.spaces[2]
      assert.equal(travel.shared, false)
      assert.equal(travel.ownerId, 'self')
      assert.deepEqual(travel.members, [])
      assert.equal(state.items.some(item => item.spaceId === travel.id), false)
      const nextTravel = model.createPresentationState(today).spaces.find(space => space.name === '旅行')
      assert.ok(nextTravel)
      assert.notEqual(nextTravel.id, travel.id)
      const resetItems = JSON.parse(setup.newPresentationSnapshot(today).items).data
      assert.equal(resetItems.spaces.some(space => space.name === '旅行'), true)
      const family = state.spaces[1]
      assert.deepEqual(family.members.map(m => m.name), ['花花']); assert.notEqual(family.members[0].id, 'self')
      assert.equal(get('垃圾袋').shoppingClaimantId, family.members[0].id)
      assert.equal(get('酒精').shoppingClaimantId, null)
      assert.equal(get('酒精').inShoppingList, false)
      assert.equal(get('酒精').addedToShoppingListDate, null)
      assert.equal(get('燈泡'), undefined)
      for (const name of ['衛生紙', '洗衣精', '衛生棉', '狗狗糧食']) assert.equal(get(name).spaceId, 'personal')
      for (const name of ['酒精', '垃圾袋']) assert.equal(get(name).spaceId, family.id)
    })
    await t.test('due tissues, exactly one laundry record, list-only pads and unlabelled dog food at all supported thresholds', () => {
      for (const threshold of [1, 5, 20]) {
        const marks = name => model.getStatusMarks(model.getReminderStatus(get(name), today, threshold), get(name).inShoppingList)
        assert.equal(model.getReminderStatus(get('衛生紙'), today, threshold), model.STATUS.OVERDUE)
        assert.equal(get('衛生紙').inShoppingList, false)
        assert.equal(marks('衛生棉').pill, model.STATUS.IN_SHOPPING_LIST)
        assert.deepEqual(marks('狗狗糧食'), { pill: null, showListMark: false })
      }
      assert.equal(get('洗衣精').restockRecords.length, 1)
      assert.equal(model.getNextRestockDate(get('洗衣精')), null)
      assert.equal(get('洗衣精').reminderEnabled, true)
      assert.equal(get('洗衣精').inShoppingList, false)
    })
    await t.test('units, catalog IDs, record snapshots, clean completion and snooze fields', () => {
      assert.deepEqual(state.items.map(i => i.unit), ['袋', '瓶', '包', '包', '瓶', '包'])
      assert.equal(get('衛生棉').category, '個人護理')
      for (const item of state.items) {
        assert.equal(item.reminderEnabled, true)
        assert.equal(item.catalogId, 'preset:' + item.iconKey)
        assert.equal(currentUnitRecords(item).length, item.restockRecords.length)
        assert.equal(item.shoppingCompletedAt, null); assert.equal(item.shoppingCompletedBy, null)
        assert.deepEqual(item.reminderSnoozes, {}); assert.deepEqual(item.reminderSnoozeOperationIds, {})
        if (item.inShoppingList) { assert.ok(item.quantity > 0); assert.equal(item.addedToShoppingListDate, today) }
      }
    })
    await t.test('data-only fixture contract stays exact across month, year and leap-day boundaries', async () => {
      const { PRESET_ITEMS } = await server.ssrLoadModule('/src/models/itemCategories.js')
      const expected = [
        ['衛生紙', '生活日用品', '袋', 'tissues'],
        ['洗衣精', '洗衣', '瓶', 'laundry-detergent'],
        ['衛生棉', '個人護理', '包', 'sanitary-pads'],
        ['狗狗糧食', '寵物用品', '包', 'dog-food'],
        ['酒精', '清潔', '瓶', 'rubbing-alcohol'],
        ['垃圾袋', '生活日用品', '包', 'trash-bags'],
      ]
      for (const date of ['2026-01-01', '2026-03-01', '2028-02-29', '2026-12-31']) {
        const fixture = setup.newPresentationSnapshot(date)
        const data = JSON.parse(fixture.items).data
        const catalog = JSON.parse(fixture.catalog).data
        assert.deepEqual(data.items.map(i => [i.name, i.category, i.unit, i.iconKey]), expected)
        assert.equal(new Set(data.spaces.map(space => space.id)).size, 3)
        assert.equal(new Set(data.items.map(item => item.id)).size, 6)
        const recordIds = data.items.flatMap(item => item.restockRecords.map(record => record.id))
        assert.equal(new Set(recordIds).size, recordIds.length)
        for (const item of data.items) {
          const preset = PRESET_ITEMS.find(entry => 'preset:' + entry.iconKey === item.catalogId)
          assert.ok(preset)
          const linked = { ...preset, ...catalog.presetOverrides[item.catalogId] }
          assert.deepEqual([linked.name, linked.category, linked.unit, linked.iconKey], [item.name, item.category, item.unit, item.iconKey])
          assert.equal(new Set(item.restockRecords.map(record => record.date)).size, item.restockRecords.length)
          assert.ok(item.restockRecords.every(record => record.date <= date))
          assert.equal(currentUnitRecords(item).length, item.restockRecords.length)
        }
        const get = name => data.items.find(item => item.name === name)
        for (let threshold = 1; threshold <= 20; threshold++) {
          const marks = name => model.getStatusMarks(model.getReminderStatus(get(name), date, threshold), get(name).inShoppingList)
          assert.equal(marks('衛生紙').pill, model.STATUS.OVERDUE)
          assert.deepEqual(marks('洗衣精'), { pill: null, showListMark: false })
          assert.equal(marks('衛生棉').pill, model.STATUS.IN_SHOPPING_LIST)
          assert.deepEqual(marks('狗狗糧食'), { pill: null, showListMark: false })
        }
        assert.deepEqual(data.items.filter(item => item.inShoppingList).map(item => item.name), ['衛生棉', '垃圾袋'])
        assert.equal(get('酒精').shoppingClaimantId, null)
      assert.equal(get('酒精').inShoppingList, false)
      assert.equal(get('酒精').addedToShoppingListDate, null)
        assert.equal(get('垃圾袋').shoppingClaimantId, data.spaces[1].members[0].id)
        assert.notEqual(get('垃圾袋').shoppingClaimantId, 'self')
        assert.deepEqual(JSON.parse(fixture['native-notifications']).data.tasks, [])
        assert.equal(JSON.parse(fixture['shared-notifications']).data.records.length, 3)
      }
    })
    await t.test('new runs never reuse item/record/period/space IDs; old notification resolves missing', async () => {
      const next = model.createPresentationState(today)
      for (const key of ['id', 'unitPeriodId']) assert.ok(next.items.every(item => !state.items.some(old => old[key] === item[key])))
      const oldRecordIds = new Set(state.items.flatMap(i => i.restockRecords.map(r => r.id)))
      assert.ok(next.items.every(i => i.restockRecords.every(r => !oldRecordIds.has(r.id))))
      assert.notEqual(next.spaces[1].id, state.spaces[1].id)
      const { resolveShoppingNotification } = await server.ssrLoadModule('/src/utils/shoppingNotificationTarget.js')
      const oldId = state.items[0].id
      const result = resolveShoppingNotification(next.items.find(i => i.id === oldId), next.spaces[0], '', true)
      assert.equal(result.ok, false)
    })
    await t.test('explicit setup removes old tasks/references while preserving browser settings', async () => {
      const locks = { request: (_name, options, callback) => typeof options === 'function' ? options({}) : callback({}) }
      const session = memory(); session.setItem('bubu:notification-demo-session:v1', 'old')
      storage.setItem(prefix + 'notifications', raw({ pushEnabled: false, restockDays: 12 }))
      storage.setItem(prefix + 'profile', raw({ name: '測試暱稱', email: 'test@example.com', avatar: 'data:image/png;base64,test' }))
      storage.setItem(prefix + 'native-notifications', raw({ tasks: [{ id: 'old', state: 'scheduled', itemId: 'old-item' }] }))
      storage.setItem(prefix + 'items', raw(state))
      const env = { location: { origin: DEMO_PRODUCTION_ORIGIN }, navigator: { locks }, localStorage: storage, sessionStorage: session }
      await assert.rejects(setup.applyPresentationSetup({}, env), /確認/)
      const staleSnapshot = presentationSnapshot(storage)
      storage.setItem(prefix + 'items', raw({ ...state, presentationRunId: 'another-reset' }))
      await assert.rejects(setup.applyPresentationSetup({ confirmed: true, expectedSnapshot: staleSnapshot }, env), /資料已更新/)
      storage.setItem(prefix + 'items', raw(state))
      await setup.applyPresentationSetup({ confirmed: true, expectedSnapshot: presentationSnapshot(storage) }, env)
      assert.deepEqual(JSON.parse(storage.getItem(prefix + 'native-notifications')).data.tasks, [])
      assert.equal(JSON.parse(storage.getItem(prefix + 'shared-notifications')).data.records.length, 3)
      assert.equal(JSON.parse(storage.getItem(prefix + 'notifications')).data.pushEnabled, true)
      assert.deepEqual(JSON.parse(storage.getItem(prefix + 'profile')).data, { name: 'bubu1028', email: 'bubu1028@gmail.com', avatar: '' })
      assert.equal(session.getItem('bubu:notification-demo-session:v1'), null)
      assert.equal(JSON.parse(storage.getItem(prefix + 'catalog')).data.presetOverrides['preset:tissues'].unit, '袋')
      await setup.applyPresentationSetup({ confirmed: true, restore: true, expectedSnapshot: presentationSnapshot(storage) }, env)
      assert.deepEqual(JSON.parse(storage.getItem(prefix + 'items')).data, state)
      assert.equal(JSON.parse(storage.getItem(prefix + 'profile')).data.name, '測試暱稱')
      assert.deepEqual(JSON.parse(storage.getItem(prefix + 'notifications')).data, { pushEnabled: false, restockDays: 12 })
      assert.deepEqual(JSON.parse(storage.getItem(prefix + 'native-notifications')).data.tasks, [])
    })
    for (const occupied of ['bubu-native-reminders', 'bubu-items-write']) await t.test(`reset refuses occupied inner lock ${occupied} without any writes`, async () => {
      const before = [...storage.map.entries()]
      const locks = { request: (name, options, callback) => {
        assert.equal(options.ifAvailable, true)
        return callback(name === occupied ? null : {})
      } }
      const env = { location: { origin: DEMO_PREVIEW_ORIGIN }, navigator: { locks }, localStorage: storage, sessionStorage: memory() }
      await assert.rejects(setup.applyPresentationSetup({ confirmed: true, expectedSnapshot: presentationSnapshot(storage) }, env))
      assert.deepEqual([...storage.map.entries()], before)
    })
    await t.test('automatic backup failure preserves data, settings, session and prior backup', async () => {
      const before = [...storage.map.entries()], write = storage.setItem
      const session = memory(); session.setItem('bubu:notification-demo-session:v1', 'keep-session')
      const locks = { request: (_name, _options, callback) => callback({}) }
      const env = { location: { origin: DEMO_PRODUCTION_ORIGIN }, navigator: { locks }, localStorage: storage, sessionStorage: session }
      storage.setItem = (key, value) => { if (key === PRESENTATION_BACKUP) throw new Error('backup quota'); write(key, value) }
      try { await assert.rejects(setup.applyPresentationSetup({ confirmed: true, expectedSnapshot: presentationSnapshot(storage) }, env), /backup quota/) }
      finally { storage.setItem = write }
      assert.deepEqual([...storage.map.entries()], before)
      assert.equal(session.getItem('bubu:notification-demo-session:v1'), 'keep-session')
    })
    await t.test('unknown origins refuse the actual reset API with valid confirmed snapshots', async () => {
      const before = [...storage.map.entries()]
      for (const origin of ['https://unknown.vercel.app']) {
        const env = { location: { origin }, navigator: { locks: { request() { throw new Error('must not request locks') } } }, localStorage: storage }
        await assert.rejects(setup.applyPresentationSetup({ confirmed: true, expectedSnapshot: presentationSnapshot(storage) }, env))
      }
      assert.deepEqual([...storage.map.entries()], before)
    })
    await t.test('three historical notifications use spec copy and current item/member IDs without scheduling OS jobs', async () => {
      const snapshot = setup.newPresentationSnapshot(today), initial = JSON.parse(snapshot.items).data
      const notifications = JSON.parse(snapshot['shared-notifications']).data
      assert.deepEqual(notifications.records.map(record => record.message), ['「個人」的衛生紙該補貨了', '「個人」的衛生棉是否已購買？', '花花已認領「家庭」的垃圾袋。'])
      assert.equal(initial.spaces[1].shared, true)
      for (const record of notifications.records) {
        assert.equal(record.source, 'demo'); assert.equal(record.previewOnly, true)
        assert.deepEqual(record.recipientIds, ['self'])
        assert.equal(initial.items.find(item => item.id === record.itemIds[0]).spaceId, record.spaceId)
      }
      assert.equal(notifications.records[2].actorId, initial.spaces[1].members[0].id)
      const { notificationDestination } = await server.ssrLoadModule('/src/utils/notificationNavigation.js')
      const lookup = { getItem: id => initial.items.find(item => item.id === id), getSpace: id => initial.spaces.find(space => space.id === id) }
      assert.deepEqual(notificationDestination(notifications.records[1], lookup).route, { name: 'shopping', query: { tab: 'personal' } })
      assert.equal(notifications.processedEventIds.length, 1)
      assert.deepEqual(JSON.parse(snapshot['native-notifications']).data.tasks, [])
    })
    await t.test('fresh store persists once and reload keeps IDs and Huahua without inserting alcohol', async () => {
      storage.map.clear()
      const pinia = createPinia(); setActivePinia(pinia)
      const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
      const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
      const items = useItemsStore(), ids = items.items.map(i => i.id)
      assert.equal(items.items.length, 6)
      assert.equal(useCatalogStore().getById('preset:tissues').unit, '袋')
      const { useSharedNotificationsStore } = await server.ssrLoadModule('/src/stores/sharedNotifications.js')
      const notices = useSharedNotificationsStore(); notices.publishRestockReminders(); assert.equal(notices.records.length, 3)
      assert.equal((await items.flushPersistence()).ok, true)
      pinia._e.stop()
      const second = createPinia(); setActivePinia(second)
      const loaded = useItemsStore()
      assert.deepEqual(loaded.items.map(i => i.id), ids)
      assert.equal(loaded.items.filter(i => i.name === '酒精').length, 1)
      assert.deepEqual(loaded.spaces[1].members.map(m => m.name), ['花花'])
      assert.equal(loaded.spaces[1].shared, true)
      useSharedNotificationsStore().publishRestockReminders(); assert.equal(useSharedNotificationsStore().records.length, 3)
      second._e.stop()
    })
  } finally {
    await server.close()
    timers.forEach(clearTimeout); globalThis.setTimeout = realTimeout
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage
  }
})

for (const state of ['prepared', 'committed']) test(`legacy journal ${state} preserves unrecorded profile/settings`, () => {
  const storage = memory(), before = snapshot('old'), after = snapshot('new')
  for (const key of ['profile', 'notifications']) { delete before[key]; delete after[key]; storage.setItem(prefix + key, 'keep') }
  storage.setItem(PRESENTATION_JOURNAL, JSON.stringify({ version: 1, state, before, after }))
  recoverPresentationTransaction(storage)
  assert.equal(storage.getItem(prefix + 'profile'), 'keep')
  assert.equal(storage.getItem(prefix + 'notifications'), 'keep')
  assert.equal(storage.getItem(prefix + 'items'), (state === 'prepared' ? before : after).items)
})
