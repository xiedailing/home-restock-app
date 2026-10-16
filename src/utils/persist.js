// localStorage 持久化：所有讀寫都包 try/catch，無痕模式、禁用儲存或空間已滿時照常運作，只是不保存。
// 存檔格式帶版本號；版本不符或 JSON 損壞時回傳 null，由呼叫端改用示範資料。
export const STORAGE_VERSION = 2
const PREFIX = 'home-restock:v1:'

export const STORE_KEYS = { items: 'items', profile: 'profile', notifications: 'notifications', catalog: 'catalog' }

export function loadPersisted(name) {
  try {
    const raw = localStorage.getItem(PREFIX + name)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== STORAGE_VERSION || typeof parsed.data !== 'object' || parsed.data === null) return null
    return parsed.data
  } catch {
    return null
  }
}

// 回傳是否寫入成功；失敗（空間已滿等）不丟錯。
export function savePersisted(name, data) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify({ version: STORAGE_VERSION, data }))
    return true
  } catch {
    return false
  }
}

export function clearPersisted() {
  try {
    for (const name of Object.values(STORE_KEYS)) localStorage.removeItem(PREFIX + name)
  } catch { /* 無法使用 localStorage 時略過。 */ }
}

// 網址帶 ?reset=1 時清除存檔並從網址移除該參數，讓示範前一個動作就能還原。
// 這是匯入時的副作用：各 store 匯入本模組，因此一定早於它們讀取存檔。
function applyResetParam() {
  if (typeof location === 'undefined') return
  const url = new URL(location.href)
  if (url.searchParams.get('reset') !== '1') return
  clearPersisted()
  url.searchParams.delete('reset')
  try { history.replaceState(history.state, '', url.pathname + url.search + url.hash) } catch { /* 略過。 */ }
}
applyResetParam()

// 合併短時間內的連續變更，再於分頁隱藏或關閉時立即寫入，避免遺失最後一次修改。
export function createDebouncedSaver(save, delay = 300) {
  let timer = null
  function flush() {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    save()
  }
  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(flush, delay)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
    window.addEventListener('pagehide', flush)
  }
  return schedule
}
