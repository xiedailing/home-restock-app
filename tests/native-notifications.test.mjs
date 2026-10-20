import { notificationDemoEligibility } from '../src/utils/notificationDemoEligibility.js'
import { allowsNotificationDemo, demoLinkRequested, restoreDemoSession, DEMO_SESSION_KEY, DEMO_PREVIEW_ORIGIN, DEMO_PRODUCTION_ORIGIN } from '../src/utils/notificationDemoMode.js'
import { shoppingNotificationTarget, shoppingNotificationUrl, parseShoppingNotificationUrl, resolveShoppingNotification } from '../src/utils/shoppingNotificationTarget.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { setMaxListeners } from 'node:events'
import { createPinia, setActivePinia } from 'pinia'
import { reminderTime, reminderFingerprint, taskStillValid, syncReminderTasks } from '../src/utils/nativeReminderTasks.js'

const item = () => ({ id: 'a', spaceId: 'personal', inShoppingList: true, shoppingCompletedAt: null,
  unitPeriodId: 'p', restockRecords: [{ id: 'r', date: '2026-01-01', quantity: 1, unit: '包' }],
  reminderSnoozes: { self: '2099-01-02' }, reminderSnoozeOperationIds: { self: 'op1' } })
const space = { id: 'personal', shared: false }

test('demo eligibility distinguishes item state, saved date, queue and permission without mutations', () => {
  const source = item(), before = structuredClone(source)
  const check = overrides => notificationDemoEligibility({ item: source, space, ...overrides })
  assert.equal(check({}).ok, true)
  for (const [changes, code] of [
    [{ item: null }, 'missing'], [{ space: null }, 'inaccessible'], [{ accessible: false }, 'inaccessible'],
    [{ item: { ...source, inShoppingList: false } }, 'removed'],
    [{ item: { ...source, shoppingCompletedAt: 1 } }, 'completed'],
    [{ item: { ...source, reminderEnabled: false } }, 'reminder-off'],
    [{ item: { ...source, reminderSnoozes: {} } }, 'unsaved'],
    [{ pendingItemIds: ['a'] }, 'waiting-self'], [{ pendingItemIds: ['b'] }, 'waiting-other'],
    [{ permission: 'denied' }, 'permission'], [{ supported: false }, 'unsupported'],
    [{ pushEnabled: false }, 'push-off'], [{ locksAvailable: false }, 'locks'], [{ enabled: false }, 'disabled'],
  ]) assert.equal(check(changes).code, code)
  assert.equal(check({ pendingItemIds: ['b'] }).otherItemId, 'b')
  assert.match(check({ item: { ...source, reminderEnabled: false } }).message, /先.*開啟/)
  assert.deepEqual(source, before)
})

test('08:00 local date validation and invalid calendar dates', () => {
  assert.equal(reminderTime('2099-01-02'), new Date(2099, 0, 2, 8).getTime())
  for (const date of [null, '', '2099-02-31', '2099-13-01', 'not-a-date']) assert.equal(reminderTime(date), null)
})
test('schedule preserves the formal date, ignores unrelated name edits and stays stable', () => {
  const source = item(), before = structuredClone(source)
  const tasks = syncReminderTasks([], [source], () => space, 0, () => 'task')
  assert.equal(tasks.length, 1); assert.deepEqual(source, before)
  const renamed = { ...source, name: '新名稱' }
  assert.equal(taskStillValid(tasks[0], renamed, space), true)
  assert.deepEqual(syncReminderTasks(tasks, [renamed], () => space, 100, () => 'unused'), tasks)
})
test('restock, deletion, cancellation and removal invalidate the old generation', () => {
  const source = item()
  const tasks = syncReminderTasks([], [source], () => space, 0, () => 'task')
  for (const next of [{ ...source, inShoppingList: false }, { ...source, shoppingCompletedAt: 1 },
    { ...source, reminderSnoozes: {} }, { ...source, restockRecords: [] }]) {
    assert.equal(syncReminderTasks(tasks, [next], () => space, 1, () => 'unused')[0].state, 'cancelled')
  }
  assert.equal(syncReminderTasks(tasks, [], () => space, 1, () => 'unused')[0].state, 'cancelled')
  const changed = { ...source, restockRecords: [] }
  const cancelled = syncReminderTasks(tasks, [changed], () => space, 1, () => 'unused')
  assert.equal(syncReminderTasks(cancelled, [changed], () => space, 2, () => 'unused').length, 1)
})
test('changing or resetting the same date uses a new operation identity', () => {
  const source = item()
  const tasks = syncReminderTasks([], [source], () => space, 0, () => 'old')
  const next = { ...source, reminderSnoozeOperationIds: { self: 'op2' } }
  const changed = syncReminderTasks(tasks, [next], () => space, 1, () => 'new')
  assert.equal(changed[0].state, 'cancelled'); assert.equal(changed[1].id, 'new')
})
test('development demo jobs cannot run in production and do not require changing dates', () => {
  const source = item()
  const task = { itemId: source.id, fingerprint: reminderFingerprint(source), demo: true }
  assert.equal(taskStillValid(task, source, space, false), false)
  assert.equal(taskStillValid(task, source, space, true), true)
})

test('native notification integration: permission, persistence, delay, cancellation and dedupe', async t => {
  const originals = new Map(['localStorage', 'window', 'document', 'navigator', 'isSecureContext', 'Notification', 'location', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const install = (key, value) => Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  const memory = new Map(), session = new Map(), delivered = []
  const sessionStorage = { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key) }
  install('sessionStorage', sessionStorage)
  let failStorage = false, failDelivery = false, permissionRequests = 0
  const storage = { getItem: key => memory.get(key) ?? null, setItem(key, value) { if (failStorage) throw new Error('quota'); memory.set(key, value) }, removeItem: key => memory.delete(key) }
  class MockNotification {
    static permission = 'granted'
    static async requestPermission() { permissionRequests++; return this.permission }
    constructor(title, options) {
      delivered.push({ title, options, instance: this })
      queueMicrotask(() => failDelivery ? this.onerror?.() : this.onshow?.())
    }
    close() {}
  }
  install('localStorage', storage); install('window', new EventTarget())
  install('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  setMaxListeners(0, window, document)
  install('navigator', { locks: { request: async (_name, options, callback) => (callback || options)({ name: 'test-lock' }) } })
  install('isSecureContext', true); install('Notification', MockNotification)
  install('location', { origin: DEMO_PREVIEW_ORIGIN, href: DEMO_PREVIEW_ORIGIN + '/shopping?notificationDemo=1', search: '?notificationDemo=1' })
  const originalNow = Date.now
  let now = new Date(2099, 0, 2, 7, 59, 59).getTime()
  Date.now = () => now
  const originalSetTimeout = globalThis.setTimeout
  const timers = new Set()
  globalThis.setTimeout = (...args) => { const timer = originalSetTimeout(...args); if (args[1] > 1000) { timer.unref(); timers.add(timer) } return timer }
  const server = await createServer({ configFile: false, define: { 'import.meta.env.VITE_NOTIFICATION_DEMO': JSON.stringify('true') }, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } })
  let pinia
  const dispose = () => { if (pinia) for (const store of [...pinia._s.values()]) store.$dispose() }
  try {
    const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
    const { useNativeNotificationsStore } = await server.ssrLoadModule('/src/stores/nativeNotifications.js')
    const { useSharedNotificationsStore } = await server.ssrLoadModule('/src/stores/sharedNotifications.js')
    const { useNotificationSettingsStore } = await server.ssrLoadModule('/src/stores/notificationSettings.js')
    const { STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
    const { createItem } = await server.ssrLoadModule('/src/models/item.js')
    const { requestBrowserNotifications, notificationSupport, deliverBrowserNotification } = await server.ssrLoadModule('/src/utils/browserNotifications.js')
    const key = name => `home-restock:v1:${name}`
    function fresh() {
      failStorage = false; window.dispatchEvent(new Event('pagehide')); dispose()
      for (const timer of timers) clearTimeout(timer)
      timers.clear(); memory.clear(); session.clear(); delivered.length = 0; failDelivery = false
      MockNotification.permission = 'granted'; now = new Date(2099, 0, 2, 7, 59, 59).getTime()
      memory.set(key('items'), JSON.stringify({ version: STORAGE_VERSION, data: { items: [createItem({ ...item(), name: '衛生紙', unit: '包', category: '生活日用品' })],
        spaces: [space], customCategories: [], departedSpaces: [], demoSeeds: ['family-unclaimed-alcohol-v1'] } }))
      pinia = createPinia(); setActivePinia(pinia)
      location.origin = DEMO_PREVIEW_ORIGIN; location.search = '?notificationDemo=1'
      const native = useNativeNotificationsStore(); native.activateDemo()
      return { items: useItemsStore(), native, shared: useSharedNotificationsStore(), settings: useNotificationSettingsStore() }
    }
    await t.test('nothing before 08:00, one station record and one OS delivery at expiry, reload does not repeat', async () => {
      const { native, shared } = fresh()
      await native.tick(); assert.equal(delivered.length, 0); assert.equal(shared.records.length, 0)
      now += 1000; await native.tick()
      assert.equal(delivered.length, 1); assert.equal(shared.records.length, 1)
      await native.tick(); assert.equal(delivered.length, 1)
      native.$dispose(); const reload = useNativeNotificationsStore(); await reload.tick()
      assert.equal(delivered.length, 1); assert.equal(shared.records.length, 1)
    })
    await t.test('permission is requested only by an explicit enable action', async () => {
      const { native } = fresh(); const before = permissionRequests
      MockNotification.permission = 'default'
      await native.tick(); assert.equal(permissionRequests, before)
      await native.enable(); assert.equal(permissionRequests, before + 1)
    })
    await t.test('denied, insecure and unsupported environments give explicit errors', async () => {
      assert.equal(notificationSupport({ isSecureContext: false }).ok, false)
      assert.equal(notificationSupport({ isSecureContext: true }).ok, false)
      const denied = await requestBrowserNotifications({ isSecureContext: true, Notification: { requestPermission: async () => 'denied' } })
      assert.equal(denied.ok, false); assert.match(denied.message, /封鎖/)
    })
    await t.test('preference off or permission denied blocks OS notification but preserves the station record', async () => {
      for (const mode of ['off', 'denied']) {
        const { native, shared, settings } = fresh()
        if (mode === 'off') settings.setPushEnabled(false)
        else MockNotification.permission = 'denied'
        await native.tick(); now += 1000; await native.tick()
        assert.equal(delivered.length, 0); assert.equal(shared.records.length, 1)
      }
    })
    await t.test('cancel, restock, delete or remove before deadline prevents old notification', async () => {
      for (const mode of ['cancel', 'restock', 'delete', 'remove', 'disable']) {
        const { native, items, shared } = fresh(); await native.tick()
        if (mode === 'disable') items.disableReminder('a')
        if (mode === 'cancel') items.cancelShoppingReminderSnooze('a')
        if (mode === 'restock') items.completeShoppingItem('a')
        if (mode === 'delete') items.removeItem('a')
        if (mode === 'remove') items.removeFromShoppingList('a')
        now += 1000; await native.tick()
        assert.equal(delivered.length, 0); assert.equal(shared.records.length, 0)
      }
    })
    await t.test('queue persistence failure cannot dispatch or mark success', async () => {
      const { native } = fresh(); failStorage = true; now += 1000; await native.tick()
      assert.equal(delivered.length, 0); assert.equal(native.error, true)
      failStorage = false; await native.tick(); assert.equal(delivered.length, 1)
    })
    await t.test('native transport failure is reported and not replayed automatically', async () => {
      const { native } = fresh(); await native.tick(); failDelivery = true; now += 1000; await native.tick()
      assert.equal(native.error, true); assert.equal(delivered.length, 1)
      await native.tick(); assert.equal(delivered.length, 1)
    })
    await t.test('10-second demo leaves the formal date intact, can fire with page hidden, no station spam', async () => {
      const { native, items, shared } = fresh(); const date = items.getItem('a').reminderSnoozes.self
      assert.equal((await native.demo('a')).ok, true)
      document.visibilityState = 'hidden'
      now += 9999; await native.tick()
      // Formal 08:00 may also have become due; isolate the demo by its title.
      assert.equal(delivered.filter(entry => entry.title.includes('10 秒')).length, 0)
      now++; await native.tick()
      assert.equal(delivered.filter(entry => entry.title.includes('10 秒')).length, 1)
      assert.equal(items.getItem('a').reminderSnoozes.self, date)
      assert.equal(shared.records.length, 1)
      document.visibilityState = 'visible'
    })
    await t.test('explicit cancellation persists across reload and repeat clicks reserve only one demo', async () => {
      const { native } = fresh()
      const results = await Promise.all([native.demo('a'), native.demo('a')])
      assert.equal(results.filter(result => result.ok).length, 1)
      assert.deepEqual([...native.pendingDemoItems], ['a'])
      assert.equal((await native.cancelDemo('a')).ok, true)
      assert.equal(native.pendingDemo, false)
      native.$dispose()
      const reload = useNativeNotificationsStore()
      now += 10000; await reload.tick()
      assert.equal(delivered.filter(entry => entry.title.includes('10 秒')).length, 0)
      assert.equal(JSON.parse(memory.get(key('native-notifications'))).data.tasks.find(task => task.demo).state, 'cancelled')
    })
    await t.test('demo pending after reload delivers once and uses current item and space', async () => {
      const { native } = fresh()
      assert.equal((await native.demo('a')).ok, true)
      native.$dispose()
      const reload = useNativeNotificationsStore(); await reload.tick()
      assert.deepEqual([...reload.pendingDemoItems], ['a'])
      now += 10000; await reload.tick(); await reload.tick()
      const demos = delivered.filter(entry => entry.title.includes('10 秒'))
      assert.equal(demos.length, 1)
      assert.match(demos[0].options.body, /衛生紙/)
      assert.equal(new URL(demos[0].options.data.url).pathname, '/shopping')
      assert.equal(new URL(demos[0].options.data.url).searchParams.get('notificationItem'), 'a')
    })
    await t.test('completed, deleted and removed items invalidate a waiting demo', async () => {
      for (const change of [item => { item.shoppingCompletedAt = 1 }, item => { item.inShoppingList = false }, null]) {
        const { native, items } = fresh()
        assert.equal((await native.demo('a')).ok, true)
        const saved = JSON.parse(memory.get(key('items')))
        if (change) { change(items.getItem('a')); change(saved.data.items[0]) }
        else { items.items.splice(0); saved.data.items = [] }
        memory.set(key('items'), JSON.stringify(saved))
        now += 10000; await native.tick()
        assert.equal(delivered.filter(entry => entry.title.includes('10 秒')).length, 0)
        assert.equal(native.pendingDemo, false)
      }
    })
    await t.test('disabled reminder and unsaved snooze report specific reasons, keep state and scope feedback', async () => {
      const { native, items } = fresh()
      items.disableReminder('a')
      const before = JSON.stringify(items.getItem('a'))
      assert.equal((await native.demo('a')).code, 'reminder-off')
      assert.equal(JSON.stringify(items.getItem('a')), before)
      assert.match(native.demoFeedback.a.message, /先.*開啟/)
      assert.equal(native.messageItemId, 'a')
      assert.equal(native.demoFeedback.b, undefined)
      native.clearDemoFeedback('a'); assert.equal(native.demoFeedback.a, undefined)
      items.enableReminder('a'); items.cancelShoppingReminderSnooze('a')
      assert.equal((await native.demo('a')).code, 'unsaved')
      assert.equal(native.pendingDemo, false)
    })
    await t.test('other pending item blocks scheduling and can be cancelled from the current item', async () => {
      const { native, items } = fresh()
      items.items.push(createItem({ ...item(), id: 'b', name: '洗衣精' }))
      items.updateItem('b', { quantity: 2 })
      assert.equal((await native.demo('a')).ok, true)
      assert.equal(native.demoEligibility('b').otherItemId, 'a')
      assert.equal((await native.demo('b')).code, 'waiting-other')
      assert.equal(native.demoFeedback.a.error, false)
      assert.equal(native.demoFeedback.b.error, true)
      assert.equal((await native.cancelDemo('a', 'b')).ok, true)
      assert.equal(native.demoFeedback.b.message, '已取消測試通知。')
      assert.equal(native.demoEligibility('b').ok, true)
      assert.equal((await native.demo('b')).ok, true)
      assert.deepEqual([...native.pendingDemoItems], ['b'])
    })
    await t.test('preview requires a link and click; activation survives route changes and reload, ending cancels only demo', async () => {
      const { native, items } = fresh()
      await native.endDemo()
      assert.equal(native.demoEnabled, false)
      assert.equal(native.activateDemo().ok, false)
      native.captureDemoLink('?notificationDemo=1')
      assert.equal(native.demoEnabled, false)
      assert.equal((await native.demo('a')).ok, false)
      assert.equal(native.activateDemo().ok, true)
      const before = JSON.stringify(items.getItem('a'))
      assert.equal((await native.demo('a')).ok, true)
      location.search = ''; native.captureDemoLink('')
      assert.equal(native.demoEnabled, true)
      native.$dispose()
      const reload = useNativeNotificationsStore()
      assert.equal(reload.demoEnabled, true)
      await reload.endDemo()
      assert.equal(sessionStorage.getItem(DEMO_SESSION_KEY), null)
      const tasks = JSON.parse(memory.get(key('native-notifications'))).data.tasks
      assert.equal(tasks.find(task => task.demo).state, 'cancelled')
      assert.equal(tasks.find(task => !task.demo).state, 'scheduled')
      assert.equal(JSON.stringify(items.getItem('a')), before)
      now += 10000; await reload.tick()
      assert.equal(delivered.filter(entry => entry.title.includes('10 秒')).length, 0)
    })
    await t.test('an inactive or separately activated tab does not cancel or dispatch another session demo', async () => {
      const { native } = fresh()
      assert.equal((await native.demo('a')).ok, true)
      const ownerSession = sessionStorage.getItem(DEMO_SESSION_KEY)
      sessionStorage.removeItem(DEMO_SESSION_KEY)
      const otherPinia = createPinia(); const other = useNativeNotificationsStore(otherPinia)
      assert.equal(other.demoEnabled, false)
      now += 10000; await other.tick()
      assert.equal(JSON.parse(memory.get(key('native-notifications'))).data.tasks.find(task => task.demo).state, 'scheduled')
      assert.equal(delivered.filter(entry => entry.title.includes('10 秒')).length, 0)
      other.activateDemo(); await other.tick(); await other.endDemo()
      assert.equal(JSON.parse(memory.get(key('native-notifications'))).data.tasks.find(task => task.demo).state, 'scheduled')
      sessionStorage.setItem(DEMO_SESSION_KEY, ownerSession)
      await native.tick(); await native.tick()
      assert.equal(delivered.filter(entry => entry.title.includes('10 秒')).length, 1)
      for (const store of otherPinia._s.values()) store.$dispose()
    })
    await t.test('production and unknown origins reject invitations and persisted sessions even with build flag true', async () => {
      for (const origin of [DEMO_PRODUCTION_ORIGIN, 'https://unknown.vercel.app', 'http://localhost']) {
        const { native } = fresh(); assert.equal((await native.demo('a')).ok, true)
        location.origin = origin
        const deniedPinia = createPinia(); const denied = useNativeNotificationsStore(deniedPinia)
        denied.captureDemoLink('?notificationDemo=1')
        assert.equal(denied.demoInvited, false); assert.equal(denied.demoEnabled, false)
        assert.equal(denied.activateDemo().ok, false)
        assert.equal((await denied.demo('a')).ok, false)
        assert.equal((await denied.cancelDemo('a')).ok, false)
        now += 10000; await denied.tick()
        assert.equal(delivered.filter(entry => entry.title.includes('10 秒')).length, 0)
        assert.equal(delivered.filter(entry => !entry.title.includes('10 秒')).length, 1)
        assert.equal(JSON.parse(memory.get(key('native-notifications'))).data.tasks.find(task => task.demo).state, 'cancelled')
        for (const store of deniedPinia._s.values()) store.$dispose()
      }
      location.origin = DEMO_PREVIEW_ORIGIN
    })
    await t.test('session storage failure refuses activation without changing formal reminders', async () => {
      const { native, items } = fresh(); await native.endDemo()
      native.captureDemoLink('?notificationDemo=1')
      const before = JSON.stringify(items.getItem('a'))
      const originalSet = sessionStorage.setItem
      try {
        sessionStorage.setItem = () => { throw new Error('blocked') }
        assert.equal(native.activateDemo().ok, false)
        assert.equal(native.demoEnabled, false)
        assert.match(native.demoModeMessage, /未啟用/)
        assert.equal(JSON.stringify(items.getItem('a')), before)
      } finally { sessionStorage.setItem = originalSet }
    })
    await t.test('saving a snooze automatically schedules one independent demo, concurrent saves share the operation', async () => {
      const { native, items } = fresh()
      let saves = 0
      const save = items.snoozeShoppingReminder
      items.snoozeShoppingReminder = (...args) => { saves++; return save(...args) }
      const results = await Promise.all([native.saveSnoozeAndScheduleDemo('a', '2099-01-03'), native.saveSnoozeAndScheduleDemo('a', '2099-01-03')])
      assert.equal(results.every(result => result.ok && result.demoResult.ok), true)
      assert.equal(saves, 1)
      const tasks = JSON.parse(memory.get(key('native-notifications'))).data.tasks
      assert.equal(tasks.filter(task => task.demo && task.state === 'scheduled').length, 1)
      assert.equal(items.getItem('a').reminderSnoozes.self, '2099-01-03')
      now += 10000; await native.tick(); await native.tick()
      assert.equal(delivered.filter(entry => entry.title.includes('10 秒')).length, 1)
      assert.equal(items.getItem('a').reminderSnoozes.self, '2099-01-03')
    })
    await t.test('normal mode, denied permission, disabled item and other pending demo preserve saved formal dates', async () => {
      for (const state of ['off', 'denied', 'reminder-off', 'other']) {
        const { native, items } = fresh()
        if (state === 'off') await native.endDemo()
        if (state === 'denied') MockNotification.permission = 'denied'
        if (state === 'reminder-off') items.disableReminder('a')
        if (state === 'other') {
          items.items.push(createItem({ ...item(), id: 'b', name: '洗衣精' }))
          items.updateItem('b', { quantity: 2 }); await native.demo('b')
        }
        const result = await native.saveSnoozeAndScheduleDemo('a', '2099-01-03')
        assert.equal(result.ok, true)
        if (state === 'off') assert.equal(result.demoResult, undefined)
        else assert.equal(result.demoResult.ok, false)
        assert.equal(items.getItem('a').reminderSnoozes.self, '2099-01-03')
        assert.equal(native.pendingDemoItems.includes('a'), false)
        if (state === 'other') assert.deepEqual([...native.pendingDemoItems], ['b'])
        if (state === 'reminder-off') assert.equal(items.getItem('a').reminderEnabled, false)
      }
    })
    await t.test('failed formal save creates no demo; editing the date invalidates the previous generation', async () => {
      const { native, items } = fresh()
      assert.equal((await native.saveSnoozeAndScheduleDemo('a', 'invalid')).ok, false)
      assert.equal(native.pendingDemo, false)
      await native.saveSnoozeAndScheduleDemo('a', '2099-01-03')
      await native.saveSnoozeAndScheduleDemo('a', '2099-01-04')
      const tasks = JSON.parse(memory.get(key('native-notifications'))).data.tasks.filter(task => task.demo)
      assert.equal(tasks[0].state, 'cancelled')
      assert.equal(tasks.filter(task => task.state === 'scheduled').length, 1)
      assert.equal(items.getItem('a').reminderSnoozes.self, '2099-01-04')
    })
    await t.test('native click routes to shopping with a fresh request on each click, including after deletion', async () => {
      const { native, items } = fresh(), routes = []
      native.start(target => routes.push(target))
      await new Promise(resolve => setTimeout(resolve, 10))
      await native.saveSnoozeAndScheduleDemo('a', '2099-01-03')
      now += 10000; await native.tick()
      const notice = delivered.find(entry => entry.title.includes('10 秒'))
      assert.ok(notice)
      notice.instance.onclick(); notice.instance.onclick()
      assert.equal(routes.length, 2)
      assert.equal(routes[0].name, 'shopping')
      assert.equal(routes[0].query.tab, 'personal')
      assert.equal(routes[0].query.notificationItem, 'a')
      assert.notEqual(routes[0].query.notificationRequest, routes[1].query.notificationRequest)
      items.items.splice(0); notice.instance.onclick()
      assert.equal(routes.at(-1).query.notificationItem, 'a')
      native.stop()
    })
    for (const state of ['removed', 'completed', 'deleted', 'left-space']) {
      await t.test(`another tab ${state}: stale snooze and delayed saves cannot overwrite disk or arrange a demo`, async () => {
        const { native, items } = fresh()
        if (state === 'left-space') {
          items.spaces.push({ id: 'audit-shared', name: '任意共享空間', shared: true, members: [{ id: 'other', name: '組員' }] })
          items.updateItem('a', { spaceId: 'audit-shared' })
          assert.equal((await items.flushPersistence()).ok, true)
        }
        const otherPinia = createPinia(), other = useItemsStore(otherPinia)
        if (state === 'removed') other.removeShoppingEntry('a')
        if (state === 'completed') other.completeShoppingItem('a')
        if (state === 'deleted') other.removeItem('a')
        if (state === 'left-space') other.leaveSpace('audit-shared')
        assert.equal((await other.flushPersistence()).ok, true)
        const afterOther = memory.get(key('items'))
        const beforeLocal = JSON.stringify(items.getItem('a'))
        const result = await native.saveSnoozeAndScheduleDemo('a', '2099-01-03')
        assert.equal(result.ok, false); assert.equal(result.error.code, 'STALE_ITEMS')
        assert.match(result.error.message, /重新載入/)
        assert.equal(JSON.stringify(items.getItem('a')), beforeLocal)
        assert.equal(memory.get(key('items')), afterOther)
        assert.equal((await items.flushPersistence()).ok, false)
        window.dispatchEvent(new Event('pagehide')); await new Promise(resolve => setTimeout(resolve, 10))
        assert.equal(memory.get(key('items')), afterOther)
        assert.equal(native.pendingDemo, false)
        assert.equal(JSON.parse(memory.get(key('native-notifications')) || '{"data":{"tasks":[]}}').data.tasks.some(task => task.demo), false)
        assert.equal(delivered.length, 0)
        for (const store of otherPinia._s.values()) store.$dispose()
      })
    }
    await t.test('latest persisted push preference blocks scheduling even when the local setting is still on', async () => {
      const { native, items, settings } = fresh()
      assert.equal(settings.pushEnabled, true)
      memory.set(key('notifications'), JSON.stringify({ version: STORAGE_VERSION, data: { pushEnabled: false, restockDays: 5 } }))
      const result = await native.saveSnoozeAndScheduleDemo('a', '2099-01-03')
      assert.equal(result.ok, true); assert.equal(result.demoResult.ok, false)
      assert.match(result.demoResult.message, /推播/)
      assert.equal(items.getItem('a').reminderSnoozes.self, '2099-01-03')
      assert.equal(native.pendingDemo, false)
    })
    for (const change of ['push-off', 'completed']) {
      await t.test(`state changed while waiting for notification lock (${change}) is rechecked without rolling back saved date`, async () => {
        const { native } = fresh()
        const request = navigator.locks.request
        let notificationLocks = 0
        navigator.locks.request = async (...args) => {
          if (args[0] === 'bubu-native-reminders' && ++notificationLocks === 2) {
            if (change === 'push-off') memory.set(key('notifications'), JSON.stringify({ version: STORAGE_VERSION, data: { pushEnabled: false } }))
            else {
              const saved = JSON.parse(memory.get(key('items')))
              saved.data.items[0].shoppingCompletedAt = 1; saved.revision = 'another-tab'
              memory.set(key('items'), JSON.stringify(saved))
            }
          }
          return request(...args)
        }
        try {
          const result = await native.saveSnoozeAndScheduleDemo('a', '2099-01-03')
          assert.equal(result.ok, true); assert.equal(result.demoResult.ok, false)
          assert.equal(JSON.parse(memory.get(key('items'))).data.items[0].reminderSnoozes.self, '2099-01-03')
          assert.equal(native.pendingDemo, false)
        } finally { navigator.locks.request = request }
      })
    }
    await t.test('random IDs and custom personal/shared spaces support sequential items and new rounds of the same item', async () => {
      const { native, items } = fresh()
      const personalId = 'space-' + crypto.randomUUID(), sharedId = 'space-' + crypto.randomUUID()
      items.spaces.push({ id: personalId, name: '自訂個人空間', shared: false, members: [] },
        { id: sharedId, name: '自訂共享空間', shared: true, members: [{ id: 'member', name: '組員' }] })
      const entries = ['衛生紙', '洗衣精', '衛生棉', '洗碗精', '狗狗糧食', '自訂用品'].map((name, i) =>
        createItem({ ...item(), id: crypto.randomUUID(), name, spaceId: i % 2 ? sharedId : personalId, reminderSnoozes: {}, reminderSnoozeOperationIds: {} }))
      items.items.push(...entries)
      let count = 0
      for (const entry of [...entries, entries[0], entries[1]]) {
        const before = entry.reminderSnoozeOperationIds.self
        const result = await native.saveSnoozeAndScheduleDemo(entry.id, '2099-01-03')
        assert.equal(result.demoResult.ok, true); assert.notEqual(entry.reminderSnoozeOperationIds.self, before)
        assert.equal(native.pendingDemoItems.length, 1)
        now += 10000; await native.tick(); await native.tick()
        const notices = delivered.filter(n => n.title.includes('10 秒'))
        assert.equal(notices.length, ++count); assert.equal(native.pendingDemo, false)
        const url = new URL(notices.at(-1).options.data.url)
        assert.equal(url.searchParams.get('notificationItem'), entry.id)
        assert.equal(url.searchParams.get('tab'), entry.spaceId === sharedId ? 'shared' : 'personal')
        assert.equal(entry.reminderSnoozes.self, '2099-01-03')
      }
    })
    await t.test('corrupt task storage is not cleared or replayed', async () => {
      const { native } = fresh()
      memory.set(key('native-notifications'), '{broken')
      now += 1000; await native.tick()
      assert.equal(delivered.length, 0); assert.equal(native.error, true)
      assert.equal(memory.get(key('native-notifications')), '{broken')
    })
    await t.test('permission changing back after request is not reported as enabled', async () => {
      const { native } = fresh()
      const request = MockNotification.requestPermission
      MockNotification.requestPermission = async () => { MockNotification.permission = 'denied'; return 'granted' }
      try { assert.equal((await native.enable()).ok, false); assert.equal(native.error, true) }
      finally { MockNotification.requestPermission = request }
    })
    await t.test('another tab disabling the preference blocks system delivery', async () => {
      const { native } = fresh(); await native.tick()
      memory.set(key('notifications'), JSON.stringify({ version: STORAGE_VERSION, data: { pushEnabled: false, restockDays: 5 } }))
      now += 1000; await native.tick(); assert.equal(delivered.length, 0)
    })
    await t.test('persisted reservation after a crash is not delivered twice', async () => {
      const { native } = fresh(); await native.tick()
      const saved = JSON.parse(memory.get(key('native-notifications')))
      saved.data.tasks[0].state = 'attempted'
      memory.set(key('native-notifications'), JSON.stringify(saved))
      now += 1000; await native.tick(); assert.equal(delivered.length, 0)
    })
    await t.test('persisted item changes in another tab invalidate stale local sources', async () => {
      const { native } = fresh(); await native.tick()
      const saved = JSON.parse(memory.get(key('items')))
      saved.data.items[0].inShoppingList = false
      memory.set(key('items'), JSON.stringify(saved))
      now += 1000; await native.tick(); assert.equal(delivered.length, 0)
    })
    await t.test('a stale tab cannot cancel a new generation saved by another tab', async () => {
      const { native } = fresh(); await native.tick()
      const saved = JSON.parse(memory.get(key('items')))
      saved.data.items[0].reminderSnoozeOperationIds.self = 'other-tab-operation'
      memory.set(key('items'), JSON.stringify(saved))
      await native.tick()
      const tasks = JSON.parse(memory.get(key('native-notifications'))).data.tasks
      assert.equal(tasks.at(-1).operationId, 'other-tab-operation')
      assert.equal(tasks.at(-1).state, 'scheduled')
    })
    await t.test('concurrent ticks share one dispatch and notification click returns the target', async () => {
      const { native } = fresh(); await native.tick(); now += 1000
      await Promise.all([native.tick(), native.tick()]); assert.equal(delivered.length, 1)
      // Constructor callback is connected; a disposed/no-router store safely ignores navigation.
      assert.doesNotThrow(() => delivered[0].instance.onclick())
    })
    await t.test('transport registration rejection falls back and native show rejection never reports success', async () => {
      let usedFallback = false
      class Fallback {
        static permission = 'granted'
        constructor() { usedFallback = true; queueMicrotask(() => this.onshow?.()) }
        close() {}
      }
      await deliverBrowserNotification({ title: 'x', tag: 'x' }, { isSecureContext: true, Notification: Fallback,
        navigator: { serviceWorker: { register: async () => { throw new Error('registration failed') } } } })
      assert.equal(usedFallback, true)
      await assert.rejects(deliverBrowserNotification({ title: 'x', tag: 'x' }, { isSecureContext: true, Notification: Fallback,
        navigator: { serviceWorker: { register: async () => ({ active: true, showNotification: async () => { throw new Error('blocked') } }) } } }), /blocked/)
    })
    await t.test('cancelling a formal snooze also invalidates its waiting demo snapshot', async () => {
      const { native, items } = fresh()
      assert.equal((await native.demo('a')).ok, true)
      items.cancelShoppingReminderSnooze('a')
      now += 10000; await native.tick()
      assert.equal(delivered.length, 0)
    })
    await t.test('state is revalidated after waiting for native transport setup', async () => {
      let constructed = false
      class NoShow { constructor() { constructed = true } }
      await assert.rejects(deliverBrowserNotification({ title: 'x', tag: 'x', shouldSend: () => false },
        { isSecureContext: true, Notification: Object.assign(NoShow, { permission: 'granted' }) }), /取消/)
      assert.equal(constructed, false)
    })
  } finally {
    failStorage = false; dispose(); for (const timer of timers) clearTimeout(timer)
    await server.close(); Date.now = originalNow; globalThis.setTimeout = originalSetTimeout
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})

test('notification worker focuses an existing client and refuses external targets', async () => {
  const { readFile } = await import('node:fs/promises')
  const { runInNewContext } = await import('node:vm')
  const source = await readFile(new URL('../public/bubu-notifications-sw.js', import.meta.url), 'utf8')
  const handlers = new Map(), opened = [], messages = []
  let focused = 0
  const client = { url: 'https://example.test/bubu/settings', focus: async () => { focused++ }, postMessage: message => messages.push(message) }
  const worker = { addEventListener: (name, fn) => handlers.set(name, fn), skipWaiting() {},
    registration: { scope: 'https://example.test/bubu/' }, location: { origin: 'https://example.test' },
    clients: { claim: async () => {}, matchAll: async () => [client], openWindow: async url => opened.push(url) } }
  runInNewContext(source, { self: worker, URL })
  async function click(url) {
    let work
    handlers.get('notificationclick')({ notification: { data: { url }, close() {} }, waitUntil: promise => { work = promise } })
    await work
  }
  await click('https://example.test/bubu/items/a')
  assert.equal(focused, 1); assert.equal(messages[0].type, 'bubu-notification-click'); assert.equal(opened.length, 0)
  await click('https://example.test/bubu/shopping?tab=shared&space=family&notificationItem=b&notificationSpace=family')
  assert.equal(messages.length, 2)
  await click('https://example.test/bubu/settings?notificationItem=a');
  await click('https://evil.test/items/a'); await click('https://example.test/other/items/a')
  assert.equal(focused, 2); assert.equal(messages.length, 2)
})
test('notification worker opens a new app window if the original was closed', async () => {
  const { readFile } = await import('node:fs/promises')
  const { runInNewContext } = await import('node:vm')
  const handlers = new Map(), opened = []
  const worker = { addEventListener: (name, fn) => handlers.set(name, fn), registration: { scope: 'https://example.test/' },
    location: { origin: 'https://example.test' }, clients: { matchAll: async () => [], openWindow: async url => opened.push(url) } }
  runInNewContext(await readFile(new URL('../public/bubu-notifications-sw.js', import.meta.url), 'utf8'), { self: worker, URL })
  let work
  handlers.get('notificationclick')({ notification: { data: { url: 'https://example.test/items/a' }, close() {} }, waitUntil: promise => { work = promise } })
  await work; assert.deepEqual(opened, ['https://example.test/items/a'])
})


test('exact preview origin and explicit invitation cannot be overridden by saved state or URL lookalikes', () => {
  const storage = { getItem: () => JSON.stringify({ version: 1, origin: DEMO_PREVIEW_ORIGIN, id: 'old-session' }) }
  assert.equal(allowsNotificationDemo(DEMO_PREVIEW_ORIGIN), true)
  assert.equal(demoLinkRequested(DEMO_PREVIEW_ORIGIN, '?notificationDemo=1'), true)
  assert.equal(demoLinkRequested(DEMO_PREVIEW_ORIGIN, ''), false)
  assert.equal(demoLinkRequested(DEMO_PREVIEW_ORIGIN, '?notificationDemo=true'), false)
  for (const origin of [DEMO_PRODUCTION_ORIGIN, 'http://localhost', DEMO_PREVIEW_ORIGIN + '.evil.test',
    DEMO_PREVIEW_ORIGIN.replace('https:', 'http:'), 'https://other.vercel.app', DEMO_PREVIEW_ORIGIN + ':444']) {
    assert.equal(allowsNotificationDemo(origin), false)
    assert.equal(demoLinkRequested(origin, '?notificationDemo=1'), false)
    assert.equal(restoreDemoSession(origin, storage), null)
  }
  assert.equal(restoreDemoSession(DEMO_PREVIEW_ORIGIN, storage, 'reload'), 'old-session')
  let removed = false
  assert.equal(restoreDemoSession(DEMO_PREVIEW_ORIGIN, { ...storage, removeItem: () => { removed = true } }, 'navigate'), null)
  assert.equal(removed, true)
  assert.equal(restoreDemoSession(DEMO_PREVIEW_ORIGIN, { getItem: () => '{broken' }), null)
})


test('shopping native links preserve IDs/spaces and reject arbitrary destinations; stale items fail safely', () => {
  const personal = { ...item(), name: '同名用品' }
  const shared = { ...personal, id: 'b', spaceId: 'family' }
  const family = { id: 'family', shared: true }
  const url = shoppingNotificationUrl(shared, family, '/bubu/', 'https://example.test')
  const target = parseShoppingNotificationUrl(url, '/bubu/', 'https://example.test')
  assert.deepEqual(target, shoppingNotificationTarget('b', 'family', true))
  assert.equal(target.query.space, 'family')
  assert.equal(shoppingNotificationTarget('a', 'personal').query.tab, 'personal')
  for (const bad of [url.replace('example.test', 'evil.test'), 'https://example.test/bubu/settings?notificationItem=a',
    'https://example.test/shopping?notificationItem=a&tab=personal', url.replace('space=family', 'space=wrong')]) {
    assert.equal(parseShoppingNotificationUrl(bad, '/bubu/', 'https://example.test'), null)
  }
  assert.equal(resolveShoppingNotification(null, family, 'family').ok, false)
  assert.equal(resolveShoppingNotification(shared, null, 'family').ok, false)
  assert.equal(resolveShoppingNotification(shared, family, 'other').ok, false)
  assert.equal(resolveShoppingNotification(shared, family, 'family', false).ok, false)
  assert.equal(resolveShoppingNotification({ ...shared, inShoppingList: false }, family, 'family').ok, false)
  assert.equal(resolveShoppingNotification({ ...shared, inShoppingList: false, shoppingCompletedAt: 1 }, family, 'family').completed, true)
  assert.equal(resolveShoppingNotification(shared, family, 'family').ok, true)
})
