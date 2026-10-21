// Notification click routing only. No cache, background timer, or push server.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    let url
    try { url = new URL(event.notification.data?.url, self.registration.scope) } catch { return }
    if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return
    const shoppingPath = new URL('shopping', self.registration.scope).pathname
    const oldItemPrefix = new URL('items/', self.registration.scope).pathname
    const legacyItem = url.pathname.startsWith(oldItemPrefix) && url.pathname.slice(oldItemPrefix.length) && !url.pathname.slice(oldItemPrefix.length).includes('/')
    if (!(url.pathname === shoppingPath && url.searchParams.get('notificationItem')) && !legacyItem) return
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = clients.find(client => client.url.startsWith(self.registration.scope))
    if (client) {
      await client.focus()
      client.postMessage({ type: 'bubu-notification-click', url: url.href })
    } else await self.clients.openWindow(url.href)
  })())
})
