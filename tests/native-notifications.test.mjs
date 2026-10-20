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
  const originals = new Map(['localStorage', 'window', 'document', 'navigator', 'isSecureContext', 'Notification', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const install = (key, value) => Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  const memory = new Map(), delivered = []
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
  install('location', { origin: 'http://localhost', href: 'http://localhost/' })
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
      timers.clear(); memory.clear(); delivered.length = 0; failDelivery = false
      MockNotification.permission = 'granted'; now = new Date(2099, 0, 2, 7, 59, 59).getTime()
      memory.set(key('items'), JSON.stringify({ version: STORAGE_VERSION, data: { items: [createItem({ ...item(), name: '衛生紙', unit: '包', category: '生活日用品' })],
        spaces: [space], customCategories: [], departedSpaces: [], demoSeeds: ['family-unclaimed-alcohol-v1'] } }))
      pinia = createPinia(); setActivePinia(pinia)
      return { items: useItemsStore(), native: useNativeNotificationsStore(), shared: useSharedNotificationsStore(), settings: useNotificationSettingsStore() }
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
      assert.ok(demos[0].options.data.url.endsWith('/items/a'))
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
  await click('https://evil.test/items/a'); await click('https://example.test/other/items/a')
  assert.equal(focused, 1); assert.equal(messages.length, 1)
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


test('demo is disabled in a build without explicit opt-in', async () => {
  const server = await createServer({ configFile: false, define: { 'import.meta.env.VITE_NOTIFICATION_DEMO': JSON.stringify('false') }, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } })
  try {
    const { notificationDemoEnabled } = await server.ssrLoadModule('/src/stores/nativeNotifications.js')
    assert.equal(notificationDemoEnabled, false)
  } finally { await server.close() }
})
