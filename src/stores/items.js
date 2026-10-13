import { computed, ref, shallowRef, toRaw } from 'vue'
import { defineStore } from 'pinia'
import { generateId } from '../utils/id.js'
import { profile } from './profile'
import { SYSTEM_CATEGORIES, PRESET_ITEMS, getItemCategory } from '../models/itemCategories'
import { SPACE_COLORS, limitSpaceName } from '../models/space'
import {
  DEFAULT_SPACES,
  DEFAULT_SPACE_ID,
  calcDaysPerUnit,
  calcNextRestockDate,
  createItem,
  createRestockRecord,
  createSampleItems,
  daysUntil,
  getLatestRecord,
  getStatus,
  isSnoozed,
  SNOOZE_DAYS,
  STATUS,
  addDays,
  toDateString,
} from '../models/item'

// 刪除後可復原的時間，與 Toast 顯示時間相同。
export const UNDO_DURATION_MS = 5000

export const useItemsStore = defineStore('items', () => {
  const items = ref(createSampleItems())
  const customCategories = ref([])
  const systemCategoryCounts = computed(() => SYSTEM_CATEGORIES.map(name => ({ name, count: items.value.filter(item => getItemCategory(item) === name).length })))
  const customCategoryCounts = computed(() => {
    const names = new Set([...customCategories.value, ...items.value.map(getItemCategory).filter(name => name && !SYSTEM_CATEGORIES.includes(name))])
    return Array.from(names, name => ({ name, count: items.value.filter(item => getItemCategory(item) === name).length }))
  })
  const categoryOptions = computed(() => [...SYSTEM_CATEGORIES, ...customCategoryCounts.value.map(category => category.name)])
  function addCategory(value) {
    const name = value.trim()
    if (!name || limitSpaceName(name) !== name) return { ok: false, message: '請輸入最多 8 個中文字或 16 個英文字母的分類名稱。' }
    if ([...SYSTEM_CATEGORIES, ...customCategoryCounts.value.map(category => category.name)].includes(name)) return { ok: false, message: '已有重複分類名稱' }
    customCategories.value.push(name)
    return { ok: true }
  }
  function removeCategories(names) {
    const selected = new Set(names.filter(name => !SYSTEM_CATEGORIES.includes(name)))
    customCategories.value = customCategories.value.filter(name => !selected.has(name))
    items.value = items.value.filter(item => !selected.has(getItemCategory(item)))
  }
  const spaces = ref(DEFAULT_SPACES.map((space) => ({ ...space, ownerId: 'self', members: [] })))
  // 展示生活日用品中，同名用品分屬不同空間的標籤效果。
  const previewSpaces = [
    { id: 'preview-family', name: '家庭', shared: true, color: 'blue' },
    { id: 'preview-company', name: '公司', shared: true, color: 'orange' },
    { id: 'preview-travel', name: '旅行', shared: false, color: 'red' },
  ]
  spaces.value.push(...previewSpaces.map(space => ({ ...space, ownerId: 'self', members: [] })))
  for (const space of previewSpaces) {
    items.value.push(
      createItem({ name: '垃圾袋', iconKey: 'trash-bags', category: '生活日用品', unit: '包', spaceId: space.id, reminderEnabled: false }),
      createItem({ name: '衛生紙', iconKey: 'tissues', category: '生活日用品', unit: '包', spaceId: space.id, reminderEnabled: false }),
    )
  }

  // 購買清單展示：目前使用者可接手小明已認購的家庭用品。
  const takeoverPreviewSpace = spaces.value.find(space => space.id === 'preview-family')
  takeoverPreviewSpace.members.push({ id: 'preview-xiaoming', name: '小明' })
  const takeoverPreviewItem = items.value.find(item => item.spaceId === 'preview-family' && item.name === '垃圾袋')
  Object.assign(takeoverPreviewItem, { inShoppingList: true, quantity: 2, addedToShoppingListDate: toDateString(), shoppingClaimantId: 'preview-xiaoming' })

  // 模擬其他成員仍持有的空間資料，不提供目前使用者的列表存取。
  const departedSpaces = ref([])
  // 我的用品目前的空間篩選（null ＝ 所有用品）；新增用品頁依此預帶空間，不持久化。
  const inventorySpaceId = ref(null)
  // 最近一次刪除（不做 stack）：我的用品與用品詳情共用，讓詳情刪除後回到我的用品仍可復原（specs/003 DET-20）。
  // shallowRef：snapshot 保持非 Proxy，復原時 structuredClone 才不會失敗。
  const recentlyRemoved = shallowRef(null) // { item, index, spaceName, expiresAt }

  // 響應式的「今天」（specs/003 KI-01）：跨過午夜或回到前景時更新，狀態、延後與剩餘天數隨之重算。
  // 電腦休眠時計時器可能延遲，回到前景時再檢查一次。
  const today = ref(toDateString())
  let midnightTimer
  function refreshToday() {
    const now = new Date()
    const value = toDateString(now)
    if (today.value !== value) today.value = value
    clearTimeout(midnightTimer)
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    midnightTimer = setTimeout(refreshToday, nextMidnight - now + 1000)
  }
  refreshToday()
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshToday()
    })
  }

  const itemsWithStatus = computed(() =>
    items.value.map((item) => ({ ...item, status: getStatus(item, today.value) })),
  )
  const shoppingList = computed(() => items.value.filter((item) => item.inShoppingList))
  // 首頁補貨提醒（specs/004 FR-401）：補貨時間已過在前、過期越久越前，接著該補貨了、剩餘天數越少越前。
  // 延後中的用品不列出（specs/005 FR-503）。
  // daysLeft 已過期為負數，遞增排序即可；sort 為穩定排序，同天數維持新增順序。
  const restockReminders = computed(() =>
    itemsWithStatus.value
      .filter((item) => (item.status === STATUS.OVERDUE || item.status === STATUS.DUE_SOON) && !isSnoozed(item, today.value))
      .map((item) => ({ ...item, daysLeft: daysUntil(item.nextRestockDate, today.value) }))
      .sort((a, b) => a.daysLeft - b.daysLeft),
  )

  function getItem(id) {
    return items.value.find((item) => item.id === id)
  }

  function addItem(input) {
    const preset = PRESET_ITEMS.find(option => option.iconKey === input.iconKey)
    const item = createItem({ ...input, category: input.category ?? preset?.category })
    items.value.push(item)
    return item
  }

  function updateItem(id, changes) {
    const item = getItem(id)
    if (!item) return
    Object.assign(item, changes, { updatedAt: new Date().toISOString() })
  }

  // 與 store 脫鉤的完整複本；toRaw 讓巢狀陣列也不是 Proxy，structuredClone 才不會失敗。
  function snapshotItem(id) {
    const item = getItem(id)
    return item ? structuredClone(toRaw(item)) : null
  }

  // 以 snapshotItem 的結果還原整筆用品（各種「復原」共用）。
  function restoreItem(snapshot) {
    const item = getItem(snapshot.id)
    if (item) Object.assign(item, structuredClone(snapshot))
  }

  function removeItem(id) {
    const index = items.value.findIndex((item) => item.id === id)
    if (index < 0) return
    const snapshot = snapshotItem(id)
    recentlyRemoved.value = {
      item: snapshot,
      index,
      spaceName: getSpace(snapshot.spaceId)?.name ?? '未指定空間',
      expiresAt: Date.now() + UNDO_DURATION_MS,
    }
    items.value.splice(index, 1)
  }

  // 放回原本的位置，保留 id、紀錄與時間戳記。
  function undoRemoveItem() {
    const removed = recentlyRemoved.value
    if (!removed) return
    recentlyRemoved.value = null
    if (getItem(removed.item.id)) return
    items.value.splice(Math.min(removed.index, items.value.length), 0, structuredClone(removed.item))
  }

  function clearRecentlyRemoved() {
    recentlyRemoved.value = null
  }

  // 001 FR-006：加入時待買數量 1；移出時清除。加入時一併取消延後（specs/005 SNZ-04）。
  function addToShoppingList(id) {
    updateItem(id, { inShoppingList: true, quantity: 1, addedToShoppingListDate: toDateString(), snoozedUntil: null, shoppingCompletedAt: null, shoppingCompletedQuantity: null, shoppingCompletedBy: null, shoppingClaimantId: null })
  }

  // 首頁多選批次加入（specs/004 FR-405）。
  function addManyToShoppingList(ids) {
    ids.forEach(addToShoppingList)
  }

  function removeFromShoppingList(id) {
    updateItem(id, { inShoppingList: false, quantity: null, addedToShoppingListDate: null })
  }

  // 001 FR-005：關閉提醒只改開關，保留日期與計算基準，Toast 復原時直接還原。
  // 同時取消「暫時不用補貨」的延後（001 D5-4）。
  function disableReminder(id) {
    updateItem(id, { reminderEnabled: false, snoozedUntil: null })
  }

  // specs/005 FR-502：只記錄延後到期日，預計補貨日與計算基準不變。
  function snoozeReminder(id) {
    updateItem(id, { snoozedUntil: addDays(toDateString(), SNOOZE_DAYS) })
  }

  // 001 FR-005：開啟提醒時以（今天，庫存量）重新建立計算基準。
  function enableReminder(id, { quantity, nextRestockDate }) {
    const today = toDateString()
    updateItem(id, {
      reminderEnabled: true,
      nextRestockDate,
      reminderBaseDate: today,
      reminderBaseQuantity: quantity,
      daysPerUnit: calcDaysPerUnit(nextRestockDate, today, quantity),
      reminderEnabledDate: today,
      reminderEnabledQuantity: quantity,
      snoozedUntil: null,
    })
  }

  // 001 FR-002（D1-a）：只改日期；以原基準日與基準數量重算每單位可撐天數。
  function updateNextRestockDate(id, nextRestockDate) {
    const item = getItem(id)
    if (!item) return
    updateItem(id, {
      nextRestockDate,
      daysPerUnit: calcDaysPerUnit(nextRestockDate, item.reminderBaseDate, item.reminderBaseQuantity),
      snoozedUntil: null,
    })
  }

  // 重算依據：最新一筆，且不早於最近一次開啟提醒的日期（specs/003 DET-03）。
  function getBasisRecord(item, records) {
    const latest = getLatestRecord(records)
    if (!latest || (item.reminderEnabledDate && latest.date < item.reminderEnabledDate)) return null
    return latest
  }

  // 套用新的紀錄清單：上次補貨日一律等於最新一筆；重算依據改變或被修改時，提醒開啟才重算
  //（001 FR-003、FR-004）。修改較舊紀錄、補登較早日期、沒有重算依據時，保留目前日期。
  function applyRestockRecords(id, records, extraChanges = {}) {
    const item = getItem(id)
    if (!item) return
    // 從 reactive 陣列取出的紀錄是 Proxy；存成原始物件，snapshotItem 的 structuredClone 才不會失敗。
    const restockRecords = records.map((record) => ({ ...toRaw(record) }))
    const changes = { restockRecords, lastRestockDate: getLatestRecord(restockRecords)?.date ?? null, ...extraChanges }
    const before = getBasisRecord(item, item.restockRecords)
    const after = getBasisRecord(item, restockRecords)
    const basisChanged = after && (after.id !== before?.id || after.date !== before.date || after.quantity !== before.quantity)
    if (item.reminderEnabled && item.daysPerUnit !== null && basisChanged) {
      Object.assign(changes, {
        nextRestockDate: calcNextRestockDate(after.date, after.quantity, item.daysPerUnit),
        reminderBaseDate: after.date,
        reminderBaseQuantity: after.quantity,
        // 預計補貨日已重算，舊的延後沒有意義（specs/005 SNZ-04）。
        snoozedUntil: null,
      })
    }
    updateItem(id, changes)
  }

  // 001 FR-003：新增紀錄、移出購買清單並清除待買數量。
  function completeRestock(id, { date = toDateString(), quantity = 1 } = {}) {
    const item = getItem(id)
    if (!item) return
    applyRestockRecords(id, [...item.restockRecords, createRestockRecord({ date, quantity })], {
      inShoppingList: false,
      quantity: null,
      addedToShoppingListDate: null,
      snoozedUntil: null,
    })
  }

  // 購買清單完成後保留展示 24 小時；用品本身與補貨紀錄不刪除。
  const shoppingCompletionOperations = new Map()
  const shoppingFields = ['inShoppingList', 'quantity', 'addedToShoppingListDate', 'shoppingCompletedAt', 'shoppingCompletedQuantity', 'shoppingCompletedBy', 'shoppingClaimantId']
  const restockReminderFields = ['nextRestockDate', 'reminderBaseDate', 'reminderBaseQuantity', 'snoozedUntil']
  function pickShoppingFields(item, fields) {
    return Object.fromEntries(fields.map(key => [key, item[key]]))
  }
  function undoShoppingOperation(operation) {
    if (!operation) return
    const item = getItem(operation.id)
    if (!item) return
    const changes = {}
    for (const key of Object.keys(operation.before)) {
      // 後續操作已改過的欄位保留，不以舊值覆蓋。
      if (Object.is(item[key], operation.after[key])) changes[key] = operation.before[key]
    }
    if (operation.recordId) {
      const records = item.restockRecords.filter(record => record.id !== operation.recordId)
      applyRestockRecords(item.id, records, changes)
      if (shoppingCompletionOperations.get(item.id) === operation) shoppingCompletionOperations.delete(item.id)
    } else {
      updateItem(item.id, changes)
    }
  }
  function completeShoppingItem(id, completedAt = Date.now()) {
    const item = getItem(id)
    if (!item?.inShoppingList) return
    if (getSpace(item.spaceId)?.shared && item.shoppingClaimantId !== 'self') return
    const fields = [...shoppingFields, ...restockReminderFields]
    const before = pickShoppingFields(item, fields)
    const quantity = item.quantity ?? 1
    completeRestock(id, { quantity })
    const recordId = item.restockRecords.at(-1).id
    updateItem(id, { shoppingCompletedAt: completedAt, shoppingCompletedQuantity: quantity, shoppingCompletedBy: 'self' })
    const operation = { id, before, after: pickShoppingFields(item, fields), recordId }
    shoppingCompletionOperations.set(id, operation)
    return operation
  }

  function reopenShoppingItem(id) {
    const item = getItem(id)
    if (!item || item.shoppingCompletedAt == null || item.shoppingCompletedBy !== 'self') return
    undoShoppingOperation(shoppingCompletionOperations.get(id))
  }

  function removeShoppingEntry(id) {
    const item = getItem(id)
    if (!item) return
    const before = pickShoppingFields(item, shoppingFields)
    updateItem(id, { inShoppingList: false, quantity: null, addedToShoppingListDate: null, shoppingCompletedAt: null, shoppingCompletedQuantity: null, shoppingCompletedBy: null, shoppingClaimantId: null })
    return { id, before, after: pickShoppingFields(item, shoppingFields) }
  }

  function claimShoppingItem(id) {
    const item = getItem(id)
    if (!item?.inShoppingList || !getSpace(item.spaceId)?.shared || item.shoppingClaimantId) return
    updateItem(id, { shoppingClaimantId: 'self' })
  }

  function cancelShoppingClaim(id) {
    const item = getItem(id)
    if (!item?.inShoppingList || item.shoppingClaimantId !== 'self' || !getSpace(item.spaceId)?.shared) return
    updateItem(id, { shoppingClaimantId: null })
    return { id, before: { shoppingClaimantId: 'self' }, after: { shoppingClaimantId: null } }
  }

  function takeOverShoppingClaim(id) {
    const item = getItem(id)
    if (!item?.inShoppingList || !item.shoppingClaimantId || item.shoppingClaimantId === 'self' || !getSpace(item.spaceId)?.shared) return
    updateItem(id, { shoppingClaimantId: 'self' })
  }

  function clearExpiredShoppingItems(now = Date.now()) {
    for (const item of items.value) {
      if (item.shoppingCompletedAt != null && now - item.shoppingCompletedAt >= 24 * 60 * 60 * 1000) {
        updateItem(item.id, { shoppingCompletedAt: null, shoppingCompletedQuantity: null, shoppingCompletedBy: null, shoppingClaimantId: null })
      }
    }
  }

  // 001 FR-004：修改一筆紀錄的日期與數量；保留新增順序。
  function updateRestockRecord(id, recordId, { date, quantity }) {
    const item = getItem(id)
    if (!item) return
    applyRestockRecords(id, item.restockRecords.map((record) => (record.id === recordId ? { ...record, date, quantity } : record)))
  }

  function removeRestockRecord(id, recordId) {
    const item = getItem(id)
    if (!item) return
    applyRestockRecords(id, item.restockRecords.filter((record) => record.id !== recordId))
  }

  function addSpace({ name, shared = false, color = 'green' }) {
    const space = { id: generateId(), name: limitSpaceName(name.trim()), shared, color, ownerId: 'self', members: [] }
    spaces.value.push(space)
    return space
  }

  function getSpace(id) {
    return spaces.value.find(space => space.id === id)
  }

  function updateSpace(id, changes) {
    const space = getSpace(id)
    if (!space || (!space.shared && space.ownerId !== 'self')) return
    if (typeof changes.name === 'string' && changes.name.trim()) space.name = limitSpaceName(changes.name.trim())
    if (SPACE_COLORS.some(option => option.id === changes.color)) space.color = changes.color
    if (space.id !== DEFAULT_SPACE_ID && typeof changes.shared === 'boolean' && (changes.shared || !space.members?.length)) space.shared = changes.shared
    return space
  }

  // members 只記錄自己以外的成員；邀請被接受後，由共享服務呼叫此方法。
  function addSpaceMember(spaceId, member) {
    const space = getSpace(spaceId)
    if (!space?.shared || !member?.id || !member.name?.trim()) return
    const members = space.members ?? (space.members = [])
    if (members.length >= 9 || members.some(existing => existing.id === member.id)) return
    members.push({ id: member.id, name: member.name.trim(), avatar: member.avatar || '' })
    return space
  }

  function getSpaceMembers(spaceId) {
    const space = getSpace(spaceId)
    if (!space) return []
    return [{ id: 'self', name: profile.name, avatar: profile.avatar }, ...(space.members || [])]
  }

  function leaveSpace(spaceId) {
    // 初始個人空間是帳號的預設空間，不能退出。
    if (spaceId === DEFAULT_SPACE_ID) return false
    const space = getSpace(spaceId)
    if (!space) return false
    // 唯一成員退出會刪除用品；有其他成員時保留資料但不再供目前帳號存取。
    const remainingItems = items.value.filter(item => item.spaceId === spaceId)
    if (space.members?.length) departedSpaces.value.push({ space, items: remainingItems })
    items.value = items.value.filter(item => item.spaceId !== spaceId)
    spaces.value = spaces.value.filter(existing => existing.id !== spaceId)
    return true
  }

  // 展示用邀請碼；正式版可將查詢替換為 API。
  function joinSpaceByCode(code) {
    const normalized = code.trim().toUpperCase()
    if (!normalized) return { ok: false, message: '請先輸入空間邀請碼' }
    if (normalized === 'FULL-0010') return { ok: false, message: '空間人數已滿' }
    if (normalized === 'JOIN-0001') return { ok: false, message: '已經是成員' }
    // 邀請前為 9 人，展示帳號加入後剛好達到 10 人上限。
    if (normalized === 'COM-8888') {
      if (getSpace('company')) return { ok: false, message: '已經是成員' }
      const departedIndex = departedSpaces.value.findIndex(entry => entry.space.id === 'company')
      if (departedIndex >= 0) {
        const [entry] = departedSpaces.value.splice(departedIndex, 1)
        spaces.value.push(entry.space)
        items.value.push(...entry.items)
        return { ok: true, space: entry.space, message: '已加入公司空間' }
      }
      const names = ['小明', '花花', '小美', '阿傑', '小安', '婷婷', '志豪', '雅雯', '柏宇']
      const space = {
        id: 'company', name: '公司', shared: true, color: 'orange', ownerId: 'company-member-1',
        members: names.map((name, index) => ({ id: `company-member-${index + 1}`, name })),
      }
      spaces.value.push(space)
      return { ok: true, space, message: '已加入公司空間' }
    }
    if (normalized !== 'FAM-8888') return { ok: false, message: '邀請碼不存在' }
    if (getSpace('family')) return { ok: false, message: '已經是成員' }
    const departedIndex = departedSpaces.value.findIndex(entry => entry.space.id === 'family')
    if (departedIndex >= 0) {
      const [entry] = departedSpaces.value.splice(departedIndex, 1)
      spaces.value.push(entry.space)
      items.value.push(...entry.items)
      return { ok: true, space: entry.space, message: '已加入家庭空間' }
    }
    const space = {
      id: 'family', name: '家庭', shared: true, color: 'blue', ownerId: 'member-xiaoming',
      members: [{ id: 'member-xiaoming', name: '小明' }, { id: 'member-huahua', name: '花花' }],
    }
    spaces.value.push(space)
    return { ok: true, space, message: '已加入家庭空間' }
  }

  const sharedSpaces = computed(() => spaces.value.filter(space => space.shared))
  function moveSpace(spaceId, targetId) {
    const from = spaces.value.findIndex(space => space.id === spaceId)
    const to = spaces.value.findIndex(space => space.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const [space] = spaces.value.splice(from, 1)
    spaces.value.splice(to, 0, space)
  }

  return {
    customCategories,
    systemCategoryCounts,
    customCategoryCounts,
    categoryOptions,
    addCategory,
    removeCategories,
    sharedSpaces,
    moveSpace,
    items,
    spaces,
    inventorySpaceId,
    recentlyRemoved,
    today,
    itemsWithStatus,
    shoppingList,
    restockReminders,
    getItem,
    addItem,
    updateItem,
    snapshotItem,
    restoreItem,
    removeItem,
    undoRemoveItem,
    clearRecentlyRemoved,
    addToShoppingList,
    addManyToShoppingList,
    removeFromShoppingList,
    disableReminder,
    snoozeReminder,
    enableReminder,
    updateNextRestockDate,
    completeRestock,
    completeShoppingItem,
    reopenShoppingItem,
    removeShoppingEntry,
    undoShoppingOperation,
    claimShoppingItem,
    cancelShoppingClaim,
    takeOverShoppingClaim,
    clearExpiredShoppingItems,
    updateRestockRecord,
    removeRestockRecord,
    addSpace,
    getSpace,
    updateSpace,
    addSpaceMember,
    getSpaceMembers,
    leaveSpace,
    joinSpaceByCode,
  }
})
