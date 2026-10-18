// Explicit development-only history fixtures. Never change Items/Catalog or create real member operations.
import { memberNotificationMessage, restockNotificationMessage } from './notificationCopy.js'
import { notificationCutoff } from './notificationRetention.js'
export function previewNotificationHistory(spaces, items, now = Date.now()) {
  const shared = spaces.filter(space => space.shared)
  if (!shared.length) return []
  const ages = [1, 2, 4, 7, 14, 28, 45, 60, 90, 120, 150, 170]
  const types = ['restock-due', 'claimed', 'takeover', 'restocked']
  return ages.map((days, index) => {
    const space = shared[index % shared.length]
    const actual = items.filter(item => item.spaceId === space.id)
    const available = [...actual, ...['衛生紙', '洗衣精', '垃圾袋', '酒精', '洗碗精'].filter(name => !actual.some(item => item.name === name))
      .map((name, i) => ({ id: `preview-history-missing:${space.id}:${i}`, name }))]
    const chosen = available.slice(0, [1, 2, 5][Math.floor(index / 4)])
    const itemNames = chosen.map(item => item.name)
    const type = types[index % types.length]
    const actor = space.members?.find(member => member.id !== 'self')
    const actorId = actor?.id ?? 'preview-history-member'
    const actorName = actor?.name ?? '小明'
    const createdAt = now - days * 86400000
    return { id: `preview-history-v2:${index}`, source: 'demo', previewOnly: true, type,
      spaceId: space.id, spaceName: space.name, ...(type !== 'restock-due' ? { actorId, actorName } : {}),
      itemIds: chosen.map(item => item.id), itemNames, recipientIds: ['self'], createdAt,
      recipientState: { self: { seen: index % 3 === 0, read: index % 3 === 0 } },
      message: type === 'restock-due' ? restockNotificationMessage(space.name, itemNames)
        : memberNotificationMessage({ type, spaceName: space.name, actorName, itemNames }) }
  }).filter(entry => entry.createdAt >= notificationCutoff(now))
}
