// 用品資料模型：欄位定義、固定選項、狀態計算。
// 日期一律使用 'YYYY-MM-DD' 字串（本地時間）。

export const CATEGORIES = ['生活日用品', '洗浴清潔', '洗衣', '廚房', '個人護理', '寵物用品']

export const UNITS = ['件', '瓶', '包', '串', '條']
export const DEFAULT_UNIT = '件'

export const DEFAULT_SPACE_ID = 'personal'
export const DEFAULT_SPACES = [
  { id: 'personal', name: '個人', shared: false, color: 'green' },
  { id: 'family', name: '家庭', shared: true, color: 'blue' },
  { id: 'company', name: '公司', shared: true, color: 'orange' },
  { id: 'travel', name: '旅行', shared: true, color: 'red' },
]

export const MIN_CYCLE_DAYS = 7
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
    id: input.id ?? crypto.randomUUID(),
    name: input.name ?? '',
    category: input.category ?? null,
    unit: input.unit ?? DEFAULT_UNIT,
    spaceId: input.spaceId ?? DEFAULT_SPACE_ID,
    reminderEnabled: input.reminderEnabled ?? true,
    nextRestockDate: input.nextRestockDate ?? null,
    cycleDays: input.cycleDays ?? null,
    lastRestockDate: input.lastRestockDate ?? null,
    inShoppingList: input.inShoppingList ?? false,
    restockRecords: input.restockRecords ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
}

export function createRestockRecord(input = {}) {
  return {
    id: input.id ?? crypto.randomUUID(),
    date: input.date ?? toDateString(),
    quantity: input.quantity ?? 1,
  }
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
export function createSampleItems(today = toDateString()) {
  return [
    createItem({ name: '垃圾袋', category: '生活日用品', unit: '包', spaceId: 'family', nextRestockDate: addDays(today, -2), cycleDays: 30 }),
    createItem({ name: '洗衣精', category: '洗衣', unit: '瓶', spaceId: 'family', nextRestockDate: addDays(today, 5), cycleDays: 45 }),
    createItem({ name: '衛生紙', category: '生活日用品', unit: '包', spaceId: 'family', nextRestockDate: addDays(today, 3), cycleDays: 21, inShoppingList: true }),
    createItem({ name: '洗碗精', category: '廚房', unit: '瓶', spaceId: 'company', nextRestockDate: addDays(today, 20), cycleDays: 40 }),
    createItem({ name: '狗狗糧食', category: '寵物用品', unit: '包', spaceId: 'family', reminderEnabled: false }),
  ]
}

// 用品圖示狀態；購物清單成員資格與完成狀態可由 store 另外記錄。
export const ITEM_STATUS = Object.freeze({
  IN_SHOPPING_LIST: 'in-shopping-list',
  RESTOCK_NEEDED: 'restock-needed',
  IN_STOCK: 'in-stock',
  DUE_SOON: 'due-soon',
})

export const ITEM_STATUS_LABELS = Object.freeze({
  [ITEM_STATUS.IN_SHOPPING_LIST]: '在購物清單',
  [ITEM_STATUS.RESTOCK_NEEDED]: '需要補貨',
  [ITEM_STATUS.IN_STOCK]: '庫存充足',
  [ITEM_STATUS.DUE_SOON]: '接近補貨日',
})

export function normalizeItemStatus(status) {
  return Object.hasOwn(ITEM_STATUS_LABELS, status) ? status : ITEM_STATUS.IN_SHOPPING_LIST
}
