import { shoppingNotificationTarget, shoppingNotificationUrl, parseShoppingNotificationUrl } from '../utils/shoppingNotificationTarget.js'
import { notificationDemoEligibility } from '../utils/notificationDemoEligibility.js'
import { allowsNotificationDemo, demoLinkRequested, restoreDemoSession, DEMO_SESSION_KEY } from '../utils/notificationDemoMode.js'
import { ref, computed, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import { useItemsStore } from './items'
import { useSharedNotificationsStore } from './sharedNotifications'
import { useNotificationSettingsStore } from './notificationSettings'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'
import { generateId } from '../utils/id.js'
import { reminderFingerprint, reminderEligible, syncReminderTasks, taskStillValid } from '../utils/nativeReminderTasks.js'
import { notificationSupport, requestBrowserNotifications, deliverBrowserNotification } from '../utils/browserNotifications.js'

const KEY = STORE_KEYS.nativeNotifications
export const useNativeNotificationsStore = defineStore('native-notifications', () => {
  const items = useItemsStore()
  const shared = useSharedNotificationsStore()
  const settings = useNotificationSettingsStore()
  const demoOriginAllowed = allowsNotificationDemo(location.origin)
  const demoSessionId = ref(restoreDemoSession(location.origin, undefined, globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type))
  const demoEnabled = computed(() => demoOriginAllowed && !!demoSessionId.value)
  const demoInvited = ref(demoLinkRequested(location.origin, location.search))
  const demoModeMessage = ref('')
  function captureDemoLink(search) {
    if (demoLinkRequested(location.origin, search)) demoInvited.value = true
  }
  function activateDemo({ userGesture = false } = {}) {
    if (demoEnabled.value) return { ok: true }
    if (!demoOriginAllowed || (!demoInvited.value && !userGesture)) return { ok: false }
    try {
      const id = generateId()
      sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ version: 1, origin: location.origin, id }))
      demoSessionId.value = id; demoModeMessage.value = ''
      return { ok: true }
    } catch { demoModeMessage.value = '無法保存展示狀態，未啟用展示。請允許此網站使用分頁儲存空間。'; return { ok: false } }
  }
  async function endDemo() {
    const sessionId = demoSessionId.value
    // Disable synchronously, including shouldSend after an awaited transport setup.
    demoSessionId.value = null; demoInvited.value = false
    try {
      sessionStorage.removeItem(DEMO_SESSION_KEY)
      if (!navigator.locks?.request) throw new Error('無法取得排程鎖，展示已停用；待發送測試不會由此分頁執行。')
      await navigator.locks.request('bubu-native-reminders', async () => {
        const tasks = readTasks()
        for (const task of tasks) if (task.demo && task.demoSessionId === sessionId && task.state === 'scheduled') task.state = 'cancelled'
        saveTasks(tasks)
      })
      demoFeedback.value = {}; demoModeMessage.value = '已結束展示並取消此分頁待發送的測試。'
      return { ok: true }
    } catch (cause) { demoModeMessage.value = cause.message; return { ok: false } }
  }
  const message = ref('')
  const error = ref(false)
  const messageItemId = ref(null)
  const permission = ref('default')
  const authorizationMessage = ref('')
  const demoFeedback = ref({})
  const deliveryFailure = ref(null)
  const snoozeSaves = new Map()
  const pendingDemo = ref(false)
  const pendingDemoItems = ref([])
  let interval
  let busy = false
  let active = false
  let navigate
  function report(text, failed = false, itemId = null) {
    message.value = text; error.value = failed; messageItemId.value = itemId
    if (itemId) demoFeedback.value = { ...demoFeedback.value, [itemId]: { message: text, error: failed } }
  }
  function clearDemoFeedback(itemId) {
    const next = { ...demoFeedback.value }; delete next[itemId]; demoFeedback.value = next
  }
  function support() {
    const result = notificationSupport()
    permission.value = result.permission || 'unsupported'
    return result
  }
  async function enable({ preservePush = false } = {}) {
    // No await before requesting permission: preserve Safari user activation.
    const result = await requestBrowserNotifications()
    const current = support()
    if (result.ok && current.permission !== 'granted') {
      const failed = { ok: false, message: '瀏覽器仍回報未允許通知，請檢查網站權限與作業系統設定；系統通知未啟用。' }
      authorizationMessage.value = failed.message
      report(failed.message, true); return failed
    }
    authorizationMessage.value = result.ok ? '' : result.message
    if (result.ok) { if (!preservePush) settings.setPushEnabled(true); report('已允許通知。請確認作業系統也允許瀏覽器通知，並關閉勿擾模式。') }
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
    if (task.demo && (!demoEnabled.value || task.demoSessionId !== demoSessionId.value)) return false
    if (task.demo && readTasks().find(entry => entry.id === task.id)?.state === 'cancelled') return false
    const item = items.getItem(task.itemId)
    if (!canAccess(item) || !taskStillValid(task, item, item && items.getSpace(item.spaceId), demoEnabled.value)) return false
    const persisted = loadPersisted(STORE_KEYS.items)
    const savedItem = persisted?.items?.find(item => item.id === task.itemId)
    const savedSpace = persisted?.spaces?.find(space => space.id === task.spaceId)
    return taskStillValid(task, savedItem, savedSpace, demoEnabled.value)
  }
  function openShopping(target) {
    // A fresh request key also handles repeated clicks before the first query is consumed.
    navigate?.({ ...target, query: { ...target.query, notificationRequest: generateId() } })
  }
  async function saveSnoozeAndScheduleDemo(itemId, date) {
    const key = JSON.stringify([itemId, date])
    if (snoozeSaves.has(key)) return snoozeSaves.get(key)
    const work = Promise.resolve().then(async () => {
      const saved = await items.withPersistenceLock(() => items.snoozeShoppingReminder(itemId, date))
      if (!saved.ok || !demoEnabled.value) return saved
      const result = await demo(itemId)
      if (result.ok) return { ...saved, demoResult: result }
      const reasons = {
        'reminder-off': '請先開啟此用品的補貨提醒。', unsaved: '延後日期尚未儲存。',
        permission: '尚未允許系統通知，請至提醒設定開啟。', 'push-off': '請先在提醒設定開啟推播通知。',
        'waiting-self': '此用品已有提醒等待發送。',
      }
      const pendingItem = items.getItem(result.otherItemId)
      const reason = result.code === 'waiting-other' ? `「${pendingItem?.name || '其他用品'}」仍有提醒等待發送。`
        : reasons[result.code] || result.message || demoFeedback.value[itemId]?.message || '此次系統通知未安排。'
      return { ...saved, demoResult: { ok: false, message: reason } }
    })
    snoozeSaves.set(key, work)
    try { return await work } finally { snoozeSaves.delete(key) }
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
    // Nonparticipating tabs validate source data, but never cancel a valid foreign session merely because Demo is off here.
    const persisted = loadPersisted(STORE_KEYS.items)
    const sourceItems = Array.isArray(persisted?.items) ? persisted.items : items.items
    const sourceSpace = id => Array.isArray(persisted?.spaces) ? persisted.spaces.find(space => space.id === id) : items.getSpace(id)
    const tasks = syncReminderTasks(oldTasks, sourceItems, sourceSpace, Date.now(), generateId)
    for (const task of tasks) {
      const item = sourceItems.find(item => item.id === task.itemId)
      if (task.state !== 'cancelled' && (!taskStillValid(task, item, item && sourceSpace(item.spaceId), demoOriginAllowed)
        || (task.demo && !task.demoSessionId))) task.state = 'cancelled'
    }
    if (JSON.stringify(tasks) !== JSON.stringify(oldTasks)) saveTasks(tasks)
    await closeInvalidTags(tasks.filter(task => task.state === 'cancelled').map(task => task.id))
    for (const task of tasks) {
      if (task.state !== 'scheduled' || task.dueAt > Date.now()) continue
      if (task.demo && (!demoEnabled.value || task.demoSessionId !== demoSessionId.value)) continue
      let item = items.getItem(task.itemId)
      if (!taskStillValid(task, item, item && items.getSpace(item.spaceId), demoEnabled.value) || !canAccess(item)) continue
      if (!currentValid(task)) continue
      if (!task.demo) {
        const result = shared.publishScheduledSnooze(task)
        if (!result.ok) { report('站內提醒尚未成功儲存，系統通知未發送，稍後重試。', true); continue }
      }
      // Stationary permission state is never a reason to request permission.
      if (!settings.pushEnabled || loadPersisted(STORE_KEYS.notifications)?.pushEnabled === false || !support().ok || permission.value !== 'granted') {
        if (task.demo) { task.state = 'blocked'; saveTasks(tasks); report('未啟用通知或尚未授權，測試通知未發送。', true, task.itemId); deliveryFailure.value = { id: task.id, message: '系統通知未發送，請確認通知權限與推播設定。' } }
        continue
      }
      item = items.getItem(task.itemId)
      if (!currentValid(task)) continue
      // Persist an at-most-once reservation before calling the external API.
      // A process crash between these steps is reported as uncertain, never replayed.
      task.state = 'attempted'
      saveTasks(tasks)
      const clickTarget = shoppingNotificationTarget(item.id, item.spaceId, items.getSpace(item.spaceId)?.shared, item.shoppingClaimantId)
      try {
        await deliverBrowserNotification({ title: '補補',
          body: `「${items.getSpace(item.spaceId).name}」的 ${item.name}已到提醒時間！`, tag: task.id,
          url: shoppingNotificationUrl(item, items.getSpace(item.spaceId), import.meta.env.BASE_URL, location.origin),
          onClick: () => openShopping(clickTarget),
          shouldSend: () => settings.pushEnabled && loadPersisted(STORE_KEYS.notifications)?.pushEnabled !== false && currentValid(task) })
        task.state = 'sent'
        report('通知已交給瀏覽器處理；若未看到，請檢查作業系統通知與勿擾設定。', false, task.demo ? task.itemId : null)
      } catch (cause) { task.state = 'failed'; task.failure = cause.message; report(cause.message, true, task.demo ? task.itemId : null); deliveryFailure.value = { id: task.id, message: cause.message } }
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
  function demoEligibility(itemId, pendingItemIds = pendingDemoItems.value) {
    const item = items.getItem(itemId)
    const space = item && items.getSpace(item.spaceId)
    const persisted = loadPersisted(STORE_KEYS.items)
    const savedItem = persisted?.items?.find(entry => entry.id === itemId)
    const savedSpace = persisted?.spaces?.find(entry => entry.id === item?.spaceId)
    const eligibility = notificationDemoEligibility({ item, space,
      accessible: !space?.shared || items.getSpaceMembers(space.id).some(member => member.id === 'self'),
      pendingItemIds, enabled: demoEnabled.value, permission: permission.value,
      supported: permission.value !== 'unsupported', pushEnabled: settings.pushEnabled && loadPersisted(STORE_KEYS.notifications)?.pushEnabled !== false,
      locksAvailable: !!navigator.locks?.request })
    if (!eligibility.ok) return eligibility
    if (item && (!savedItem || !savedSpace || !reminderEligible(savedItem, savedSpace)
      || reminderFingerprint(item) !== reminderFingerprint(savedItem)
      || JSON.stringify([item.reminderSnoozes?.self, item.reminderSnoozeOperationIds?.self]) !== JSON.stringify([savedItem.reminderSnoozes?.self, savedItem.reminderSnoozeOperationIds?.self]))) {
      return { ok: false, code: 'stale-items', message: '用品資料已更新，請重新載入後再操作。' }
    }
    return eligibility
  }
  async function demo(itemId) {
    if (!demoEnabled.value) return { ok: false }
    const flushed = await items.flushPersistence()
    if (!flushed.ok) { report(flushed.error.message, true, itemId); return { ok: false, code: flushed.error.code, message: flushed.error.message } }
    await tick()
    const eligibility = demoEligibility(itemId)
    if (!eligibility.ok) { report(eligibility.message, true, itemId); return eligibility }
    try {
      await navigator.locks.request('bubu-native-reminders', async () => {
        const committed = await items.withPersistenceLock(() => {
          const tasks = readTasks()
          const latest = demoEligibility(itemId, tasks.filter(task => task.demo && task.state === 'scheduled').map(task => task.itemId))
          if (!latest.ok) throw new Error(latest.message)
          const item = items.getItem(itemId)
          tasks.push({ id: generateId(), itemId, spaceId: item.spaceId, fingerprint: reminderFingerprint(item),
            dueAt: Date.now() + 5000, createdAt: Date.now(), state: 'scheduled', demo: true, demoSessionId: demoSessionId.value,
            demoReminderSignature: JSON.stringify([item.reminderSnoozes?.self || null, item.reminderSnoozeOperationIds?.self || null]) })
          saveTasks(tasks)
          return { ok: true }
        })
        if (!committed.ok) throw new Error(committed.error.message)
      })
      report('已安排 5 秒測試，可切換至其他分頁；瀏覽器節流可能延遲，不會修改正式提醒日期。', false, itemId)
      return { ok: true }
    } catch (cause) { report(cause.message, true, itemId); return { ok: false } }
  }
  async function cancelDemo(itemId, feedbackItemId = itemId) {
    if (!demoEnabled.value) return { ok: false }
    if (!navigator.locks?.request) { report('此瀏覽器無法安全取消測試，請更新瀏覽器。', true, feedbackItemId); return { ok: false } }
    try {
      await navigator.locks.request('bubu-native-reminders', async () => {
        const tasks = readTasks()
        const waiting = tasks.filter(task => task.demo && task.itemId === itemId && task.state === 'scheduled')
        if (!waiting.length) throw new Error('測試已開始交付或已結束，無法再取消。')
        for (const task of waiting) task.state = 'cancelled'
        saveTasks(tasks)
      })
      report('已取消測試通知。', false, feedbackItemId); return { ok: true }
    } catch (cause) { report(cause.message, true, feedbackItemId); return { ok: false } }
  }
  function onMessage(event) {
    if (event.data?.type !== 'bubu-notification-click' || typeof event.data.url !== 'string') return
    const target = parseShoppingNotificationUrl(event.data.url, import.meta.env.BASE_URL, location.origin)
    if (target) { openShopping(target); return }
    // Backward compatibility for notifications already delivered by older versions.
    try {
      const url = new URL(event.data.url)
      const prefix = `${import.meta.env.BASE_URL}items/`
      if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) return
      const id = decodeURIComponent(url.pathname.slice(prefix.length))
      if (!id || id.includes('/')) return
      const item = items.getItem(id)
      openShopping(shoppingNotificationTarget(id, item?.spaceId, items.getSpace(item?.spaceId)?.shared, item?.shoppingClaimantId))
    } catch { report('無法開啟通知對應的用品。', true) }
  }

  function start(routerNavigate) {
    if (active) return
    active = true; navigate = routerNavigate; support()
    try { if (readTasks().some(task => task.state === 'attempted')) report('上次通知交付結果不確定，為避免重複不會自動重送。可用 5 秒測試檢查通知設定。', true) }
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
  return { demoEnabled, demoInvited, demoModeMessage, activateDemo, endDemo, captureDemoLink, message, error, messageItemId, permission, authorizationMessage, demoFeedback, deliveryFailure, saveSnoozeAndScheduleDemo, clearDemoFeedback, demoEligibility, pendingDemo, pendingDemoItems, enable, support, demo, cancelDemo, tick, start, stop }
})
