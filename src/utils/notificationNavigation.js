// Navigation decisions are read-only; historical text and restock state never change here.
export function notificationDestination(entry, items) {
  const space = items.getSpace(entry.spaceId)
  if (!space?.shared) return { message: '此空間已不存在或無法查看' }
  const ids = entry.itemIds ?? entry.targets?.map(target => target.itemId)
  // Old notices without IDs can still open their space; absence of IDs is not proof of deletion.
  const deleted = Array.isArray(ids) && ids.length ? ids.filter(id => items.getItem(id)?.spaceId !== entry.spaceId).length : 0
  if (deleted && deleted === ids.length) return { message: '此通知的用品皆已刪除' }
  return {
    route: ['restock-due', 'restocked'].includes(entry.type)
      ? { name: 'inventory' } : { name: 'shopping', query: { tab: 'shared', space: entry.spaceId } },
    inventorySpaceId: ['restock-due', 'restocked'].includes(entry.type) ? entry.spaceId : null,
    message: deleted ? '此通知有部分用品已刪除' : null,
  }
}
