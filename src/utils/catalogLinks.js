import { startUnitPeriod } from './unitPeriods.js'
// Catalog 關聯與同步交易：單位變更只新增週期與補齊歷史快照，不改紀錄日期／數量或推算公式。
import { loadPersisted, savePersisted, commitCatalogStatePair, STORE_KEYS } from './persist.js'
const bridges = new WeakMap()
export const normalizeCatalogName = name => typeof name === 'string' ? name.trim().toLowerCase() : ''
export function registerCatalogItemsBridge(pinia, bridge) { bridges.set(pinia, bridge); return () => bridges.delete(pinia) }
export function migrateCatalogLinks(items, catalogItems, deletedItems = []) {
  const deletedNames = new Set(deletedItems.map(item => normalizeCatalogName(item.name)))
  const occupied = new Set(items.filter(item => item.catalogId).map(item => JSON.stringify([item.spaceId, item.catalogId])))
  const namesInSpace = new Map()
  for (const item of items) {
    const key = JSON.stringify([item.spaceId, normalizeCatalogName(item.name)])
    namesInSpace.set(key, (namesInSpace.get(key) || 0) + 1)
  }
  return items.map(item => {
    if (typeof item.catalogId === 'string' && item.catalogId) return item
    const unlinked = { ...item, catalogId: null }
    const name = normalizeCatalogName(item.name)
    if (!name || deletedNames.has(name) || namesInSpace.get(JSON.stringify([item.spaceId, name])) !== 1) return unlinked
    const candidates = catalogItems.filter(entry => normalizeCatalogName(entry.name) === name
      && entry.category === item.category && entry.unit === item.unit)
    if (candidates.length !== 1) return unlinked
    const key = JSON.stringify([item.spaceId, candidates[0].id])
    if (occupied.has(key)) return unlinked
    occupied.add(key)
    return { ...item, catalogId: candidates[0].id }
  })
}
export function catalogLinkError(code, message) { const error = new Error(message); error.code = code; return error }
export function assertCatalogLinkUnique(items, item, excludeId = null) {
  if (item.catalogId != null && (typeof item.catalogId !== 'string' || !item.catalogId.trim())) throw catalogLinkError('INVALID_INPUT', '全域用品 ID 無效。')
  if (item.catalogId && items.some(existing => existing.id !== excludeId && existing.spaceId === item.spaceId && existing.catalogId === item.catalogId)) {
    throw catalogLinkError('DUPLICATE_CATALOG_LINK', '此空間已有相同的全域用品。')
  }
}
export function planCatalogSync(items, beforeAll, afterAll, deletedItems, unitChangeConfirmed = false) {
  // 單位變更不得順便以名稱替舊資料建立關聯。
  const hasUnitChange = beforeAll.some(before => afterAll.some(after => after.id === before.id && after.unit !== before.unit))
  const linked = hasUnitChange ? items : migrateCatalogLinks(items, beforeAll, deletedItems)
  const previous = new Map(beforeAll.map(item => [item.id, item]))
  const next = new Map(afterAll.map(item => [item.id, item]))
  const changes = new Map()
  for (const item of linked) {
    const before = previous.get(item.catalogId)
    const after = next.get(item.catalogId)
    if (!before || !after) continue // 刪 Catalog 不刪空間用品、不移除舊 ID。
    const patch = {}
    if (before.unit !== after.unit) {
      if (!unitChangeConfirmed) return { ok: false, error: { code: 'UNIT_CHANGE_CONFIRMATION_REQUIRED', message: '請先確認單位變更。' } }
      if (item.unit !== before.unit) return { ok: false, error: { code: 'SPACE_UNIT_MISMATCH', message: '空間用品單位不一致，請先確認資料。' } }
      const nextPeriod = startUnitPeriod(item, after.unit)
      Object.assign(patch, { unit: nextPeriod.unit, unitPeriodId: nextPeriod.unitPeriodId, restockRecords: nextPeriod.restockRecords, snoozedUntil: null })
    }
    if (before.name !== after.name) {
      if (linked.some(other => other.id !== item.id && other.spaceId === item.spaceId && normalizeCatalogName(other.name) === normalizeCatalogName(after.name))) {
        return { ok: false, error: { code: 'SPACE_NAME_TAKEN', message: '此空間已有相同名稱的用品，無法同步修改。' } }
      }
      patch.name = after.name
    }
    if (before.category !== after.category) patch.category = after.category
    const iconChanged = ['iconKey', 'iconPhoto', 'iconManual'].some(key => before[key] !== after[key])
    if (iconChanged && (item.catalogIconInherited === true || (!item.iconManual && !item.iconPhoto))) {
      Object.assign(patch, { iconKey: after.iconKey, iconPhoto: after.iconPhoto, iconManual: false, catalogIconInherited: true })
    }
    if (Object.keys(patch).length) changes.set(item.id, patch)
  }
  return { ok: true, items: linked.map(item => changes.has(item.id) ? { ...item, ...changes.get(item.id) } : item) }
}
export function commitCatalogWithLinks(pinia, beforeCatalog, afterCatalog, beforeAll, afterAll, removedCategory = null, restoredCategory = null, options = {}) {
  const bridge = bridges.get(pinia)
  let beforeItems
  try { beforeItems = bridge?.snapshot() ?? loadPersisted(STORE_KEYS.items) }
  catch { return { ok: false, error: { code: 'RECOVERY_REQUIRED', message: '用品同步尚待復原，請重新整理後再試。' } } }
  if ((removedCategory || restoredCategory) && (!bridge?.applyCategories || !Array.isArray(beforeItems?.customCategories))) return { ok: false, error: { code: 'CATEGORY_CONTEXT_REQUIRED', message: '請從設定頁重新開啟分類後再試。' } }
  if (removedCategory && !beforeItems.customCategories.includes(removedCategory) && !beforeAll.some(item => item.category === removedCategory) && !beforeItems.items.some(item => item.category === removedCategory)) return { ok: false, error: { code: 'NOT_FOUND', message: '找不到此分類。' } }
  if (restoredCategory && beforeItems.customCategories.includes(restoredCategory.name)) return { ok: false, error: { code: 'CATEGORY_NAME_TAKEN', message: '已有同名分類，無法復原。' } }
  if (!beforeItems || !Array.isArray(beforeItems.items)) {
    return savePersisted(STORE_KEYS.catalog, afterCatalog) ? { ok: true } : { ok: false, error: { code: 'STORAGE_FAILED', message: '無法儲存用品。' } }
  }
  const plan = planCatalogSync(beforeItems.items, beforeAll, afterAll, beforeCatalog.deletedCatalogItems, options.confirmUnitChange === true)
  if (!plan.ok) return plan
  const afterItems = { ...beforeItems, items: plan.items }
  if (removedCategory) afterItems.customCategories = beforeItems.customCategories.filter(name => name !== removedCategory)
  if (restoredCategory) {
    afterItems.customCategories = [...beforeItems.customCategories]
    if (restoredCategory.index >= 0) afterItems.customCategories.splice(Math.min(restoredCategory.index, afterItems.customCategories.length), 0, restoredCategory.name)
  }
  const result = commitCatalogStatePair({ catalog: beforeCatalog, items: beforeItems }, { catalog: afterCatalog, items: afterItems })
  if (result.ok) {
    bridge?.apply(plan.items)
    if (removedCategory || restoredCategory) bridge.applyCategories(afterItems.customCategories)
  }
  return result.ok && removedCategory ? { ...result, categoryIndex: beforeItems.customCategories.indexOf(removedCategory) } : result
}
