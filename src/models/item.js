import { migrateUnitPeriods, currentUnitRecords } from '../utils/unitPeriods.js'
// 用品資料模型：欄位定義、固定選項、狀態計算。
// 日期一律使用 'YYYY-MM-DD' 字串（本地時間）。

import { generateId } from '../utils/id.js'

export const CATEGORIES = ['生活日用品', '清潔', '洗衣', '廚房', '個人護理', '寵物用品']

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

// 剩餘天數 <= 提醒門檻 T 時顯示「該補貨了」。預設 5，設定頁可調 1～20（001 D4、D4-c）；
// 實際使用的值存在 notificationSettings store 的 restockDays，各函式以參數接收。
export const REMIND_WITHIN_DAYS = 5
export const MIN_REMIND_DAYS = 1
export const MAX_REMIND_DAYS = 20

// 「暫時不用補貨」延後的天數（specs/005 SNZ-01）。
export const SNOOZE_DAYS = 7

export const STATUS = {
  OVERDUE: 'overdue',
  DUE_SOON: 'dueSoon',
  IN_SHOPPING_LIST: 'inShoppingList',
  REMINDER_OFF: 'reminderOff',
  NOT_NEEDED: 'notNeeded',
}

export const STATUS_LABELS = {
  // 「補貨時間已過」併入「該補貨了」（可用性測試 2026-10-15）；程式內仍保留 OVERDUE 供排序與提醒文案使用。
  [STATUS.OVERDUE]: '該補貨了',
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
  return migrateUnitPeriods({
    id: input.id ?? generateId(),
    unitPeriodId: input.unitPeriodId,
    catalogId: typeof input.catalogId === 'string' && input.catalogId ? input.catalogId : null,
    catalogIconInherited: input.catalogIconInherited === true,
    name: input.name ?? '',
    iconKey: input.iconKey ?? null,
    // 使用者自己的照片（256×256 JPEG data URL）；有值時優先於 iconKey，所有狀態同一張（specs/008）。
    iconPhoto: input.iconPhoto ?? null,
    // 手動指定過圖示後，改名不再依名稱重新比對 iconKey（specs/008 ICO-05）。
    iconManual: input.iconManual ?? false,
    category: input.category ?? null,
    unit: input.unit ?? DEFAULT_UNIT,
    spaceId: input.spaceId ?? DEFAULT_SPACE_ID,
    // 提醒開關：預設開啟，但補貨紀錄涵蓋兩個以上不同日期才會推算並提醒（specs/009 FR-913）。
    // 下次預計補貨日不儲存，由補貨紀錄即時推算（specs/009 FR-912、getNextRestockDate）。
    reminderEnabled: input.reminderEnabled ?? true,
    lastRestockDate: input.lastRestockDate ?? null,
    inShoppingList: input.inShoppingList ?? false,
    shoppingClaimantId: input.shoppingClaimantId ?? null,
    // Notification claim identity; legacy claims remain unverified until a new operation.
    shoppingClaimOperationId: typeof input.shoppingClaimOperationId === 'string' ? input.shoppingClaimOperationId : null,
    shoppingCompletedAt: input.shoppingCompletedAt ?? null,
    shoppingCompletedQuantity: input.shoppingCompletedQuantity ?? null,
    shoppingCompletedBy: input.shoppingCompletedBy ?? null,
    // 待買數量（不是庫存量）；加入購買清單時為 1，移出時清除（specs/003 DET-11）。
    quantity: input.quantity ?? null,
    addedToShoppingListDate: input.addedToShoppingListDate ?? null,
    // 「暫時不用補貨」的延後到期日；當天起重新出現在首頁補貨提醒（specs/005 SNZ-02）。
    snoozedUntil: input.snoozedUntil ?? null,
    reminderSnoozeOperationIds: input.reminderSnoozeOperationIds && typeof input.reminderSnoozeOperationIds === 'object' ? { ...input.reminderSnoozeOperationIds } : {},
    reminderSnoozes: input.reminderSnoozes && typeof input.reminderSnoozes === 'object' ? { ...input.reminderSnoozes } : {},
    // 依新增順序排列；同一天多筆時，較晚新增者為最新一筆。
    restockRecords: input.restockRecords ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  })
}

export function createRestockRecord(input = {}) {
  return {
    id: input.id ?? generateId(),
    date: input.date ?? toDateString(),
    quantity: input.quantity ?? 1,
    ...(input.unit ? { unit: input.unit } : {}),
    ...(input.unitPeriodId ? { unitPeriodId: input.unitPeriodId } : {}),
  }
}

// 舊新增用品頁（AddItemView）仍引用；新增用品頁改版後移除（specs/009 FR-912：不再手填預計補貨日）。
export function calcDaysPerUnit(nextRestockDate, baseDate, baseQuantity) {
  return daysUntil(nextRestockDate, baseDate) / baseQuantity
}

// ---------- 依補貨紀錄推算下次預計補貨日（specs/009 FR-912、UT-25）----------

// 整理紀錄：依日期由舊到新排序；同一天的多筆合併成一筆（數量相加）。
export function groupRecordsByDate(records = []) {
  const byDate = new Map()
  for (const { date, quantity } of records) byDate.set(date, (byDate.get(date) ?? 0) + quantity)
  return [...byDate].map(([date, quantity]) => ({ date, quantity })).sort((a, b) => a.date.localeCompare(b.date))
}

// 紀錄涵蓋幾個不同的日期；兩個以上才推算得出下次補貨日。
export function countRecordDates(records = []) {
  return new Set(records.map((record) => record.date)).size
}

// 每單位可撐天數 ＝（最新一筆日期 − 第一筆日期）÷（除了最新一筆以外，所有紀錄的數量加總），保留小數。
// 不足兩個不同日期時回傳 null。
export function calcDaysPerUnitFromRecords(records = []) {
  const days = groupRecordsByDate(records)
  if (days.length < 2) return null
  const consumed = days.slice(0, -1).reduce((sum, day) => sum + day.quantity, 0)
  if (consumed <= 0) return null
  return daysUntil(days.at(-1).date, days[0].date) / consumed
}

// 下次預計補貨日 ＝ 最新一筆日期 ＋ 最新一筆數量 × 每單位可撐天數，四捨五入到整天。
// 至少離最新一筆「T ＋ 1」天，避免剛補完貨就立刻變成「該補貨了」（001 RST-01）。
// 不足兩個不同日期時回傳 null。
export function calcNextRestockDateFromRecords(records = [], remindWithinDays = REMIND_WITHIN_DAYS) {
  const daysPerUnit = calcDaysPerUnitFromRecords(records)
  if (daysPerUnit === null) return null
  const latest = groupRecordsByDate(records).at(-1)
  return addDays(latest.date, Math.max(remindWithinDays + 1, Math.round(latest.quantity * daysPerUnit)))
}

// 用品的下次預計補貨日：只看補貨紀錄，不看提醒開關（開關由 getReminderStatus 判斷）。
export function getNextRestockDate(item, remindWithinDays = REMIND_WITHIN_DAYS) {
  return calcNextRestockDateFromRecords(currentUnitRecords(item), remindWithinDays)
}

// 最新一筆：日期最晚者；同一天時取較晚新增者（specs/003 DET-04）。
export function getLatestRecord(records) {
  return records.reduce((latest, record) => (!latest || record.date >= latest.date ? record : latest), null)
}

// 依日期新到舊；同一天時較晚新增者在前，與 getLatestRecord 一致。
export function sortRecordsNewestFirst(records) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => b.record.date.localeCompare(a.record.date) || b.index - a.index)
    .map(({ record }) => record)
}

// 提醒狀態：只看提醒開關與預計補貨日，不看購買清單（用品詳情的補貨提醒區使用，RST-07）。
export function getReminderStatus(item, today = toDateString(), remindWithinDays = REMIND_WITHIN_DAYS) {
  const nextRestockDate = getNextRestockDate(item, remindWithinDays)
  if (!item.reminderEnabled || !nextRestockDate) return STATUS.REMINDER_OFF
  const days = daysUntil(nextRestockDate, today)
  if (days < 0) return STATUS.OVERDUE
  if (days <= remindWithinDays) return STATUS.DUE_SOON
  return STATUS.NOT_NEEDED
}

// 主要顯示狀態：已在購買清單優先，否則為提醒狀態。狀態由資料推算，不存進 item。
export function getStatus(item, today = toDateString(), remindWithinDays = REMIND_WITHIN_DAYS) {
  if (item.inShoppingList) return STATUS.IN_SHOPPING_LIST
  return getReminderStatus(item, today, remindWithinDays)
}

// 「我的用品」列表與用品詳情的狀態標記（specs/010 FR-1001）：由提醒狀態與是否已在購買清單決定。
// pill 只顯示最重要的一個狀態（該補貨了 > 購買清單中）；清單標記（圓圈）只在「該補貨了＋已在清單」時出現，
// 因為這時 pill 位置已被「該補貨了」佔走。傳入的是提醒狀態（getReminderStatus），不是 getStatus。
export function getStatusMarks(reminderStatus, inShoppingList) {
  const due = reminderStatus === STATUS.OVERDUE || reminderStatus === STATUS.DUE_SOON
  if (due) return { pill: reminderStatus, showListMark: !!inShoppingList }
  return { pill: inShoppingList ? STATUS.IN_SHOPPING_LIST : null, showListMark: false }
}

// 延後中：今天早於延後到期日。不影響狀態，只用於首頁補貨提醒與詳情提示（specs/005 SNZ-03）。
export function isSnoozed(item, today = toDateString(), memberId = 'self') {
  return (!!item.snoozedUntil && today < item.snoozedUntil) || today < (item.reminderSnoozes?.[memberId] || '')
}

// 示範資料：日期相對今天計算，展示當天看到的狀態才會對（specs/009 FR-914、UT-27）。
// 依「下次預計補貨日」反推補貨紀錄：每筆數量 1、間隔 cycleDays 天，最新一筆在（今天 ＋ daysLeft − cycleDays）。
// 照 FR-912 推算，下次預計補貨日就是（今天 ＋ daysLeft）；cycleDays 要大於提醒門檻 T，否則會被 T ＋ 1 的下限蓋過。
export function sampleHistory(today, daysLeft, cycleDays, recordCount = 3) {
  const latest = addDays(today, daysLeft - cycleDays)
  const restockRecords = Array.from({ length: recordCount }, (_, index) =>
    createRestockRecord({ date: addDays(latest, -cycleDays * (recordCount - 1 - index)), quantity: 1 }))
  return { restockRecords, lastRestockDate: latest }
}

// 單一展示資料來源；只在首次建立或操作者明確重置時呼叫。
export const PRESENTATION_MEMBER_ID = 'demo-huahua'
export const PRESENTATION_PRESET_OVERRIDES = { 'preset:tissues': { unit: '袋' } }
export function createSampleItems(today = toDateString(), familyId = 'demo-family') {
  const build = (name, iconKey, category, unit, extra = {}) => createItem({
    name, iconKey, category, unit, catalogId: `preset:${iconKey}`, catalogIconInherited: true,
    reminderEnabled: true, unitPeriodId: generateId(), ...extra,
  })
  const waiting = { inShoppingList: true, quantity: 1, addedToShoppingListDate: today }
  return [
    build('衛生紙', 'tissues', '生活日用品', '袋', sampleHistory(today, -1, 30)),
    build('洗衣精', 'laundry-detergent', '洗衣', '瓶', { restockRecords: [createRestockRecord({ date: addDays(today, -10), quantity: 1 })], lastRestockDate: addDays(today, -10) }),
    build('衛生棉', 'sanitary-pads', '個人護理', '包', { ...sampleHistory(today, 30, 60), ...waiting }),
    build('狗狗糧食', 'dog-food', '寵物用品', '包', sampleHistory(today, 30, 60)),
    build('酒精', 'rubbing-alcohol', '清潔', '瓶', { spaceId: familyId, ...sampleHistory(today, 30, 60), ...waiting }),
    build('垃圾袋', 'trash-bags', '生活日用品', '包', { spaceId: familyId, ...sampleHistory(today, 30, 60), ...waiting, shoppingClaimantId: PRESENTATION_MEMBER_ID }),
  ]
}
export function createPresentationState(today = toDateString()) {
  const familyId = generateId()
  return {
    presentationVersion: 1, presentationRunId: generateId(), presentationDate: today,
    items: createSampleItems(today, familyId),
    spaces: [
      { ...DEFAULT_SPACES[0], ownerId: 'self', members: [] },
      { id: familyId, name: '家庭', shared: true, color: 'blue', ownerId: 'self', members: [{ id: PRESENTATION_MEMBER_ID, name: '花花', avatar: '' }] },
    ], customCategories: [], departedSpaces: [], demoSeeds: [],
  }
}
