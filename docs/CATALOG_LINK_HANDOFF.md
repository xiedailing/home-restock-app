# Catalog ID 關聯交接（第四階段 B，本機實作）

## 三種 ID
- `catalog.id`：全域選項，預設用品為 `preset:<原 iconKey>`。
- `item.catalogId: string | null`：關聯 ID；刪除 Catalog 後仍保留舊 ID，不按同名新用品重配。
- `item.id`：空間用品原有 ID，補貨紀錄仍保存在該用品原有的 `restockRecords`。
- `item.catalogIconInherited`：是否繼承全域圖示。空間手動選圖／照片後轉為 false，後續全域改圖不覆蓋它。

## 組員的補貨頁接法

```js
const result = itemsStore.ensureCatalogItem(spaceId, catalogItem.id)
if (!result.ok) {
  // 顯示 result.error.message；本筆不可繼續補貨。
  return
}
const { item, created } = result
// 到這裡才執行組員原有 completeRestock 與復原邏輯；傳入空間 item.id，不能傳 Catalog ID。
// created=true 的用品須納入原本批次復原的「移除本次新建空間用品」清單。
```

`ensureCatalogItem(spaceId, catalogId)` 回傳 `{ok:true,item,created}` 或 `{ok:false,error:{code,message}}`，本身不補貨、不加購買清單、不新增補貨紀錄。

`getItemByCatalogId(spaceId, catalogId)` 回傳空間用品或 null；發現舊資料有多筆相同關聯時丟出 `AMBIGUOUS_CATALOG_LINK`，不任選第一筆、不合併歷史。

本次未修改 `RestockRecordView.vue`。組員須將名稱＋空間查找改為以上入口；補貨日期、數量、紀錄、Toast 及復原仍由原流程負責。

## 遷移
初始化 items Store 會保守關聯舊資料；`migrateCatalogAssociations()` 可再次執行並保存。
- 名稱 trim／忽略英文大小寫；分類與單位必須一致。
- 必須只有一個候選，且同空間同名資料唯一、關聯未被占用。
- 刪除標記中的名稱不自動配對；已有非空 catalogId 的用品不重新按名稱尋找。
- 無法確認者保留 null；舊資料多筆不自動刪除或合併。
- 原空間用品 ID、補貨紀錄 ID／內容、購買及提醒狀態不變。
- 新增／搬移／還原會阻擋新產生的同空間重複關聯；舊有歧義資料仍保留，無關的欄位操作不被阻擋。

## 正式編輯與刪除
仍使用 `catalog.updateCatalogItem(id, changes)`、`removeCatalogItem(id)`、`resetPresetOverride(id)`。
- Catalog 中繼資料寫入透過獨立同步模組驗證關聯，再保存兩個鍵值。
- 名稱／分類同步至關聯空間；圖示只覆蓋繼承圖示。撞名回傳 `SPACE_NAME_TAKEN`。
- 自訂全域用品可刪；空間用品及紀錄保留。預設用品不可刪。
- 已關聯用品單位變更回傳 `UNIT_CHANGE_NOT_SUPPORTED`；編輯 UI 對所有單位草稿變更先停用儲存，等待單位週期完成。
- 成功 `{ok:true,item}`；失敗 `{ok:false,error:{code,message}}`，不能將失敗視為成功或自動合併。

## 本機存檔交易
- 沿用 STORAGE_VERSION=2，不清除既有存檔。
- 新鍵 `catalog-integration` 為短暫交易紀錄，納入 STORE_KEYS，因此開發用 reset 會一併清理。
- 先寫 prepared（包含兩邊 before／after），再寫 Catalog、items，最後寫 committed。
- 啟動時 prepared 回復 before，committed 完成 after；在讀取 items／Catalog 前先完成復原。
- 寫入失敗先回復，回傳 STORAGE_FAILED；無法復原時回傳 RECOVERY_REQUIRED，阻擋混合存檔載入，不能改用示範資料覆蓋。恢復儲存空間後重新整理再重試。
- 已提交但交易清理失敗可在下次載入完成清理。這是同一 App 執行個體的可復原本機交易，不是跨裝置同步；尚未提供多分頁同時寫入的交易鎖。

## 尚待整合
- 組員補貨頁使用 ensureCatalogItem；不要再用名稱找另一筆或直接替換 item.id。
- 單位快照、unitPeriodId、紀錄新增／編輯／刪除及補貨週期推算尚未改動。
- 用品詳情頁原本可直接改名稱／圖示／分類／單位；全域欄位的入口政策仍須與組員統一，本次未修改該頁。
- 沒有權限的已退出空間資料不主動改寫；目前同步範圍為 items Store 內可存取的空間用品。
