import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { generateId } from '../utils/id.js'
import { profile } from './profile'
import { SPACE_COLORS, limitSpaceName } from '../models/space'
import {
  DEFAULT_SPACES,
  DEFAULT_SPACE_ID,
  MIN_CYCLE_DAYS,
  addDays,
  createItem,
  createRestockRecord,
  createSampleItems,
  daysUntil,
  getStatus,
  toDateString,
} from '../models/item'

export const useItemsStore = defineStore('items', () => {
  const items = ref(createSampleItems())
  const spaces = ref(DEFAULT_SPACES.map((space) => ({ ...space, ownerId: 'self', members: [] })))
  // 模擬其他成員仍持有的空間資料，不提供目前使用者的列表存取。
  const departedSpaces = ref([])

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

  function removeItem(id) {
    items.value = items.value.filter((item) => item.id !== id)
  }

  function addToShoppingList(id) {
    updateItem(id, { inShoppingList: true })
  }

  function removeFromShoppingList(id) {
    updateItem(id, { inShoppingList: false })
  }

  // 完成補貨：新增紀錄、更新上次補貨日與預計補貨日，並移出購買清單。
  // 補貨週期只在尚未有值時推算（上次補貨日，或建立日，到這次補貨日的天數，最少 7 天）。
  function completeRestock(id, { date = toDateString(), quantity = 1 } = {}) {
    const item = getItem(id)
    if (!item) return
    const baseline = item.lastRestockDate ?? toDateString(new Date(item.createdAt))
    const cycleDays = item.cycleDays ?? Math.max(MIN_CYCLE_DAYS, -daysUntil(baseline, date))
    updateItem(id, {
      restockRecords: [createRestockRecord({ date, quantity }), ...item.restockRecords],
      lastRestockDate: date,
      cycleDays,
      nextRestockDate: item.reminderEnabled ? addDays(date, cycleDays) : item.nextRestockDate,
      inShoppingList: false,
    })
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
    members.push({ id: member.id, name: member.name.trim() })
    return space
  }

  function getSpaceMembers(spaceId) {
    const space = getSpace(spaceId)
    if (!space) return []
    return [{ id: 'self', name: profile.name }, ...(space.members || [])]
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

  return {
    items,
    spaces,
    itemsWithStatus,
    shoppingList,
    getItem,
    addItem,
    updateItem,
    removeItem,
    addToShoppingList,
    removeFromShoppingList,
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
