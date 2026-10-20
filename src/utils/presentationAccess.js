import { allowsNotificationDemo } from './notificationDemoMode.js'
export const PRESENTATION_ACCESS_LOCK = 'bubu-presentation-data-access'
// 一般 Preview 分頁在整個生命週期持有共享鎖；初始化頁不載入 stores。
export async function withPresentationExclusive(operation, env = globalThis) {
  if (!allowsNotificationDemo(env.location.origin)) throw new Error('此網址不允許初始化展示資料。')
  if (!env.navigator.locks?.request) throw new Error('此瀏覽器不支援安全初始化，請使用支援 Web Locks 的電腦瀏覽器。')
  return env.navigator.locks.request(PRESENTATION_ACCESS_LOCK, { mode: 'exclusive', ifAvailable: true }, lock => {
    if (!lock) throw new Error('請先關閉其他補補分頁，再重試。')
    return operation()
  })
}
export function holdPresentationAccess(mount, env = globalThis) {
  if (!allowsNotificationDemo(env.location.origin) || !env.navigator.locks?.request) return mount()
  return env.navigator.locks.request(PRESENTATION_ACCESS_LOCK, { mode: 'shared' }, async () => {
    let release
    const done = new Promise(resolve => { release = resolve })
    env.addEventListener('pagehide', release, { once: true })
    env.addEventListener('pageshow', event => { if (event.persisted) env.location.reload() })
    await mount()
    await done
  })
}
