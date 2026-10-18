// 品名使用通知建立時的快照，不隨後續用品編輯改寫歷史訊息。
export function restockNotificationMessage(spaceName, itemNames) {
  if (!itemNames.length) return `「${spaceName}」有用品該補貨了`
  if (itemNames.length === 1) return `「${spaceName}」的${itemNames[0]}該補貨了`
  const names = itemNames.length > 3 ? `${itemNames.slice(0, 2).join('、')}…` : itemNames.join('、')
  return `「${spaceName}」有 ${itemNames.length} 項用品該補貨：${names}`
}

export function notificationIcon(type) {
  return {
    'restock-due': 'fa-regular fa-bell',
    claimed: 'fa-regular fa-hand',
    takeover: 'fa-solid fa-arrow-right-arrow-left',
    restocked: 'fa-regular fa-circle-check',
  }[type] || 'fa-regular fa-bell'
}

export function memberNotificationMessage({ type, actorName, spaceName, itemNames }) {
  const verb = { claimed: '認領', takeover: '接手', restocked: '補貨' }[type]
  if (!verb || !actorName || !spaceName || !Array.isArray(itemNames) || !itemNames.length) return null
  const subject = `${actorName}已${verb}「${spaceName}」`
  return itemNames.length <= 2
    ? `${subject}的${itemNames.join('、')}。`
    : `${subject}${itemNames.length} 項用品。`
}
