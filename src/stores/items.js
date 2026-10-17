import { computed, ref, shallowRef, toRaw, watch, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import { useCatalogStore } from './catalog'
import { migrateCatalogLinks, assertCatalogLinkUnique, catalogLinkError, normalizeCatalogName } from '../utils/catalogLinks.js'
import { isValidInviteCode } from '../utils/inviteCode'
import { generateId } from '../utils/id.js'
import { createDebouncedSaver, loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'
import { avatarOptions } from '../assets/household-icons-by-state/avatars/index.js'
import { profile } from './profile'
import { useNotificationSettingsStore } from './notificationSettings'
import { SYSTEM_CATEGORIES, PRESET_ITEMS, getItemCategory } from '../models/itemCategories'
import { SPACE_COLORS, limitSpaceName } from '../models/space'
import {
  DEFAULT_SPACES,
  DEFAULT_SPACE_ID,
  createItem,
  createRestockRecord,
  createSampleItems,
  countRecordDates,
  daysUntil,
  getLatestRecord,
  getNextRestockDate,
  getStatus,
  isSnoozed,
  sampleHistory,
  SNOOZE_DAYS,
  STATUS,
  addDays,
  toDateString,
} from '../models/item'

// 刪除後可復原的時間，與 Toast 顯示時間相同。
// 可用性測試 2026-10-15：5 秒太快，延長為 8 秒；Toast 另外在觸碰、滑鼠停留或聚焦時暫停倒數。
export const UNDO_DURATION_MS = 8000
// 購買清單完成後保留展示的時間；購買清單、首頁「最近更新」與 store 的清除共用。
export const SHOPPING_COMPLETED_KEEP_MS = 24 * 60 * 60 * 1000

// 第一次使用（或存檔無效）時的示範資料。
function createDemoState() {
  const items = createSampleItems()
  const spaces = DEFAULT_SPACES.map((space) => ({ ...space, ownerId: 'self', members: [] }))
  // 保留展示空間；用品只使用五種補貨狀態各一筆的共用示範資料。
  const previewSpaces = [
    { id: 'preview-family', name: '家庭', shared: true, color: 'blue' },
    { id: 'preview-company', name: '公司', shared: true, color: 'orange' },
    { id: 'preview-travel', name: '旅行', shared: false, color: 'red' },
  ]
  spaces.push(...previewSpaces.map(space => ({ ...space, ownerId: 'self', members: [] })))
  // 購買清單展示：目前使用者可接手小明已認購的家庭用品。
  const takeoverPreviewSpace = spaces.find(space => space.id === 'preview-family')
  takeoverPreviewSpace.members.push({ id: 'preview-xiaoming', name: '小明', avatar: avatarOptions[0].image }, { id: 'preview-huahua', name: '花花', avatar: avatarOptions[1].image })
  const takeoverPreviewItem = items.find(item => item.name === '衛生紙')
  Object.assign(takeoverPreviewItem, { spaceId: 'preview-family', inShoppingList: true, quantity: 2, addedToShoppingListDate: toDateString(), shoppingClaimantId: 'preview-xiaoming' })
  return { items, spaces }
}

// 讀取存檔並檢查結構；任何一項不符就回傳 null，整批改用示範資料，不載入一半。
function loadSavedState() {
  const data = loadPersisted(STORE_KEYS.items)
  if (!data) return null
  const hasIds = (list) => Array.isArray(list) && list.every(entry => entry && typeof entry.id === 'string')
  const departedValid = Array.isArray(data.departedSpaces) && data.departedSpaces.every(entry => entry?.space && typeof entry.space.id === 'string' && hasIds(entry.items))
  const categoriesValid = Array.isArray(data.customCategories) && data.customCategories.every(name => typeof name === 'string')
  if (!hasIds(data.items) || !hasIds(data.spaces) || !departedValid || !categoriesValid) return null
  return data
}

export const useItemsStore = defineStore('items', () => {
  const saved = loadSavedState()
  const demo = saved ? null : createDemoState()
  const items = ref(saved?.items ?? demo.items)
  const customCategories = ref(saved?.customCategories ?? [])
  const spaces = ref(saved?.spaces ?? demo.spaces)
  // 一次性新增共享清單展示用品；使用者之後刪除時不再自動補回。
  const demoSeeds = new Set(Array.isArray(saved?.demoSeeds) ? saved.demoSeeds : [])
  const familyAlcoholSeed = 'family-unclaimed-alcohol-v1'
  const needsFamilyAlcoholSeed = !demoSeeds.has(familyAlcoholSeed)
  if (needsFamilyAlcoholSeed) {
    const family = spaces.value.find(space => space.shared && space.name === '家庭')
    if (family && !items.value.some(item => item.spaceId === family.id && item.name === '酒精')) {
      items.value.push(createItem({ name: '酒精', iconKey: 'rubbing-alcohol', category: '清潔', unit: '瓶', spaceId: family.id, reminderEnabled: false, ...sampleHistory(toDateString(), 10, 30), inShoppingList: true, quantity: 1, addedToShoppingListDate: toDateString(), shoppingClaimantId: null }))
    }
    demoSeeds.add(familyAlcoholSeed)
  }
  const catalog = useCatalogStore()
  // 傳 toRaw：migrateCatalogLinks 以 {...item} 複製，若來源是 reactive，巢狀陣列會變成 Proxy，之後 snapshotItem 的 structuredClone 會失敗。
  const linkedItems = migrateCatalogLinks(toRaw(items.value), catalog.allItems, catalog.deletedCatalogItems)
  const needsCatalogSave = linkedItems.some((item, index) => item.catalogId !== items.value[index].catalogId)
  items.value = linkedItems
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
  // 模擬其他成員仍持有的空間資料，不提供目前使用者的列表存取。
  const departedSpaces = ref(saved?.departedSpaces ?? [])
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

  // 補貨建議的提醒門檻 T（設定頁可調）；狀態判斷與預計補貨日推算都以它為準。
  const notificationSettings = useNotificationSettingsStore()
  const remindWithinDays = computed(() => notificationSettings.restockDays)

  // 下次預計補貨日不儲存，由補貨紀錄即時推算（specs/009 FR-912）；各畫面讀這裡的 nextRestockDate。
  // 紀錄涵蓋不到兩個不同日期時為 null。它也跟著提醒門檻 T 改變（至少 T ＋ 1 天的下限）。
  const itemsWithStatus = computed(() =>
    items.value.map((item) => ({
      ...item,
      nextRestockDate: getNextRestockDate(item, remindWithinDays.value),
      status: getStatus(item, today.value, remindWithinDays.value),
    })),
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
    if (input.catalogId && !catalog.getById(input.catalogId)) throw catalogLinkError('NOT_FOUND', '找不到全域用品。')
    assertCatalogLinkUnique(items.value, { ...input, spaceId: input.spaceId ?? DEFAULT_SPACE_ID })
    const preset = PRESET_ITEMS.find(option => option.iconKey === input.iconKey)
    const item = createItem({ ...input, category: input.category ?? preset?.category })
    assertCatalogLinkUnique(items.value, item)
    items.value.push(item)
    return item
  }

  function updateItem(id, changes) {
    const item = getItem(id)
    if (!item) return
    if ((Object.hasOwn(changes, 'catalogId') && changes.catalogId !== item.catalogId) || (Object.hasOwn(changes, 'spaceId') && changes.spaceId !== item.spaceId)) {
      assertCatalogLinkUnique(items.value, { ...item, ...changes }, id)
    }
    if (['iconKey', 'iconPhoto', 'iconManual'].some(key => Object.hasOwn(changes, key)) && !Object.hasOwn(changes, 'catalogIconInherited')) changes = { ...changes, catalogIconInherited: false }
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
    if (item) {
      if (snapshot.catalogId !== item.catalogId || snapshot.spaceId !== item.spaceId) assertCatalogLinkUnique(items.value, snapshot, snapshot.id)
      Object.assign(item, structuredClone(snapshot))
    }
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
    if (getItem(removed.item.id)) { recentlyRemoved.value = null; return }
    assertCatalogLinkUnique(items.value, removed.item)
    recentlyRemoved.value = null
    items.value.splice(Math.min(removed.index, items.value.length), 0, structuredClone(removed.item))
  }

  function clearRecentlyRemoved() {
    recentlyRemoved.value = null
  }

  // 001 FR-006：加入時待買數量 1；移出時清除。加入時一併取消延後（specs/005 SNZ-04）。
  function addToShoppingList(id) {
    clearShoppingCompletion(id)
    updateItem(id, { inShoppingList: true, quantity: 1, addedToShoppingListDate: toDateString(), snoozedUntil: null, shoppingCompletedAt: null, shoppingCompletedQuantity: null, shoppingCompletedBy: null, shoppingClaimantId: null })
  }

  // 首頁多選批次加入（specs/004 FR-405）。
  function addManyToShoppingList(ids) {
    ids.forEach(addToShoppingList)
  }

  function removeFromShoppingList(id) {
    clearShoppingCompletion(id)
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

  // specs/009 FR-913：重新開啟不再填寫，直接用補貨紀錄重算；推算日已過就直接是「該補貨了」。
  function enableReminder(id) {
    updateItem(id, { reminderEnabled: true, snoozedUntil: null })
  }

  // 套用新的紀錄清單：上次補貨日一律等於最新一筆。下次預計補貨日由紀錄即時推算（specs/009 FR-912），
  // 任何紀錄的新增、修改、刪除都用全部紀錄重算；預計補貨日因此改變時，舊的延後沒有意義（specs/005 SNZ-04）。
  function applyRestockRecords(id, records, extraChanges = {}) {
    const item = getItem(id)
    if (!item) return
    // 從 reactive 陣列取出的紀錄是 Proxy；存成原始物件，snapshotItem 的 structuredClone 才不會失敗。
    const restockRecords = records.map((record) => ({ ...toRaw(record) }))
    const changes = { restockRecords, lastRestockDate: getLatestRecord(restockRecords)?.date ?? null, ...extraChanges }
    const before = getNextRestockDate(item, remindWithinDays.value)
    const after = getNextRestockDate({ restockRecords }, remindWithinDays.value)
    if (before !== after) changes.snoozedUntil = null
    updateItem(id, changes)
  }

  // 001 FR-003：新增紀錄、移出購買清單並清除待買數量。
  function completeRestock(id, { date = toDateString(), quantity = 1 } = {}) {
    const item = getItem(id)
    if (!item) return
    clearShoppingCompletion(id)
    applyRestockRecords(id, [...item.restockRecords, createRestockRecord({ date, quantity })], {
      inShoppingList: false,
      quantity: null,
      addedToShoppingListDate: null,
      snoozedUntil: null,
    })
  }

  // specs/009 FR-907：補貨頁一次記錄多個用品。每項以 (空間, catalogId) 呼叫 ensureCatalogItem
  // 取得或建立空間用品（不再用名稱配對，全域用品改名後仍對得上），再呼叫 completeRestock。
  // 回傳 { ok: true, results, undo }：undo 還原這次所有用品的紀錄，並移除這次新建立的空間用品
  // （直接移除，不經 removeItem，才不會觸發「我的用品」的刪除 Toast）。
  // 任一項失敗時，先復原已處理的項目，回傳 { ok: false, error }，整批都不記錄。

  // entries：[{ catalogId, quantity }]
  function recordRestockBatch(entries, { spaceId, date }) {
    const createdIds = []
    const snapshots = []
    const results = []
    function undo() {
      for (const snapshot of snapshots) restoreItem(snapshot)
      if (createdIds.length) items.value = items.value.filter((item) => !createdIds.includes(item.id))
    }
    for (const entry of entries) {
      const ensured = ensureCatalogItem(spaceId, entry.catalogId)
      if (!ensured.ok) {
        undo()
        return { ok: false, error: ensured.error }
      }
      const { item, created } = ensured
      if (created) createdIds.push(item.id)
      else snapshots.push(snapshotItem(item.id))
      const datesBefore = countRecordDates(item.restockRecords)
      completeRestock(item.id, { date, quantity: entry.quantity })
      const datesAfter = countRecordDates(getItem(item.id).restockRecords)
      results.push({
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity: entry.quantity,
        // 第 2 個不同日期：開始推算下次補貨日（FR-907、FR-912）。
        startedInferring: datesBefore === 1 && datesAfter === 2,
      })
    }
    return { ok: true, results, undo }
  }

  // 購買清單完成後保留展示 24 小時；用品本身與補貨紀錄不刪除。
  const shoppingCompletionOperations = new Map()
  function clearShoppingCompletion(id) {
    shoppingCompletionOperations.delete(id)
    const item = getItem(id)
    if (item) updateItem(id, {
      shoppingCompletionOperation: null,
      shoppingCompletedAt: null,
      shoppingCompletedQuantity: null,
      shoppingCompletedBy: null,
    })
  }
  const shoppingFields = ['inShoppingList', 'quantity', 'addedToShoppingListDate', 'shoppingCompletedAt', 'shoppingCompletedQuantity', 'shoppingCompletedBy', 'shoppingClaimantId']
  // 預計補貨日由紀錄推算、不儲存，復原時只需還原延後設定。
  const restockReminderFields = ['snoozedUntil']
  function pickShoppingFields(item, fields) {
    return Object.fromEntries(fields.map(key => [key, item[key]]))
  }
  function undoShoppingOperation(operation) {
    if (!operation) return
    const item = getItem(operation.id)
    if (!item) return
    // 舊 Toast 的復原也必須失效，不能只刪除 Map 與存檔。
    if (operation.recordId && item.shoppingCompletionOperation?.recordId !== operation.recordId) return
    const changes = {}
    for (const key of Object.keys(operation.before)) {
      // 後續操作已改過的欄位保留，不以舊值覆蓋。
      if (Object.is(item[key], operation.after[key])) changes[key] = operation.before[key]
    }
    if (operation.recordId) {
      const records = item.restockRecords.filter(record => record.id !== operation.recordId)
      applyRestockRecords(item.id, records, changes)
      shoppingCompletionOperations.delete(item.id)
      updateItem(item.id, { shoppingCompletionOperation: null })
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
    updateItem(id, { shoppingCompletionOperation: operation })
    return operation
  }

  function reopenShoppingItem(id) {
    const item = getItem(id)
    if (!item || item.shoppingCompletedAt == null || item.shoppingCompletedBy !== 'self') return
    const operation = shoppingCompletionOperations.get(id) || item.shoppingCompletionOperation
    if (operation) {
      undoShoppingOperation(operation)
    } else {
      // 舊存檔只有已補貨狀態，沒有操作快照；恢復清單但保留無法確定來源的紀錄。
      updateItem(id, {
        inShoppingList: true,
        quantity: item.shoppingCompletedQuantity ?? 1,
        addedToShoppingListDate: item.addedToShoppingListDate || toDateString(),
        shoppingClaimantId: getSpace(item.spaceId)?.shared ? 'self' : null,
        shoppingCompletedAt: null,
        shoppingCompletedQuantity: null,
        shoppingCompletedBy: null,
      })
    }
  }

  function removeShoppingEntry(id) {
    const item = getItem(id)
    if (!item) return
    const before = pickShoppingFields(item, shoppingFields)
    clearShoppingCompletion(id)
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
      if (item.shoppingCompletedAt != null && now - item.shoppingCompletedAt >= SHOPPING_COMPLETED_KEEP_MS) {
        clearShoppingCompletion(item.id)
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

  function hasSpaceName(name, excludeId = null) {
    const normalized = limitSpaceName(name.trim()).normalize('NFC')
    return spaces.value.some(space => space.id !== excludeId && space.name.trim().normalize('NFC') === normalized)
  }

  function addSpace({ name, shared = false, color = 'green' }) {
    if (hasSpaceName(name)) return null
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
    if (typeof changes.name === 'string' && hasSpaceName(changes.name, id)) return
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
    // 我的用品正在篩選這個空間時，回到所有用品。
    if (inventorySpaceId.value === spaceId) inventorySpaceId.value = null
    return true
  }

  // 展示用邀請碼；正式版可將查詢替換為 API。
  function joinSpaceByCode(code) {
    const normalized = code.trim().toUpperCase()
    if (!normalized) return { ok: false, message: '請先輸入空間邀請碼' }
    if (!isValidInviteCode(normalized)) return { ok: false, message: '邀請碼格式不正確' }
    if (normalized === 'FUL-0010') return { ok: false, message: '空間人數已滿' }
    if (normalized === 'JON-0001') return { ok: false, message: '已經是成員' }
    const targetId = normalized === 'COM-8888' ? 'company' : normalized === 'FAM-8888' ? 'family' : null
    if (targetId && getSpace(targetId)) return { ok: false, message: '已經是成員' }
    const targetName = departedSpaces.value.find(entry => entry.space.id === targetId)?.space.name || (targetId === 'company' ? '公司' : '家庭')
    if (targetId && hasSpaceName(targetName)) return { ok: false, reason: 'duplicate-name', spaceName: targetName, message: '已有相同名稱的空間' }
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

  // 資料變動後寫入 localStorage（specs 外的持久化，見 docs/PERSISTENCE_DISCUSSION.md）。
  // 最近刪除、購買完成復原記錄、今天、篩選等暫態不存。
  // 寫入失敗（儲存空間不足等）時為 true，讓畫面提示照片可能不會保留（specs/008 FR-807）。
  const persistFailed = ref(false)
  function catalogPersistenceSnapshot() {
    return JSON.parse(JSON.stringify({ demoSeeds: [...demoSeeds], items: toRaw(items.value), spaces: toRaw(spaces.value),
      customCategories: toRaw(customCategories.value), departedSpaces: toRaw(departedSpaces.value) }))
  }
  function applyCatalogLinkedItems(nextItems) {
    const byId = new Map(nextItems.map(item => [item.id, item]))
    const fields = ['catalogId', 'name', 'category', 'iconKey', 'iconPhoto', 'iconManual', 'catalogIconInherited']
    for (const item of items.value) {
      const next = byId.get(item.id)
      if (next) for (const field of fields) if (Object.hasOwn(next, field)) item[field] = next[field]
    }
  }
  const unregisterBridge = catalog.registerItemsBridge({ snapshot: catalogPersistenceSnapshot, apply: applyCatalogLinkedItems })
  onScopeDispose(unregisterBridge)
  function getItemByCatalogId(spaceId, catalogId) {
    if (typeof catalogId !== 'string' || !catalogId) throw catalogLinkError('INVALID_INPUT', '全域用品 ID 無效。')
    const matches = items.value.filter(item => item.spaceId === spaceId && item.catalogId === catalogId)
    if (matches.length > 1) throw catalogLinkError('AMBIGUOUS_CATALOG_LINK', '此空間有多筆相同關聯，請先確認舊資料。')
    return matches[0] ?? null
  }
  function ensureCatalogItem(spaceId, catalogId) {
    if (!getSpace(spaceId)) return { ok: false, error: { code: 'NOT_FOUND', message: '找不到空間。' } }
    const globalItem = catalog.getById(catalogId)
    if (!globalItem) return { ok: false, error: { code: 'NOT_FOUND', message: '找不到全域用品。' } }
    try {
      const existing = getItemByCatalogId(spaceId, catalogId)
      if (existing) return { ok: true, item: existing, created: false }
      if (items.value.some(item => item.spaceId === spaceId && normalizeCatalogName(item.name) === normalizeCatalogName(globalItem.name))) {
        return { ok: false, error: { code: 'SPACE_NAME_TAKEN', message: '此空間已有同名但未能安全關聯的用品。' } }
      }
      const item = addItem({ name: globalItem.name, category: globalItem.category, unit: globalItem.unit,
        iconKey: globalItem.iconKey, iconPhoto: globalItem.iconPhoto, iconManual: false, catalogIconInherited: true, spaceId, catalogId })
      return { ok: true, item, created: true }
    } catch (error) { return { ok: false, error: { code: error.code || 'INVALID_INPUT', message: error.message } } }
  }
  function migrateCatalogAssociations() {
    const next = migrateCatalogLinks(items.value, catalog.allItems, catalog.deletedCatalogItems)
    const snapshot = catalogPersistenceSnapshot()
    if (!savePersisted(STORE_KEYS.items, { ...snapshot, items: next })) return { ok: false, error: { code: 'STORAGE_FAILED', message: '無法儲存用品關聯。' } }
    applyCatalogLinkedItems(next)
    return { ok: true }
  }
  const scheduleSave = createDebouncedSaver(() => { persistFailed.value = !savePersisted(STORE_KEYS.items, catalogPersistenceSnapshot()) })
  watch([items, spaces, customCategories, departedSpaces], scheduleSave, { deep: true })
  if (needsFamilyAlcoholSeed || needsCatalogSave) scheduleSave()

  return {
    getItemByCatalogId, ensureCatalogItem, migrateCatalogAssociations,
    persistFailed,
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
    remindWithinDays,
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
    completeRestock,
    recordRestockBatch,
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
    hasSpaceName,
    getSpace,
    updateSpace,
    addSpaceMember,
    getSpaceMembers,
    leaveSpace,
    joinSpaceByCode,
  }
})
