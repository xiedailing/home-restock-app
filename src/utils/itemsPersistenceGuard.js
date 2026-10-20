import { loadPersisted, savePersisted, STORAGE_VERSION, STORE_KEYS } from './persist.js'
import { generateId } from './id.js'
export const ITEMS_WRITE_LOCK = 'bubu-items-write'
export const ITEMS_CONFLICT_MESSAGE = '用品資料已在其他分頁更新，請重新載入後再操作。'
const key = 'home-restock:v1:' + STORE_KEYS.items
// A per-store baseline: never silently adopt another tab's snapshot.
export function createItemsPersistenceGuard(onConflict = () => {}) {
  let baseline
  try { baseline = localStorage.getItem(key) } catch { /* Render existing fallback UI, but refuse writes until reload. */ }
  let conflicted = false
  function conflict() {
    conflicted = true; onConflict(ITEMS_CONFLICT_MESSAGE)
    throw Object.assign(new Error(ITEMS_CONFLICT_MESSAGE), { code: 'STALE_ITEMS' })
  }
  function assertCurrent() {
    if (baseline === undefined) throw Object.assign(new Error('無法讀取用品存檔，請允許儲存空間後重新載入。'), { code: 'STORAGE_FAILED' })
    // Finish any existing same-tab catalog recovery before comparing the envelope.
    loadPersisted(STORE_KEYS.items)
    if (conflicted || localStorage.getItem(key) !== baseline) conflict()
  }
  function write(data) {
    assertCurrent()
    const current = baseline && JSON.parse(baseline)
    if (current && JSON.stringify(current.data) === JSON.stringify(data)) return true
    const revision = generateId()
    const encoded = JSON.stringify({ version: STORAGE_VERSION, data, revision })
    if (!savePersisted(STORE_KEYS.items, data, { revision })) return false
    baseline = encoded
    return true
  }
  // Only after this store's own successful catalog/items transaction.
  function didCommitCatalog(expected) {
    try {
      const raw = localStorage.getItem(key)
      if (JSON.stringify(raw && JSON.parse(raw).data) === JSON.stringify(expected)) baseline = raw
    } catch { /* Do not adopt an unreadable or foreign transaction result. */ }
  }
  async function withLock(operation) {
    if (globalThis.navigator?.locks?.request) return navigator.locks.request(ITEMS_WRITE_LOCK, () => { assertCurrent(); return operation() })
    // Compatibility path for existing synchronous APIs; optimistic only, not atomic.
    assertCurrent(); return operation()
  }
  return { assertCurrent, write, withLock, didCommitCatalog }
}
