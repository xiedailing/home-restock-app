// Local calendar time; old date-only reminders default to 08:00.
export function reminderTime(date, time = '08:00') {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const at = new Date(y, m - 1, d, hour, minute)
  return at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d ? at.getTime() : null
}
export function reminderFingerprint(item) {
  return JSON.stringify([item.spaceId, item.unitPeriodId, item.addedToShoppingListDate,
    (item.restockRecords || []).map(record => [record.id, record.date, record.quantity, record.unit])])
}
export function reminderEligible(item, space) {
  return !!item && !!space && item.inShoppingList === true && item.shoppingCompletedAt == null && item.reminderEnabled !== false
}
export function snoozeObsolete(item, date) {
  return !!date && ((item.addedToShoppingListDate && item.addedToShoppingListDate >= date)
    || (item.restockRecords || []).some(record => record.date >= date))
}
export function taskStillValid(task, item, space, demoEnabled = false) {
  return reminderEligible(item, space) && task.fingerprint === reminderFingerprint(item)
    && (task.demo ? demoEnabled && (!Object.hasOwn(task, 'demoReminderSignature')
      || task.demoReminderSignature === JSON.stringify([item.reminderSnoozes?.self || null, item.reminderSnoozeOperationIds?.self || null])) : !snoozeObsolete(item, task.date) && item.reminderSnoozes?.self === task.date
      && task.dueAt === reminderTime(task.date, item.reminderSnoozeTimes?.self || '08:00')
      && (task.operationId || null) === (item.reminderSnoozeOperationIds?.self || null))
}
// No mutation: the caller must persist before publishing or dispatching anything.
export function syncReminderTasks(previous, items, getSpace, now, makeId) {
  const tasks = previous.map(task => ({ ...task }))
  for (const task of tasks) {
    if (task.demo || task.state === 'cancelled') continue
    const item = items.find(item => item.id === task.itemId)
    if (!taskStillValid(task, item, item && getSpace(item.spaceId))) task.state = 'cancelled'
  }
  for (const item of items) {
    const date = item.reminderSnoozes?.self
    const dueAt = reminderTime(date, item.reminderSnoozeTimes?.self || '08:00')
    if (!dueAt || snoozeObsolete(item, date) || !reminderEligible(item, getSpace(item.spaceId))) continue
    // Keep invalidated generations as tombstones: restocking must not resurrect
    // an old date on re-entry to the list. A changed date creates a new event.
    const previousTask = tasks.filter(task => !task.demo && task.itemId === item.id).at(-1)
    if (previousTask?.date === date && previousTask.dueAt === dueAt && (previousTask.operationId || null) === (item.reminderSnoozeOperationIds?.self || null)) continue
    tasks.push({ id: makeId(), itemId: item.id, spaceId: item.spaceId, date, dueAt,
      operationId: item.reminderSnoozeOperationIds?.self || null, fingerprint: reminderFingerprint(item), state: 'scheduled', createdAt: now })
  }
  return tasks
}
