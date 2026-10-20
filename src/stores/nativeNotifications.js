import { ref, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import { useItemsStore } from './items'
import { useSharedNotificationsStore } from './sharedNotifications'
import { useNotificationSettingsStore } from './notificationSettings'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'
import { generateId } from '../utils/id.js'
import { reminderFingerprint, reminderEligible, syncReminderTasks, taskStillValid } from '../utils/nativeReminderTasks.js'
import { notificationSupport, requestBrowserNotifications, deliverBrowserNotification } from '../utils/browserNotifications.js'

// Explicit opt-in at build time, including Vercel Preview. Disabled by default.
export const notificationDemoEnabled = import.meta.env.VITE_NOTIFICATION_DEMO === 'true'
const KEY = STORE_KEYS.nativeNotifications
export const useNativeNotificationsStore = defineStore('native-notifications', () => {
  const items = useItemsStore()
  const shared = useSharedNotificationsStore()
  const settings = useNotificationSettingsStore()
  const message = ref('')
  const error = ref(false)
  const permission = ref('default')
  const pendingDemo = ref(false)
  const pendingDemoItems = ref([])
  let interval
  let busy = false
  let active = false
  let navigate
  function report(text, failed = false) { message.value = text; error.value = failed }
  function support() {
    const result = notificationSupport()
    permission.value = result.permission || 'unsupported'
    return result
  }
  async function enable() {
    // No await before requesting permission: preserve Safari user activation.
    const result = await requestBrowserNotifications()
    const current = support()
    if (result.ok && current.permission !== 'granted') {
      const failed = { ok: false, message: '瀏覽器仍回報未允許通知，請檢查網站權限與作業系統設定；系統通知未啟用。' }
      report(failed.message, true); return failed
    }
    if (result.ok) { settings.setPushEnabled(true); report('已允許通知。請確認作業系統也允許瀏覽器通知，並關閉勿擾模式。') }
    else report(result.message, true)
    return result
  }
  function readTasks() {
    const saved = loadPersisted(KEY)
    if (!saved) {
      if (localStorage.getItem(`home-restock:v1:${KEY}`)) throw new Error('通知排程資料無法讀取，未發送；請先備份本機資料。')
      return []
    }
    if (!Array.isArray(saved.tasks) || saved.tasks.some(task => !task || typeof task.id !== 'string'
      || typeof task.itemId !== 'string' || !Number.isFinite(task.dueAt) || typeof task.fingerprint !== 'string')) throw new Error('通知排程資料損壞，未發送；請先備份本機資料。')
    return saved.tasks
  }
  function saveTasks(tasks) {
    if (!savePersisted(KEY, { tasks })) throw new Error('提醒排程無法儲存，系統通知未發送，請恢復儲存空間後重試。')
    pendingDemoItems.value = tasks.filter(task => task.demo && task.state === 'scheduled').map(task => task.itemId)
    pendingDemo.value = pendingDemoItems.value.length > 0
  }
  function canAccess(item) {
    const space = item && items.getSpace(item.spaceId)
    return reminderEligible(item, space) && (!space.shared || items.getSpaceMembers(space.id).some(member => member.id === 'self'))
  }
  function currentValid(task) {
    if (task.demo && readTasks().find(entry => entry.id === task.id)?.state === 'cancelled') return false
    const item = items.getItem(task.itemId)
    if (!canAccess(item) || !taskStillValid(task, item, item && items.getSpace(item.spaceId), notificationDemoEnabled)) return false
    const persisted = loadPersisted(STORE_KEYS.items)
    const savedItem = persisted?.items?.find(item => item.id === task.itemId)
    const savedSpace = persisted?.spaces?.find(space => space.id === task.spaceId)
    return taskStillValid(task, savedItem, savedSpace, notificationDemoEnabled)
  }
  function itemUrl(id) { return new URL(`${import.meta.env.BASE_URL}items/${encodeURIComponent(id)}`, location.origin).href }
  function openItem(id) {
    if (!items.getItem(id)) { report('此用品已不存在，無法開啟。', true); navigate?.({ name: 'notifications' }); return }
    navigate?.({ name: 'item-detail', params: { id } })
  }
  async function closeInvalidTags(tags) {
    if (!navigator.serviceWorker || !tags.length) return
    try {
      const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
      for (const n of await registration?.getNotifications?.() || []) if (tags.includes(n.tag)) n.close()
    } catch { /* Already-displayed historical records stay intact. */ }
  }
  async function process() {
    const oldTasks = readTasks()
    // Builds without explicit demo opt-in invalidate persisted demo jobs.
    const persisted = loadPersisted(STORE_KEYS.items)
    const sourceItems = Array.isArray(persisted?.items) ? persisted.items : items.items
    const sourceSpace = id => Array.isArray(persisted?.spaces) ? persisted.spaces.find(space => space.id === id) : items.getSpace(id)
    const tasks = syncReminderTasks(oldTasks, sourceItems, sourceSpace, Date.now(), generateId)
    for (const task of tasks) {
      const item = sourceItems.find(item => item.id === task.itemId)
      if (task.state !== 'cancelled' && !taskStillValid(task, item, item && sourceSpace(item.spaceId), notificationDemoEnabled)) task.state = 'cancelled'
    }
    if (JSON.stringify(tasks) !== JSON.stringify(oldTasks)) saveTasks(tasks)
    await closeInvalidTags(tasks.filter(task => task.state === 'cancelled').map(task => task.id))
    for (const task of tasks) {
      if (task.state !== 'scheduled' || task.dueAt > Date.now()) continue
      let item = items.getItem(task.itemId)
      if (!taskStillValid(task, item, item && items.getSpace(item.spaceId), notificationDemoEnabled) || !canAccess(item)) continue
      if (!currentValid(task)) continue
      if (!task.demo) {
        const result = shared.publishScheduledSnooze(task)
        if (!result.ok) { report('站內提醒尚未成功儲存，系統通知未發送，稍後重試。', true); continue }
      }
      // Stationary permission state is never a reason to request permission.
      if (!settings.pushEnabled || loadPersisted(STORE_KEYS.notifications)?.pushEnabled === false || !support().ok || permission.value !== 'granted') {
        if (task.demo) { task.state = 'blocked'; saveTasks(tasks); report('未啟用通知或尚未授權，測試通知未發送。', true) }
        continue
      }
      item = items.getItem(task.itemId)
      if (!currentValid(task)) continue
      // Persist an at-most-once reservation before calling the external API.
      // A process crash between these steps is reported as uncertain, never replayed.
      task.state = 'attempted'
      saveTasks(tasks)
      try {
        await deliverBrowserNotification({ title: task.demo ? '補補｜10 秒測試提醒' : '補補｜延後提醒',
          body: `${items.getSpace(item.spaceId).name}的${item.name}已到提醒時間。`, tag: task.id,
          url: itemUrl(item.id), onClick: () => openItem(item.id),
          shouldSend: () => settings.pushEnabled && loadPersisted(STORE_KEYS.notifications)?.pushEnabled !== false && currentValid(task) })
        task.state = 'sent'
        report('通知已交給瀏覽器處理；若未看到，請檢查作業系統通知與勿擾設定。')
      } catch (cause) { task.state = 'failed'; task.failure = cause.message; report(cause.message, true) }
      // Failing this write leaves attempted on disk: do not duplicate the OS alert.
      saveTasks(tasks)
    }
    pendingDemoItems.value = tasks.filter(task => task.demo && task.state === 'scheduled').map(task => task.itemId)
    pendingDemo.value = pendingDemoItems.value.length > 0
  }
  async function tick() {
    if (busy) return
    busy = true
    support()
    try {
      if (!navigator.locks?.request) { report('此瀏覽器缺少安全的多分頁排程鎖，未啟用自動系統通知。請更新 Chrome 或 Safari。', true); return }
      await navigator.locks.request('bubu-native-reminders', { ifAvailable: true }, async lock => { if (lock) await process() })
    } catch (cause) { report(cause.message || '系統通知處理失敗。', true) }
    finally { busy = false }
  }
  async function demo(itemId) {
    if (!notificationDemoEnabled) return { ok: false }
    await tick()
    if (!support().ok || permission.value !== 'granted' || !settings.pushEnabled) {
      report('請先點擊「開啟系統通知」並啟用推播通知，才可安排測試。', true); return { ok: false }
    }
    const item = items.getItem(itemId)
    if (!canAccess(item) || !item.reminderSnoozes?.self) { report('請選擇仍在購買清單、尚未補貨且已開啟補貨提醒的用品進行測試。', true); return { ok: false } }
    if (!navigator.locks?.request) { report('此瀏覽器缺少多分頁排程鎖，無法安排測試。', true); return { ok: false } }
    try {
      await navigator.locks.request('bubu-native-reminders', async () => {
        const tasks = readTasks()
        if (tasks.some(task => task.demo && task.state === 'scheduled')) throw new Error('已有 10 秒測試等待中，請稍候。')
        tasks.push({ id: generateId(), itemId, spaceId: item.spaceId, fingerprint: reminderFingerprint(item),
          dueAt: Date.now() + 10000, createdAt: Date.now(), state: 'scheduled', demo: true,
          demoReminderSignature: JSON.stringify([item.reminderSnoozes?.self || null, item.reminderSnoozeOperationIds?.self || null]) })
        saveTasks(tasks)
      })
      report('已安排 10 秒測試，可切換至其他分頁；瀏覽器節流可能延遲，不會修改正式提醒日期。')
      return { ok: true }
    } catch (cause) { report(cause.message, true); return { ok: false } }
  }
  async function cancelDemo(itemId) {
    if (!navigator.locks?.request) { report('此瀏覽器無法安全取消測試，請更新瀏覽器。', true); return { ok: false } }
    try {
      await navigator.locks.request('bubu-native-reminders', async () => {
        const tasks = readTasks()
        const waiting = tasks.filter(task => task.demo && task.itemId === itemId && task.state === 'scheduled')
        if (!waiting.length) throw new Error('測試已開始交付或已結束，無法再取消。')
        for (const task of waiting) task.state = 'cancelled'
        saveTasks(tasks)
      })
      report('已取消測試通知。'); return { ok: true }
    } catch (cause) { report(cause.message, true); return { ok: false } }
  }
  function onMessage(event) {
    if (event.data?.type !== 'bubu-notification-click' || typeof event.data.url !== 'string') return
    try {
      const url = new URL(event.data.url)
      const prefix = `${import.meta.env.BASE_URL}items/`
      if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) return
      openItem(decodeURIComponent(url.pathname.slice(prefix.length)))
    } catch { report('無法開啟通知對應的用品。', true) }
  }
  function start(routerNavigate) {
    if (active) return
    active = true; navigate = routerNavigate; support()
    try { if (readTasks().some(task => task.state === 'attempted')) report('上次通知交付結果不確定，為避免重複不會自動重送。可用 10 秒測試檢查通知設定。', true) }
    catch (cause) { report(cause.message, true) }
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    window.addEventListener('storage', tick)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    interval = setInterval(tick, 1000)
    tick()
  }
  function stop() {
    active = false; clearInterval(interval)
    document.removeEventListener('visibilitychange', tick)
    window.removeEventListener('focus', tick)
    window.removeEventListener('storage', tick)
    navigator.serviceWorker?.removeEventListener('message', onMessage)
  }
  onScopeDispose(stop)
  return { message, error, permission, pendingDemo, pendingDemoItems, enable, support, demo, cancelDemo, tick, start, stop }
})
