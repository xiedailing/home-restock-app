import { getNextRestockDate } from '../models/item.js'
import { restockNotificationMessage, memberNotificationMessage } from './notificationCopy.js'
import { generateId } from './id.js'
// Explicit historical presentation records. Never perform claims, purchases or OS scheduling.
export function presentationNotifications(state, now = Date.now()) {
  const find = name => state.items.find(item => item.name === name)
  const tissues = find('衛生紙'), pads = find('衛生棉'), bags = find('垃圾袋')
  const spaceOf = item => state.spaces.find(space => space.id === item.spaceId)
  const personal = spaceOf(tissues), family = spaceOf(bags)
  const actor = family.members.find(member => member.id === bags.shoppingClaimantId)
  const dueEvent = `due:${personal.id}:${tissues.id}:${tissues.unitPeriodId}:${getNextRestockDate(tissues)}:recipient:self`
  const record = (type, item, message, age, extra = {}) => ({
    id: generateId(), type, source: 'demo', previewOnly: true,
    spaceId: item.spaceId, spaceName: spaceOf(item).name, itemIds: [item.id], itemNames: [item.name],
    recipientIds: ['self'], recipientState: { self: { read: false, seen: false } },
    createdAt: now - age, message, ...extra,
  })
  return {
    records: [
      record('restock-due', tissues, restockNotificationMessage(personal.name, [tissues.name]), 30000, { eventIds: [dueEvent], targets: [{ itemId: tissues.id, completionRecordIds: [] }] }),
      record('shopping-pending', pads, `「${spaceOf(pads).name}」的${pads.name}是否已購買？`, 60000),
      record('claimed', bags, memberNotificationMessage({ type: 'claimed', actorName: actor.name, spaceName: family.name, itemNames: [bags.name] }), 120000, { actorId: actor.id, actorName: actor.name }),
    ],
    pendingBatches: [], processedEventIds: [dueEvent], previewHistorySeeded: true,
  }
}
