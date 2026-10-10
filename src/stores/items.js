import { computed, ref, shallowRef, toRaw } from 'vue'
import { defineStore } from 'pinia'
import { generateId } from '../utils/id.js'
import { profile } from './profile'
import { SPACE_COLORS, limitSpaceName } from '../models/space'
import {
  DEFAULT_SPACES,
  DEFAULT_SPACE_ID,
  calcDaysPerUnit,
  calcNextRestockDate,
  createItem,
  createRestockRecord,
  createSampleItems,
  getLatestRecord,
  getStatus,
  toDateString,
} from '../models/item'

// 刪除後可復原的時間，與 Toast 顯示時間相同。
export const UNDO_DURATION_MS = 5000

export const useItemsStore = defineStore('items', () => {
  const items = ref(createSampleItems())
  const spaces = ref(DEFAULT_SPACES.map((space) => ({ ...space, ownerId: 'self', members: [] })))
  // 模擬其他成員仍持有的空間資料，不提供目前使用者的列表存取。
  const departedSpaces = ref([])
  // 我的用品目前的空間篩選（null ＝ 所有用品）；新增用品頁依此預帶空間，不持久化。
  const inventorySpaceId = ref(null)
  // 最近一次刪除（不做 stack）：我的用品與用品詳情共用，讓詳情刪除後回到我的用品仍可復原（specs/003 DET-20）。
  // shallowRef：snapshot 保持非 Proxy，復原時 structuredClone 才不會失敗。
  const recentlyRemoved = shallowRef(null) // { item, index, spaceName, expiresAt }

  const itemsWithStatus = computed(() =>
    items.value.map((item) => ({ ...item, status: getStatus(item) })),
  )
  const shoppingList = computed(() => items.value.filter((item) => item.inShoppingList))

  function getItem(id) {
    return items.value.find((item) => item.id === id)
  }

  function addItem(input) {
    const item = createItem(input)
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

  // 001 FR-006：加入時待買數量 1；移出時清除。
  function addToShoppingList(id) {
    updateItem(id, { inShoppingList: true, quantity: 1, addedToShoppingListDate: toDateString() })
  }

  function removeFromShoppingList(id) {
    updateItem(id, { inShoppingList: false, quantity: null, addedToShoppingListDate: null })
  }

  // 001 FR-005：關閉提醒只改開關，保留日期與計算基準，Toast 復原時直接還原。
  function disableReminder(id) {
    updateItem(id, { reminderEnabled: false })
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
    })
  }

  // 001 FR-002（D1-a）：只改日期；以原基準日與基準數量重算每單位可撐天數。
  function updateNextRestockDate(id, nextRestockDate) {
    const item = getItem(id)
    if (!item) return
    updateItem(id, {
      nextRestockDate,
      daysPerUnit: calcDaysPerUnit(nextRestockDate, item.reminderBaseDate, item.reminderBaseQuantity),
    })
  }

  // 001 FR-003：新增紀錄、更新上次補貨日、移出購買清單。
  // 提醒開啟且新紀錄成為重算依據時，才更新下次預計補貨日與計算基準（specs/003 DET-03、DET-04）。
  function completeRestock(id, { date = toDateString(), quantity = 1 } = {}) {
    const item = getItem(id)
    if (!item) return
    const record = createRestockRecord({ date, quantity })
    const restockRecords = [...item.restockRecords, record]
    const changes = {
      restockRecords,
      lastRestockDate: getLatestRecord(restockRecords).date,
      inShoppingList: false,
      quantity: null,
      addedToShoppingListDate: null,
    }
    const isBasis = getLatestRecord(restockRecords) === record
      && (!item.reminderEnabledDate || date >= item.reminderEnabledDate)
    if (item.reminderEnabled && item.daysPerUnit !== null && isBasis) {
      Object.assign(changes, {
        nextRestockDate: calcNextRestockDate(date, quantity, item.daysPerUnit),
        reminderBaseDate: date,
        reminderBaseQuantity: quantity,
      })
    }
    updateItem(id, changes)
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
    sharedSpaces,
    moveSpace,
    items,
    spaces,
    inventorySpaceId,
    recentlyRemoved,
    itemsWithStatus,
    shoppingList,
    getItem,
    addItem,
    updateItem,
    snapshotItem,
    restoreItem,
    removeItem,
    undoRemoveItem,
    clearRecentlyRemoved,
    addToShoppingList,
    removeFromShoppingList,
    disableReminder,
    enableReminder,
    updateNextRestockDate,
    completeRestock,
    addSpace,
    getSpace,
    updateSpace,
    addSpaceMember,
    getSpaceMembers,
    leaveSpace,
    joinSpaceByCode,
  }
})
