// 設定頁專用投影／驗證；不建立第二份用品清單，也不寫入任何 Store。
export function categoryCounts(items, names) {
  return names.map(name => ({ name, count: items.filter(item => item.category === name).length }))
}
export function isOtherCatalogNameTaken(items, name, currentId) {
  const normalized = name.trim().toLowerCase()
  return !!normalized && items.some(item => item.id !== currentId && item.name.trim().toLowerCase() === normalized)
}
