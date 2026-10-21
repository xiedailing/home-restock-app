export const DEMO_PREVIEW_ORIGIN = 'https://home-restock-app-git-feature-native-browser-n-f5352f-xiedailing.vercel.app'
export const DEMO_PRODUCTION_ORIGIN = 'https://home-restock-app.vercel.app'
export const DEMO_SESSION_KEY = 'bubu:notification-demo-session:v1'
// Exact origin only. Neither build flags nor saved state can override this gate.
export function allowsNotificationDemo(origin) {
  return origin === DEMO_PREVIEW_ORIGIN || origin === DEMO_PRODUCTION_ORIGIN
}
export function demoLinkRequested(origin, search) {
  return allowsNotificationDemo(origin) && new URLSearchParams(search).get('notificationDemo') === '1'
}
export function restoreDemoSession(origin, storage, navigationType) {
  if (!allowsNotificationDemo(origin)) return null
  try {
    const source = storage ?? globalThis.sessionStorage
    // A newly navigated tab may inherit its opener's sessionStorage. Require a
    // fresh click there; only reload/history restoration may reuse the grant.
    if (navigationType === 'navigate') { source.removeItem(DEMO_SESSION_KEY); return null }
    const value = JSON.parse(source.getItem(DEMO_SESSION_KEY))
    return value?.origin === origin && value.version === 1 && typeof value.id === 'string' && value.id ? value.id : null
  } catch { return null }
}
