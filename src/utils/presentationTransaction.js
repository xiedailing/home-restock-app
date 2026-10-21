// 原始存檔交易；prepared 回復原值，committed 完成新值。包含個人資料與通知偏好；瀏覽器權限由瀏覽器管理。
const LEGACY_KEYS = ['items', 'catalog', 'shared-notifications', 'native-notifications', 'catalog-integration']
export const PRESENTATION_KEYS = [...LEGACY_KEYS, 'profile', 'notifications']
export const PRESENTATION_PREFIX = 'home-restock:v1:'
export const PRESENTATION_JOURNAL = PRESENTATION_PREFIX + 'presentation-transaction'
export const PRESENTATION_BACKUP = PRESENTATION_PREFIX + 'presentation-backup'
export function presentationSnapshot(storage) {
  return Object.fromEntries(PRESENTATION_KEYS.map(key => [key, storage.getItem(PRESENTATION_PREFIX + key)]))
}
function validate(snapshot) {
  if (!snapshot || !LEGACY_KEYS.every(key => Object.hasOwn(snapshot, key)) || !PRESENTATION_KEYS.every(key => !Object.hasOwn(snapshot, key) || snapshot[key] === null || typeof snapshot[key] === 'string')) throw new Error('展示備份格式不完整。')
}
function apply(storage, snapshot) {
  validate(snapshot)
  for (const key of PRESENTATION_KEYS) {
    // 舊備份與中斷交易未包含個人設定時保留現值。
    if (!Object.hasOwn(snapshot, key)) continue
    const value = snapshot[key], name = PRESENTATION_PREFIX + key
    if (value === null) storage.removeItem(name)
    else storage.setItem(name, value)
  }
}
export function recoverPresentationTransaction(storage) {
  const raw = storage.getItem(PRESENTATION_JOURNAL)
  if (!raw) return
  const journal = JSON.parse(raw)
  if (journal.version !== 1 || !['prepared', 'committed'].includes(journal.state)) throw new Error('展示交易無法辨識，暫停載入以避免混合資料。')
  validate(journal.before); validate(journal.after)
  apply(storage, journal.state === 'committed' ? journal.after : journal.before)
  storage.removeItem(PRESENTATION_JOURNAL)
}
export function commitPresentationTransaction(storage, after) {
  recoverPresentationTransaction(storage)
  validate(after)
  const before = presentationSnapshot(storage)
  // 先成功保存備份與 prepared，才可寫入任何正式資料。
  storage.setItem(PRESENTATION_BACKUP, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), before }))
  const journal = { version: 1, state: 'prepared', before, after }
  storage.setItem(PRESENTATION_JOURNAL, JSON.stringify(journal))
  try {
    apply(storage, after)
    storage.setItem(PRESENTATION_JOURNAL, JSON.stringify({ ...journal, state: 'committed' }))
  } catch (error) {
    try { recoverPresentationTransaction(storage) } catch { throw new Error('展示更新中斷；請恢復儲存空間後重新開啟本頁，完成復原前不要編輯資料。') }
    throw new Error('展示更新失敗，已還原原資料：' + error.message)
  }
  // committed 即代表完整成功；清理失敗時下次啟動會完成新資料。
  try { storage.removeItem(PRESENTATION_JOURNAL) } catch { /* recover before next app boot */ }
}
