import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_SPACES,
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
  const spaces = ref(DEFAULT_SPACES.map((space) => ({ ...space })))

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
    const space = { id: crypto.randomUUID(), name, shared, color }
    spaces.value.push(space)
    return space
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
  }
})
