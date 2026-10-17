// 僅處理 Catalog 關聯與中繼資料；不讀寫補貨紀錄、提醒、認領或推算欄位。
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
export function planCatalogSync(items, beforeAll, afterAll, deletedItems) {
  const linked = migrateCatalogLinks(items, beforeAll, deletedItems)
  const previous = new Map(beforeAll.map(item => [item.id, item]))
  const next = new Map(afterAll.map(item => [item.id, item]))
  const changes = new Map()
  for (const item of linked) {
    const before = previous.get(item.catalogId)
    const after = next.get(item.catalogId)
    if (!before || !after) continue // 刪 Catalog 不刪空間用品、不移除舊 ID。
    if (before.unit !== after.unit) return { ok: false, error: { code: 'UNIT_CHANGE_NOT_SUPPORTED', message: '單位週期尚未串接，暫不允許修改已關聯用品的單位。' } }
    const patch = {}
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
export function commitCatalogWithLinks(pinia, beforeCatalog, afterCatalog, beforeAll, afterAll) {
  const bridge = bridges.get(pinia)
  let beforeItems
  try { beforeItems = bridge?.snapshot() ?? loadPersisted(STORE_KEYS.items) }
  catch { return { ok: false, error: { code: 'RECOVERY_REQUIRED', message: '用品同步尚待復原，請重新整理後再試。' } } }
  if (!beforeItems || !Array.isArray(beforeItems.items)) {
    return savePersisted(STORE_KEYS.catalog, afterCatalog) ? { ok: true } : { ok: false, error: { code: 'STORAGE_FAILED', message: '無法儲存用品。' } }
  }
  const plan = planCatalogSync(beforeItems.items, beforeAll, afterAll, beforeCatalog.deletedCatalogItems)
  if (!plan.ok) return plan
  const result = commitCatalogStatePair({ catalog: beforeCatalog, items: beforeItems }, { catalog: afterCatalog, items: { ...beforeItems, items: plan.items } })
  if (result.ok) bridge?.apply(plan.items)
  return result
}
