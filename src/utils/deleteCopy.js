// 刪除用品確認 modal 的共用文案（我的用品、用品詳情、設定／用品分類）。
export function deleteItemTitle(item) {
  return `刪除${item?.name || '用品'}？`
}

export function deleteItemMessage(item, space) {
  const spaceName = space?.name || '未指定空間'
  if (space?.shared) return `將從「${spaceName}」空間刪除並同步所有成員，相關紀錄與提醒將一併刪除。`
  return `「${item.name}」將從「${spaceName}」空間刪除，補貨提醒與紀錄也會一併刪除。`
}
