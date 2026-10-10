// 用品資料模型：欄位定義、固定選項、狀態計算。
// 日期一律使用 'YYYY-MM-DD' 字串（本地時間）。

import { generateId } from '../utils/id.js'

export const CATEGORIES = ['生活日用品', '清潔', '洗衣', '廚房', '個人護理', '寵物用品']
// Figma 預設分類（我的用品篩選 834:5231、用品詳情 902:9485；「洗浴清潔」已改名為「清潔」）；我的用品一律顯示，其他分類有用品時才顯示。
export const DEFAULT_CATEGORIES = ['生活日用品', '清潔', '洗衣', '廚房', '個人護理']

export const UNITS = ['件', '瓶', '包', '串', '條', '捲', '個']
export const DEFAULT_UNIT = '件'

export const DEFAULT_SPACE_ID = 'personal'
export const DEFAULT_SPACES = [
  { id: 'personal', name: '個人', shared: false, color: 'green' },
]

// 新增用品頁的常用用品：依現有用品插畫挑選，分組即帶入的分類（specs/002 附錄 A）。
export const COMMON_ITEM_GROUPS = [
  { category: '生活日用品', items: [
    { name: '衛生紙', unit: '包' },
    { name: '化妝棉', unit: '包' },
    { name: '垃圾袋', unit: '捲' },
    { name: '衛生棉', unit: '包' },
  ] },
  { category: '洗衣', items: [
    { name: '洗衣精', unit: '瓶' },
    { name: '洗衣膠囊', unit: '包' },
    { name: '香氛豆', unit: '瓶' },
  ] },
  { category: '廚房', items: [
    { name: '洗碗精', unit: '瓶' },
    { name: '海綿', unit: '個' },
    { name: '保鮮膜', unit: '條' },
  ] },
  { category: '個人護理', items: [
    { name: '牙膏', unit: '條' },
    { name: '沐浴乳', unit: '瓶' },
    { name: '洗髮精', unit: '瓶' },
  ] },
  { category: '清潔', items: [
    { name: '酒精', unit: '瓶' },
    { name: '馬桶清潔劑', unit: '瓶' },
  ] },
  { category: '寵物用品', items: [
    { name: '飼料', unit: '包' },
    { name: '尿墊', unit: '包' },
    { name: '貓砂', unit: '包' },
  ] },
]

// 名稱包含關鍵字即使用對應插畫；多個符合時取最長的關鍵字。
export const ITEM_ICON_KEYWORDS = {
  'laundry-detergent': ['洗衣精'],
  tissues: ['衛生紙', '面紙'],
  'dish-soap': ['洗碗精'],
  'trash-bags': ['垃圾袋'],
  'rubbing-alcohol': ['酒精'],
  sponge: ['海綿', '菜瓜布'],
  'cotton-pads': ['化妝棉'],
  'sanitary-pads': ['衛生棉'],
  'light-bulb': ['燈泡'],
  'dog-food': ['狗糧', '飼料', '狗狗糧食'],
}

export function matchItemIconKey(name = '') {
  let match = null
  let matchLength = 0
  for (const [iconKey, keywords] of Object.entries(ITEM_ICON_KEYWORDS)) {
    for (const keyword of keywords) {
      if (keyword.length > matchLength && name.includes(keyword)) {
        match = iconKey
        matchLength = keyword.length
      }
    }
  }
  return match
}

// 剩餘天數 <= 此值時顯示「該補貨了」
export const REMIND_WITHIN_DAYS = 5

export const STATUS = {
  OVERDUE: 'overdue',
  DUE_SOON: 'dueSoon',
  IN_SHOPPING_LIST: 'inShoppingList',
  REMINDER_OFF: 'reminderOff',
  NOT_NEEDED: 'notNeeded',
}

export const STATUS_LABELS = {
  [STATUS.OVERDUE]: '補貨時間已過',
  [STATUS.DUE_SOON]: '該補貨了',
  [STATUS.IN_SHOPPING_LIST]: '購買清單中',
  [STATUS.REMINDER_OFF]: '未開啟提醒',
  [STATUS.NOT_NEEDED]: '不需補貨',
}

// 圖示狀態與業務狀態分開；View 透過 getIconState() 取得圖示狀態。
export const ITEM_STATUS = Object.freeze({
  RESTOCK_NEEDED: 'restock-needed',
  DUE_SOON: 'due-soon',
  IN_SHOPPING_LIST: 'in-shopping-list',
  IN_STOCK: 'in-stock',
})

const STATUS_ICON_STATES = Object.freeze({
  [STATUS.OVERDUE]: ITEM_STATUS.RESTOCK_NEEDED,
  [STATUS.DUE_SOON]: ITEM_STATUS.DUE_SOON,
  [STATUS.IN_SHOPPING_LIST]: ITEM_STATUS.IN_SHOPPING_LIST,
  // 沒有提醒不代表庫存充足；目前使用一般圖樣，不推算庫存。
  [STATUS.REMINDER_OFF]: ITEM_STATUS.IN_STOCK,
  [STATUS.NOT_NEEDED]: ITEM_STATUS.IN_STOCK,
})

export function getIconState(status) {
  if (Object.hasOwn(STATUS_ICON_STATES, status)) return STATUS_ICON_STATES[status]
  if (Object.values(ITEM_STATUS).includes(status)) return status
  // 未知狀態不得暗示用品已加入購買清單。
  return ITEM_STATUS.IN_STOCK
}

export function toDateString(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number)
  return toDateString(new Date(y, m - 1, d + days))
}

// 下個月同一天；該月沒有這天時取月底。
export function addMonths(dateString, months) {
  const [y, m, d] = dateString.split('-').map(Number)
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate()
  return toDateString(new Date(y, m - 1 + months, Math.min(d, lastDay)))
}

// dateString 距離 today 還有幾天；已過期為負數。
export function daysUntil(dateString, today = toDateString()) {
  const [y1, m1, d1] = today.split('-').map(Number)
  const [y2, m2, d2] = dateString.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / msPerDay)
}

export function createItem(input = {}) {
  const now = new Date().toISOString()
  return {
    id: input.id ?? generateId(),
    name: input.name ?? '',
    iconKey: input.iconKey ?? null,
    category: input.category ?? null,
    unit: input.unit ?? DEFAULT_UNIT,
    spaceId: input.spaceId ?? DEFAULT_SPACE_ID,
    reminderEnabled: input.reminderEnabled ?? true,
    nextRestockDate: input.nextRestockDate ?? null,
    cycleDays: input.cycleDays ?? null,
    // 計算基準（001 FR-002）：開啟提醒時為（設定日，庫存量），補貨後更新。
    reminderBaseDate: input.reminderBaseDate ?? null,
    reminderBaseQuantity: input.reminderBaseQuantity ?? null,
    daysPerUnit: input.daysPerUnit ?? null,
    // 最近一次開啟提醒的日期；補貨後不變。早於此日的紀錄不作為重算依據（specs/003 DET-03）。
    reminderEnabledDate: input.reminderEnabledDate ?? null,
    lastRestockDate: input.lastRestockDate ?? null,
    inShoppingList: input.inShoppingList ?? false,
    // 待買數量（不是庫存量）；加入購買清單時為 1，移出時清除（specs/003 DET-11）。
    quantity: input.quantity ?? null,
    addedToShoppingListDate: input.addedToShoppingListDate ?? null,
    // 依新增順序排列；同一天多筆時，較晚新增者為最新一筆。
    restockRecords: input.restockRecords ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
}

export function createRestockRecord(input = {}) {
  return {
    id: input.id ?? generateId(),
    date: input.date ?? toDateString(),
    quantity: input.quantity ?? 1,
  }
}

// 001 FR-002：每單位可撐天數 ＝（預計補貨日 − 基準日）÷ 基準數量，保留小數。
export function calcDaysPerUnit(nextRestockDate, baseDate, baseQuantity) {
  return daysUntil(nextRestockDate, baseDate) / baseQuantity
}

// 001 FR-003：下次預計補貨日 ＝ 補貨日 ＋ 數量 × 每單位可撐天數，四捨五入到整天。
export function calcNextRestockDate(date, quantity, daysPerUnit) {
  return addDays(date, Math.round(quantity * daysPerUnit))
}

// 最新一筆：日期最晚者；同一天時取較晚新增者（specs/003 DET-04）。
export function getLatestRecord(records) {
  return records.reduce((latest, record) => (!latest || record.date >= latest.date ? record : latest), null)
}

// 狀態由資料推算，不存進 item。
export function getStatus(item, today = toDateString()) {
  if (item.inShoppingList) return STATUS.IN_SHOPPING_LIST
  if (!item.reminderEnabled || !item.nextRestockDate) return STATUS.REMINDER_OFF
  const days = daysUntil(item.nextRestockDate, today)
  if (days < 0) return STATUS.OVERDUE
  if (days <= REMIND_WITHIN_DAYS) return STATUS.DUE_SOON
  return STATUS.NOT_NEEDED
}

// 示範資料：取自「我的用品」設計稿，日期相對今天計算。
// 計算基準以（預計補貨日 − 週期，數量 1）補上，每單位可撐天數即為週期（specs/003 DET-02）。
function sampleReminder(today, daysLeft, cycleDays) {
  const baseDate = addDays(today, daysLeft - cycleDays)
  return {
    nextRestockDate: addDays(today, daysLeft),
    cycleDays,
    reminderBaseDate: baseDate,
    reminderBaseQuantity: 1,
    daysPerUnit: cycleDays,
    reminderEnabledDate: baseDate,
  }
}

export function createSampleItems(today = toDateString()) {
  return [
    createItem({ name: '垃圾袋', iconKey: 'trash-bags', category: '生活日用品', unit: '包', spaceId: DEFAULT_SPACE_ID, ...sampleReminder(today, -2, 30) }),
    createItem({ name: '洗衣精', iconKey: 'laundry-detergent', category: '洗衣', unit: '瓶', spaceId: DEFAULT_SPACE_ID, ...sampleReminder(today, 5, 45) }),
    createItem({ name: '衛生紙', iconKey: 'tissues', category: '生活日用品', unit: '包', spaceId: DEFAULT_SPACE_ID, ...sampleReminder(today, 3, 21), inShoppingList: true, quantity: 1, addedToShoppingListDate: today }),
    createItem({ name: '洗碗精', iconKey: 'dish-soap', category: '廚房', unit: '瓶', spaceId: DEFAULT_SPACE_ID, ...sampleReminder(today, 20, 40) }),
    createItem({ name: '狗狗糧食', iconKey: 'dog-food', category: '寵物用品', unit: '包', spaceId: DEFAULT_SPACE_ID, reminderEnabled: false }),
  ]
}

export const ITEM_STATUS_LABELS = Object.freeze({
  [ITEM_STATUS.IN_SHOPPING_LIST]: '在購物清單',
  [ITEM_STATUS.RESTOCK_NEEDED]: '需要補貨',
  [ITEM_STATUS.IN_STOCK]: '庫存充足',
  [ITEM_STATUS.DUE_SOON]: '接近補貨日',
})

export function normalizeItemStatus(status) {
  return getIconState(status)
}
