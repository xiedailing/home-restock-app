// 用品圖示狀態；購物清單成員資格與完成狀態可由 store 另外記錄。
export const ITEM_STATUS = Object.freeze({
  IN_SHOPPING_LIST: 'in-shopping-list',
  RESTOCK_NEEDED: 'restock-needed',
  IN_STOCK: 'in-stock',
  DUE_SOON: 'due-soon',
})

export const ITEM_STATUS_LABELS = Object.freeze({
  [ITEM_STATUS.IN_SHOPPING_LIST]: '在購物清單',
  [ITEM_STATUS.RESTOCK_NEEDED]: '需要補貨',
  [ITEM_STATUS.IN_STOCK]: '庫存充足',
  [ITEM_STATUS.DUE_SOON]: '接近補貨日',
})

export function normalizeItemStatus(status) {
  return Object.hasOwn(ITEM_STATUS_LABELS, status) ? status : ITEM_STATUS.IN_SHOPPING_LIST
}
