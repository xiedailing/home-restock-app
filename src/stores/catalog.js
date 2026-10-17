// 全域用品選項，獨立於空間用品與補貨紀錄（FR-904、FR-909）。
import { computed, readonly, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { PRESET_ITEMS } from '../models/itemCategories.js'
import { commitCatalogWithLinks, registerCatalogItemsBridge } from '../utils/catalogLinks.js'
import { generateId } from '../utils/id.js'
import { createDebouncedSaver, loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'

const normalizeName = name => typeof name === 'string' ? name.trim().toLowerCase() : ''
const editableFields = ['name', 'iconKey', 'iconPhoto', 'iconManual', 'category', 'unit']
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
// 預設值不存檔、不隨篩選重排；覆寫圖示也不改變原本的穩定 ID。
const presetItems = Object.freeze(PRESET_ITEMS.map(item => Object.freeze({
  ...item, id: `preset:${item.iconKey}`, iconPhoto: null, iconManual: false,
})))
const presetsById = new Map(presetItems.map(item => [item.id, item]))
const failure = (code, message) => ({ ok: false, error: { code, message } })

// 回傳經過驗證的 patch；不接受 ID、建立時間或其他欄位。
function normalizeChanges(changes) {
  if (!isObject(changes) || !Object.keys(changes).length) return null
  const patch = {}
  for (const [key, value] of Object.entries(changes)) {
    if (!editableFields.includes(key)) return null
    if (['name', 'category', 'unit'].includes(key)) {
      if (typeof value !== 'string' || !value.trim()) return null
      patch[key] = value.trim()
    } else if (key === 'iconManual') {
      if (typeof value !== 'boolean') return null
      patch[key] = value
    } else {
      if (value !== null && (typeof value !== 'string' || !value.trim())) return null
      patch[key] = value
    }
  }
  return patch
}

export const useCatalogStore = defineStore('catalog', () => {
  const saved = loadPersisted(STORE_KEYS.catalog)
  const validItem = item => item && typeof item.id === 'string' && item.id.length > 0
    && !item.id.startsWith('preset:') && normalizeName(item.name)
    && typeof item.category === 'string' && item.category.trim()
    && typeof item.unit === 'string' && item.unit.trim()
    && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt))
  // 只記錄已刪除 ID、名稱與時間，留給後續關聯遷移辨識；此 Store 不處理空間資料。
  const deletedCatalogItems = ref((Array.isArray(saved?.deletedCatalogItems) ? saved.deletedCatalogItems : [])
    .filter(item => item && typeof item.id === 'string' && item.id && !item.id.startsWith('preset:')
      && normalizeName(item.name) && typeof item.deletedAt === 'string' && Number.isFinite(Date.parse(item.deletedAt)))
    .map(({ id, name, deletedAt }) => ({ id, name, deletedAt })))
  const deletedIds = new Set(deletedCatalogItems.value.map(item => item.id))
  const catalogItems = ref((Array.isArray(saved?.catalogItems) ? saved.catalogItems : [])
    .filter(item => validItem(item) && !deletedIds.has(item.id))
    .slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)))
  const overrides = ref(Object.fromEntries(Object.entries(isObject(saved?.presetOverrides) ? saved.presetOverrides : {})
    .flatMap(([id, changes]) => {
      const patch = normalizeChanges(changes)
      return presetsById.has(id) && patch ? [[id, patch]] : []
    })))
  const effectivePresets = computed(() => presetItems.map(item => ({ ...item, ...overrides.value[item.id] })))
  const allItems = computed(() => [...catalogItems.value, ...effectivePresets.value])
  const justAddedId = ref(null)

  function isNameTaken(name, excludeId = null) {
    const normalized = normalizeName(name)
    return !!normalized && allItems.value.some(item => item.id !== excludeId && normalizeName(item.name) === normalized)
  }
  function getById(id) {
    return allItems.value.find(item => item.id === id) ?? null
  }
  function clearJustAddedId() {
    justAddedId.value = null
  }
  function addCatalogItem(input = {}) {
    if (!isObject(input)) return null
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const category = typeof input.category === 'string' ? input.category.trim() : ''
    const unit = typeof input.unit === 'string' ? input.unit.trim() : ''
    if (!name || !category || !unit || isNameTaken(name)) return null
    const item = {
      id: generateId(), name, iconKey: input.iconKey ?? null, iconPhoto: input.iconPhoto ?? null,
      iconManual: input.iconManual ?? false, category, unit, createdAt: new Date().toISOString(),
    }
    catalogItems.value.unshift(item)
    justAddedId.value = item.id
    return item
  }

  // 新寫入 API 先同步保存完整 Catalog，再套用記憶體；儲存失敗不回報成功。
  // 既有 addCatalogItem 仍維持延遲存檔與 item/null 回傳，不破壞新增頁契約。
  let committing = false
  function commitCatalog(nextItems, nextOverrides, nextDeleted) {
    const beforeCatalog = { catalogItems: catalogItems.value, presetOverrides: overrides.value, deletedCatalogItems: deletedCatalogItems.value }
    const afterCatalog = { catalogItems: nextItems, presetOverrides: nextOverrides, deletedCatalogItems: nextDeleted }
    const afterAll = [...nextItems, ...presetItems.map(item => ({ ...item, ...nextOverrides[item.id] }))]
    const result = commitCatalogWithLinks(catalogItems, beforeCatalog, afterCatalog, allItems.value, afterAll)
    if (!result.ok) return result
    committing = true
    try {
      catalogItems.value = nextItems
      overrides.value = nextOverrides
      deletedCatalogItems.value = nextDeleted
    } finally { committing = false }
    return result
  }
  function findForMutation(id) {
    if (typeof id !== 'string' || !id.trim()) return failure('INVALID_INPUT', '用品 ID 無效。')
    const item = getById(id)
    return item ? { ok: true, item } : failure('NOT_FOUND', '找不到用品。')
  }
  function updateCatalogItem(id, changes) {
    const found = findForMutation(id)
    if (!found.ok) return found
    const patch = normalizeChanges(changes)
    if (!patch) return failure('INVALID_INPUT', '請提供有效的名稱、圖示、分類或單位；不可修改 ID 或建立時間。')
    const item = { ...found.item, ...patch }
    if (isNameTaken(item.name, id)) return failure('NAME_TAKEN', '此用品已經存在')
    let nextItems = catalogItems.value
    const nextOverrides = { ...overrides.value }
    if (presetsById.has(id)) {
      const base = presetsById.get(id)
      const changed = Object.fromEntries(editableFields.filter(key => item[key] !== base[key]).map(key => [key, item[key]]))
      if (Object.keys(changed).length) nextOverrides[id] = changed
      else delete nextOverrides[id]
    } else nextItems = catalogItems.value.map(existing => existing.id === id ? item : existing)
    const result = commitCatalog(nextItems, nextOverrides, deletedCatalogItems.value)
    if (!result.ok) return result
    return { ok: true, item: getById(id) }
  }
  function resetPresetOverride(id) {
    const found = findForMutation(id)
    if (!found.ok) return found
    const base = presetsById.get(id)
    if (!base) return failure('INVALID_INPUT', '只能還原系統預設用品。')
    if (isNameTaken(base.name, id)) return failure('NAME_TAKEN', '還原後的用品名稱已經存在。')
    const nextOverrides = { ...overrides.value }
    delete nextOverrides[id]
    const result = commitCatalog(catalogItems.value, nextOverrides, deletedCatalogItems.value)
    if (!result.ok) return result
    return { ok: true, item: getById(id) }
  }
  function removeCatalogItem(id) {
    const found = findForMutation(id)
    if (!found.ok) return found
    if (presetsById.has(id)) return failure('PRESET_DELETE_FORBIDDEN', '系統預設用品不可刪除。')
    const tombstone = { id, name: found.item.name, deletedAt: new Date().toISOString() }
    const result = commitCatalog(catalogItems.value.filter(item => item.id !== id), overrides.value, [...deletedCatalogItems.value, tombstone])
    if (!result.ok) return result
    if (justAddedId.value === id) clearJustAddedId()
    return { ok: true, item: found.item }
  }

  const scheduleSave = createDebouncedSaver(() => {
    savePersisted(STORE_KEYS.catalog, { catalogItems: catalogItems.value, presetOverrides: overrides.value, deletedCatalogItems: deletedCatalogItems.value })
  })
  watch([catalogItems, overrides, deletedCatalogItems], () => { if (!committing) scheduleSave() }, { deep: true, flush: 'sync' })

  function registerItemsBridge(bridge) { return registerCatalogItemsBridge(catalogItems, bridge) }

  return { registerItemsBridge, catalogItems, allItems, getById, justAddedId, clearJustAddedId, isNameTaken, addCatalogItem,
    presetOverrides: readonly(overrides), deletedCatalogItems: readonly(deletedCatalogItems),
    updateCatalogItem, resetPresetOverride, removeCatalogItem }
})
