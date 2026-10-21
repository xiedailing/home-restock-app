// Asset requests from a tab opened before deployment can resolve to SPA HTML.
// Keep this separate from persistence recovery: reloading must never reset data.
export function isModuleLoadError(error) {
  return /MIME|dynamically imported module|Importing a module script failed|Failed to fetch.*module|Loading chunk|module script/i.test(String(error?.message || error))
}
export function startupErrorMessage(error) {
  if (isModuleLoadError(error)) return '補補程式載入失敗，可能是網站已更新或網路暫時中斷。請重新整理載入最新版；不需要清除網站資料或重置展示資料。'
  return `無法載入補補：${error?.message || String(error)}。若為儲存或資料復原問題，請恢復可用儲存空間後重新整理。`
}
