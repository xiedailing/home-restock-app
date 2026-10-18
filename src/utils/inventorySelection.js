// 「我的用品」長按多選的純邏輯（specs/013）：不碰 Vue，方便單獨測試。

// FR-1302：搜尋或類別改變後，不在目前結果內的已選項目取消選取。
export function pruneSelection(selectedIds, visibleItems) {
  const visible = new Set(visibleItems.map((item) => item.id))
  const kept = selectedIds.filter((id) => visible.has(id))
  return kept.length === selectedIds.length ? selectedIds : kept
}

export function toggleSelection(selectedIds, id) {
  return selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]
}

// FR-1304、FR-1305：已在清單的略過（不覆蓋共享空間他人的認領），其餘批次加入。
// 加入前先為每個要加入的用品存快照；restore 只還原這一批新加入的用品。
// store 需提供 snapshotItem、addManyToShoppingList、restoreItem（stores/items.js）。
export function addSelectedToShoppingList(store, selectedIds, items) {
  const selected = new Set(selectedIds)
  const toAdd = items.filter((item) => selected.has(item.id) && !item.inShoppingList)
  if (!toAdd.length) return { addedCount: 0, restore: null }
  // 快照與加入必須在同一個同步流程內，store 才能記住加入後的狀態供復原比對。
  const snapshots = toAdd.map((item) => store.snapshotItem(item.id)).filter(Boolean)
  store.addManyToShoppingList(toAdd.map((item) => item.id))
  return {
    addedCount: toAdd.length,
    restore: () => snapshots.forEach((snapshot) => store.restoreItem(snapshot)),
  }
}
