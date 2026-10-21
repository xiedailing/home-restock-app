// One deep-link contract for native notifications and ShoppingView.
export function shoppingNotificationTarget(itemId, spaceId, shared = false, claimantId = null) {
  shared = shared && claimantId !== 'self'
  return { name: 'shopping', query: { tab: shared ? 'shared' : 'personal',
    ...(shared && spaceId ? { space: spaceId } : {}), notificationItem: itemId,
    ...(spaceId ? { notificationSpace: spaceId } : {}) } }
}
export function shoppingNotificationUrl(item, space, base, origin) {
  const target = shoppingNotificationTarget(item.id, item.spaceId, !!space?.shared, item.shoppingClaimantId)
  const url = new URL(`${base}shopping`, origin)
  url.search = new URLSearchParams(target.query).toString()
  return url.href
}
export function parseShoppingNotificationUrl(value, base, origin) {
  try {
    const url = new URL(value, origin)
    if (url.origin !== origin || url.pathname !== `${base}shopping`) return null
    const itemId = url.searchParams.get('notificationItem')
    const tab = url.searchParams.get('tab')
    if (!itemId || !['personal', 'shared'].includes(tab)) return null
    const spaceId = url.searchParams.get('notificationSpace') || ''
    if (tab === 'shared' && (!spaceId || url.searchParams.get('space') !== spaceId)) return null
    return shoppingNotificationTarget(itemId, spaceId, tab === 'shared')
  } catch { return null }
}
export function resolveShoppingNotification(item, space, expectedSpace, accessible = true) {
  if (!item) return { ok: false, message: '此用品已不存在。' }
  if (!space || !accessible) return { ok: false, message: '此空間已不存在或你已退出，無法查看用品。' }
  if (expectedSpace && item.spaceId !== expectedSpace) return { ok: false, message: '用品所屬空間已變更，無法定位原通知。' }
  if (item.shoppingCompletedAt != null) return { ok: true, completed: true, message: '此用品已補貨，無法展開。' }
  if (!item.inShoppingList) return { ok: false, message: '此用品已移出購買清單。' }
  return { ok: true, completed: false }
}
