export function notificationSupport(env = globalThis) {
  if (!env.isSecureContext) return { ok: false, message: '系統通知需要 HTTPS 或 localhost，請使用安全連線。' }
  if (!env.Notification) return { ok: false, message: '此瀏覽器不支援系統通知。iPhone／iPad 需加入主畫面，背景通知另需 Web Push。' }
  return { ok: true, permission: env.Notification.permission }
}
export async function requestBrowserNotifications(env = globalThis) {
  const support = notificationSupport(env)
  if (!support.ok) return support
  try {
    // Call directly from a user's click; never on startup or from a timer.
    const permission = await env.Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, permission, message: permission === 'denied'
      ? '通知已被封鎖，請在瀏覽器的網站設定中允許通知。' : '尚未允許通知，不會發送系統通知。' }
    return { ok: true, permission }
  } catch { return { ok: false, message: '無法取得通知權限，請檢查瀏覽器與作業系統通知設定。' } }
}
export async function deliverBrowserNotification({ title, body, tag, url, onClick, shouldSend = () => true }, env = globalThis) {
  const support = notificationSupport(env)
  if (!support.ok) throw new Error(support.message)
  if (support.permission !== 'granted') throw new Error('未取得通知權限，系統通知未發送。')
  const options = { body, tag, icon: `${import.meta.env.BASE_URL}notification-icon.png`, data: { url } }
  // Persistent notifications are preferred, including Chrome mobile. This worker
  // only handles clicks; it is deliberately NOT a background alarm scheduler.
  if (env.navigator?.serviceWorker) {
    let registration
    try {
      registration = await env.navigator.serviceWorker.register(`${import.meta.env.BASE_URL}bubu-notifications-sw.js`)
      if (!registration.active) await new Promise((resolve, reject) => {
        const worker = registration.installing || registration.waiting
        if (!worker) return reject(new Error('通知服務尚未就緒，請稍後重試。'))
        const timer = setTimeout(() => { worker.removeEventListener('statechange', changed); reject(new Error('通知服務啟動逾時。')) }, 10000)
        function changed() {
          if (worker.state === 'activated') { clearTimeout(timer); worker.removeEventListener('statechange', changed); resolve() }
          else if (worker.state === 'redundant') { clearTimeout(timer); worker.removeEventListener('statechange', changed); reject(new Error('通知服務啟動失敗。')) }
        }
        worker.addEventListener('statechange', changed)
        changed()
      })
    } catch { registration = null }
    if (registration?.active && registration.showNotification) {
      if (!shouldSend()) throw new Error('提醒已取消或用品狀態已變更，未發送系統通知。')
      await registration.showNotification(title, options)
      return
    }
  }
  // macOS Safari/desktop fallback. Constructor success alone is not delivery.
  await new Promise((resolve, reject) => {
    let notification
    if (!shouldSend()) { reject(new Error('提醒已取消或用品狀態已變更，未發送系統通知。')); return }
    try { notification = new env.Notification(title, options) } catch { reject(new Error('此瀏覽器無法建立系統通知。手機可能需要主畫面 Web App 與通知服務。')); return }
    const timer = setTimeout(() => { notification.close(); reject(new Error('瀏覽器未確認通知建立，請檢查系統通知設定。')) }, 10000)
    notification.onshow = () => { clearTimeout(timer); resolve() }
    notification.onerror = () => { clearTimeout(timer); reject(new Error('系統通知建立失敗，請檢查權限與系統通知設定。')) }
    notification.onclick = () => { env.focus?.(); onClick?.(); notification.close() }
  })
}
