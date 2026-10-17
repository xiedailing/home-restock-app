// Catalog／空間用品的本機同步交易。prepared 中斷時回復 before，committed 時完成 after。
// 不依賴 Pinia；persist 在讀取兩種資料之前先完成復原，避免載入混合狀態。
const object = value => value && typeof value === 'object' && !Array.isArray(value)
function readJournal(config) {
  const raw = localStorage.getItem(config.prefix + config.journalKey)
  if (!raw) return null
  const journal = JSON.parse(raw)
  if (journal.version !== config.version) throw new Error('交易存檔版本不符。')
  const data = journal.data
  if (!['prepared', 'committed'].includes(data?.state) || !object(data.before) || !object(data.after)
    || !['catalog', 'items'].every(key => typeof data.before[key] === 'string' && typeof data.after[key] === 'string')) throw new Error('交易紀錄無效。')
  for (const pair of [data.before, data.after]) {
    for (const key of ['catalog', 'items']) {
      const envelope = JSON.parse(pair[key])
      if (envelope.version !== config.version || !object(envelope.data) || !Array.isArray(envelope.data[key === 'catalog' ? 'catalogItems' : 'items'])) throw new Error('交易資料無效。')
    }
  }
  return data
}
function writePair(config, pair) {
  for (const name of ['catalog', 'items']) {
    const key = config.prefix + name
    if (localStorage.getItem(key) !== pair[name]) localStorage.setItem(key, pair[name])
  }
}
export function recoverCatalogTransaction(config) {
  try {
    const journal = readJournal(config)
    if (!journal) return true
    writePair(config, journal.state === 'committed' ? journal.after : journal.before)
    localStorage.removeItem(config.prefix + config.journalKey)
    return true
  } catch { return false }
}
export function commitCatalogTransaction(config, before, after) {
  if (!recoverCatalogTransaction(config)) return { ok: false, error: { code: 'RECOVERY_REQUIRED', message: '先前的用品同步尚未復原，請恢復本機儲存後重新整理。' } }
  const encode = data => JSON.stringify({ version: config.version, data })
  let journal
  try {
    journal = { state: 'prepared', before: { catalog: encode(before.catalog), items: encode(before.items) }, after: { catalog: encode(after.catalog), items: encode(after.items) } }
    localStorage.setItem(config.prefix + config.journalKey, encode(journal))
  } catch { return { ok: false, error: { code: 'STORAGE_FAILED', message: '無法保存用品同步交易，資料未變更。' } } }
  try {
    writePair(config, journal.after)
    localStorage.setItem(config.prefix + config.journalKey, encode({ ...journal, state: 'committed' }))
  } catch {
    const recovered = recoverCatalogTransaction(config)
    return { ok: false, error: { code: recovered ? 'STORAGE_FAILED' : 'RECOVERY_REQUIRED', message: recovered ? '用品同步未完成，已還原原資料。' : '用品同步中斷，請恢復本機儲存後重新整理，暫勿繼續編輯。' } }
  }
  // committed 已是完整可復原結果；若清理失敗，下次讀取會先復原／清理，禁止混合載入。
  try { localStorage.removeItem(config.prefix + config.journalKey) } catch { /* 下次啟動復原。 */ }
  return { ok: true }
}
