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
- 單位變更需確認後才可正式儲存，建立各空間獨立週期；詳見下方「單位週期整合」。
- 成功 `{ok:true,item}`；失敗 `{ok:false,error:{code,message}}`，不能將失敗視為成功或自動合併。

## 本機存檔交易
- 沿用 STORAGE_VERSION=2，不清除既有存檔。
- 新鍵 `catalog-integration` 為短暫交易紀錄，納入 STORE_KEYS，因此開發用 reset 會一併清理。
- 先寫 prepared（包含兩邊 before／after），再寫 Catalog、items，最後寫 committed。
- 啟動時 prepared 回復 before，committed 完成 after；在讀取 items／Catalog 前先完成復原。
- 寫入失敗先回復，回傳 STORAGE_FAILED；無法復原時回傳 RECOVERY_REQUIRED，阻擋混合存檔載入，不能改用示範資料覆蓋。恢復儲存空間後重新整理再重試。
- 已提交但交易清理失敗可在下次載入完成清理。這是同一 App 執行個體的可復原本機交易，不是跨裝置同步；尚未提供多分頁同時寫入的交易鎖。

## 尚待整合
- 組員補貨頁已使用 ensureCatalogItem；後續入口仍須維持 ID 關聯，不以名稱找另一筆或替換 item.id。
- 單位快照及 `unitPeriodId`、編輯 Sheet 已在本分支串接；原工作區其餘 UI 仍獨立保留。
- 用品詳情頁原本可直接改名稱／圖示／分類／單位；全域欄位的入口政策仍須與組員統一，本次未修改該頁。
- 沒有權限的已退出空間資料不主動改寫；目前同步範圍為 items Store 內可存取的空間用品。

## 2026-10-18｜設定頁自訂分類刪除

- 自訂分類內容頁右上垃圾桶開啟具用品數量的刪除確認窗，取消不改資料。
- `catalog.removeCustomCategory(name)` 回傳 `{ok:true,removedIds,undo}` 或 `{ok:false,error}`；僅移除分類與該分類自訂全域用品。
- 使用既有 catalog/items 交易 journal；增加 Catalog 的 `deletedCategories`（舊存檔預設空陣列），以及 bridge 的 `applyCategories`。不升 STORAGE_VERSION。
- 舊空間用品、catalogId、購買狀態與 restockRecords 保留；刪除標記避免舊空間資料讓分類重現，也避免同名新用品重新關聯。明確重新新增同名分類可再次使用。
- 系統分類不顯示垃圾桶。自訂分類若包含被移入的系統預設用品，API 拒絕刪除並提示先移回系統分類；不自動移動或刪除預設用品。
- `items.js` 只調整分類選項過濾及 bridge 的分類狀態更新，不改補貨頁／紀錄／推算。舊 `removeCategories()` 不用於此功能。
- 用品管理首頁舊左滑刪除入口改為引導到分類頁確認，避免誤用舊空間刪除行為。

### 分類刪除復原（2026-10-18）
- 確認窗不再顯示「無法復原」。無用品／有用品分別顯示指定文案，下一行以相同字級與顏色顯示「已加入空間的用品與補貨紀錄不受影響。」
- 刪除後回用品管理，沿用 App 共用 Toast：「已刪除「分類」分類及 N 項用品」＋「復原」。維持目前設定頁規則 8 秒、觸碰／聚焦暫停，新 Toast 取代舊的；不沿用舊購買清單規格的 5 秒描述。
- undo 是單次、僅記憶體的回呼；Toast 消失後不再提供入口。復原以原 ID／設定與相鄰順序還原分類和全域用品，原子保存，不覆寫刪除後其他用品編輯。
- 同名分類／用品或 ID 衝突時阻擋並提示；保存失敗不回報成功。空間用品及補貨紀錄不因刪除／復原改變。

## 2026-10-18｜自訂單位選項

- `src/stores/unitOptions.js` 獨立保存共用自訂單位選項，提供 `customUnits`（唯讀）、`addUnit(value)`、`removeUnit(value)`；新增／刪除先保存成功再變更記憶體，錯誤回傳 `{ok:false,message}`。
- 使用 `STORE_KEYS.unitOptions`，沿用既有 persist 與重設入口，不更動 STORAGE_VERSION。
- 新增用品頁將單位分「預設／自訂」兩行；自訂標題旁「編輯」開啟各選項前的 ×，僅刪共用選項。
- 預設單位不提供刪除。新增時與預設／自訂選項重名皆拒絕並提示「此單位已經存在」；trim 後英文不分大小寫。分類新增也即時顯示重名提示並停用完成。
- 刪除「盒」只更新選項清單，既有 Catalog／空間用品 unit、補貨歷史及正在新增的已選單位不變。
- 本次不改補貨頁或既有編輯全域用品的單位變更限制；其他頁未來可讀同一 Store，不能另建清單。

### 自訂單位刪除編輯模式與復原
- 單位維持原膠囊尺寸；編輯模式的小 × 與名稱合為一顆按鈕，點任何位置均開啟確認窗，不要求精準點擊 ×。
- 編輯模式隱藏全部勾選，預設與新增選項灰字停用，自訂膠囊維持一般字色，僅提供刪除確認；完成後恢復，不清除原已選值。
- 刪除 Toast「已刪除「盒」單位」＋「復原」，沿用 useToast 的 8 秒與互動暫停；新 Toast 取代舊的，離開新增用品頁即結束。
- removeUnit 回傳 `{ok:true,undo}`；undo 還原原選項順序，不影響後續新增選項，同名選項已重建時不重複插入。任何存檔失敗都不回報成功。
- 選項刪除／復原不更新用品 unit 或補貨紀錄。

- 自訂單位只有確認窗按「刪除」後才移除；取消／Escape 不改資料。確認刪除後仍沿用 Toast＋復原。

- 新增用品頁刪除目前選取的自訂單位成功時，只清空本頁未儲存的選擇，右側回到「請選擇」；其他單位或刪除失敗不清空。Toast 復原只還原選項，不自動選回。已保存用品與補貨紀錄不變。

## 單位週期整合（本機開發，2026-10-18）

- 本次基於 `d13e8e8`，工作分支 `feature/unit-period-integration`；後續已逐區塊整合編輯用品 Sheet 與最小單位管理相依，未搬入其他分類刪除、Catalog 或購買清單修改。
- 空間用品新增 `unitPeriodId`；補貨紀錄新增 `unit`（當時單位快照）及 `unitPeriodId`。既有 `catalogId`、用品 ID、紀錄 ID 不變。
- `migrateUnitPeriods(item)`：缺少的初始週期固定使用 `legacy:<item.id>`，重複載入不重新產生；缺少的單位快照用目前用品單位補值，已有值不覆寫。這不是重建未知的歷史單位變更，不宣稱能還原過去未記錄的單位。
- `currentUnitRecords(item)`：僅回傳目前週期、單位一致、日期有效且數量為正的紀錄。`getNextRestockDate()` 在原公式前套用此篩選。原公式及提醒門檻不變。
- `catalog.updateCatalogItem(id, changes, { confirmUnitChange: true, expectedUnit })`：單位確實改變時必須明確確認；`expectedUnit` 可防止確認視窗開啟後資料被更改。未確認回傳 `UNIT_CHANGE_CONFIRMATION_REQUIRED`；過期單位回傳 `STALE_UNIT`。
- `resetPresetOverride(id, { confirmUnitChange: true })`：若還原會改變單位，同樣需要確認；其他還原維持原 API。
- `planCatalogSync()`：單位變更僅同步已建立 `catalogId` 的空間用品，不以名稱新增關聯；若空間單位與 Catalog 原值不符，回傳 `SPACE_UNIT_MISMATCH`，整筆更新不成立。
- 每個空間用品建立獨立的新週期，舊紀錄完整保留。Catalog 與各空間用品仍使用既有雙 Key 可回復交易；失敗不套用記憶體狀態，重新載入先回復交易。
- 單位變更後清除舊週期的暫緩提醒日期，保留提醒開關、認領、待買數量及既有通知流程。
- `completeRestock()` 為新紀錄寫入目前單位及週期；`updateRestockRecord()` 只改日期、數量，不改週期。補登早日期也依新增時的目前週期，不依日期猜測歸屬。
- 批次新增是否「開始推算」、補貨明細還缺幾筆的提示，都只計算目前週期不同日期數。
- `snapshotItem()`／`restoreItem()` 保留原介面。同步操作期間捕捉操作後狀態，Undo 對紀錄 ID 做差異還原，保留後續單位週期及補貨。無法辨識對應操作且週期已變更的舊快照不套用。一般相同狀態的立即失敗回復仍可完整還原。
- 批次 Undo 若新建用品已被後續使用／更改，僅撤銷該次紀錄，不能連同後來資料刪掉；重複 Undo 無作用。
- 歷史列表及編輯紀錄 Sheet 使用紀錄 `unit`，不使用用品目前單位覆蓋歷史。
- `STORAGE_VERSION` 維持 2，無清除／重置資料。多裝置／多分頁並行寫入鎖不在本次範圍。

### 編輯頁接入注意

本分支已逐區塊整合 `GlobalItemEditor.vue` 的最新 Sheet 視覺，保留單位週期資料層。確認流程遵循：

1. 修改單位後按儲存先開確認視窗；取消不寫入。
2. 文案「舊紀錄保留『包』，改用『箱』後重新推算補貨時間。」動態替換單位。
3. 關聯多個空間時加上影響空間數與各自建立週期的說明。
4. 只有確認後傳 `confirmUnitChange: true`；確認時檢查 Catalog 最新單位。
5. 儲存失敗保留表單及確認視窗，顯示錯誤，不回報成功。

- 重新加入已退出空間時補齊舊紀錄週期欄位；不在退出期間改寫其資料。既有空間可能本來就有與 Catalog 不同的單位，本次保留其補貨流程；若之後要全域換單位，同步檢查會回報 `SPACE_UNIT_MISMATCH`。跨離開／重新加入期間的單位差異，需要另行確認政策，不自動換算。


## Sheet 與共用自訂單位整合（2026-10-18）

- 引入獨立 `unitOptions` Store 與 `useUnitManagement()`，新增／編輯用品均使用同一份單位清單及刪除、復原規則。沒有複製 Items／Catalog Store。
- `STORE_KEYS.unitOptions = 'unit-options'`，`STORAGE_VERSION`、其他 Key、原通知與交易設定均不變。
- `finishCustomUnit()` 正式呼叫 `unitOptions.addUnit()`，成功後立即保存選項並選取。取消新增用品、取消編輯或取消單位確認都不刪除已建立的共用選項。
- 新增用品若直接提交尚未按「完成」的有效自訂單位，也先建立共用選項；重名（含預設單位）／超長仍阻擋。
- 選項刪除只更新 `unit-options`；編輯既有用品時保留該用品當前單位。新增用品未儲存草稿選中的選項被刪除，僅清空草稿回到「請選擇」。
- 編輯選取或建立新單位只更新 draft；按儲存、確認後才呼叫 Catalog API 建立新週期。還原預設改到不同單位也必須經此確認；基本資料變更不啟動新週期。
- Sheet 保留米色、標題置中、右側還原預設、固定圖示、內凹欄位、預設／自訂分組、選項展開動畫、完整展開卡片與陰影留白。單位確認也沿用 BottomSheet；取消不寫用品資料。
- Toast 原本倒數、暫停、長訊息換行與通知行為不變，只新增可選的第四參數 `variant = 'success'`（`'error'` 使用 `$toast-error-accent`）及 `AppToast.teleportDisabled`。編輯失敗 Toast 在目前 Sheet 中顯示，成功仍使用 App 提供的 Toast。
- 新增回歸測試 `tests/unit-sheet-integration.test.mjs`，涵蓋選項永久保存、兩入口同源、取消不改用品、刪除保留歷史與週期、確認後才換週期、重整與重名驗證。

### 本次整合驗證結果

- `node --test tests/*.test.mjs`：105 項通過，無失敗／跳過。
- `npm run build`：通過；`git diff --check`：通過。
- 以獨立、全新瀏覽器環境檢查 Chromium 手機尺寸：320／375／390／430px 寬度，以及 320×568、375×667 矮螢幕。收合／展開、確認取消、單位重整保留、正式儲存、刪除復原與儲存失敗 Toast 均驗證；無橫向溢出或頁面錯誤。
- 矮螢幕自訂單位輸入列在展開動畫完成後捲入可見區域，「完成」維持單行。這是瀏覽器手機尺寸測試，尚未以實體 iPhone／Safari 鍵盤驗證。
- QA 截圖與結果保存在 `/tmp/bubu-unit-sheet-browser/`；瀏覽器工具只安裝在 `/tmp`，沒有修改專案套件依賴。
- 最小範圍限制：新增用品僅接入共用單位管理；未搬入原分支其他名稱／分類 UI、自訂分類刪除等修改。分類頁「單位變更尚未開放」與歷史狀態未知時「僅供預覽」的過時提示，已在確認正式流程串接後修正。


### PR 前最後介面／入口檢查

- 設定、補貨頁與補貨明細的用品管理入口皆導向 `item-management` → `item-category`，只有 `SettingsItemCategory.vue` 掛載共用 `GlobalItemEditor`，沒有另一套編輯單位入口。
- 確認正式 Catalog 更新、跨空間交易及 Sheet 確認已接通後，移除分類頁「單位變更尚未開放」字樣；保留原本全域選項說明。`UnitChangeHint` 的未知歷史狀態改為確認後建立新週期的中性提示，不再聲稱僅供預覽。
- 新增回歸驗證：單位未變更可直接保存基本資料且週期不變；只有提交成功才顯示「已成功儲存編輯」；取消／失敗不發成功 Toast；失敗使用紅色錯誤款、保留草稿與確認狀態，重試成功才關閉。
- 本輪未更改分類刪除、通知、認領與購買清單功能；未提交、上傳、建立 PR 或合併。

## 2026-10-18｜整合回用品 UI 工作分支

- 將 `feature/unit-period-integration` 的未提交單位週期功能逐區塊整合回 `feature/shared-refinements`；原獨立工作目錄與全部 stash 保留。
- Catalog 交易同時保留分類刪除／復原與單位確認參數，避免單位 options 被當成待刪分類。
- 保留目前新增用品 UI、預設／自訂分類、內縮分隔線、用品左滑／多選刪除及復原。編輯 Sheet 不顯示單獨刪除用品按鈕。
- 修改單位須按儲存並確認；取消不建立週期。名稱、圖示、分類單獨儲存不建立週期。
- 保留目前 Toast 觸碰／聚焦暫停規則，Sheet 內單位刪除 Toast 只顯示一份。

## 共享補貨通知與 Undo：組員共同串接規則（2026-10-18）

以 [通知 V2](NOTIFICATION_SPEC_V2.md) 第 04 節為準。此為新決定，取代舊版「補貨成功即通知、復原不撤回」；**尚待程式實作，不代表現有組員分支已更新。**

- 所有共享補貨入口都使用同一套通知 Store／待發送批次，不在補貨頁、購買清單或詳情頁各自計時、直接建立通知。
- 補貨資料立即完成；批次全部成功後才將穩定事件 ID、空間用品 ID、補貨紀錄 ID、操作者／空間及品名快照交給共用通知層。
- 同操作者、空間、操作類型從第一筆起固定 60 秒，後續不延長。認領、接手、已補貨皆適用延後建立。
- 60 秒前成功 Undo，按該次事件／紀錄 ID 取消待發送事件。第 59 秒撤銷衛生紙補貨，其他成員不會收到該次衛生紙補貨通知。整批撤銷不產生通知，部分撤銷只通知剩餘用品。
- Undo 必須涵蓋單筆 snapshotItem／restoreItem、recordRestockBatch 回傳的 undo，以及購買清單現有完成／復原路徑；不能只改 Toast 按鈕。
- 第 60 秒前無正式通知，因此不是先發再撤回。已正式建立後才撤銷則仍不撤回歷史通知。
- 重整恢復原截止時間，通知正式建立與 pending 移除／去重狀態一併保存，避免重複發送。
- 通知故障不得中斷已成功補貨、重建紀錄、改動單位週期或覆蓋後續操作；保留錯誤資訊，到期前再次校驗對應紀錄。
- 不延長既有 8 秒 Toast／Undo 入口。59 秒案例指透過既有仍可使用的入口成功復原，不能讓已失效的 Undo UI 假裝仍可操作。

### 分工與待實作 API 契約

| 負責處 | 工作 |
| --- | --- |
| 通知整合方 | 在既有 sharedNotifications Store 實作持久化 pending、固定 deadline、事件去重、取消與發布前驗證；API 命名尚未定案 |
| 組員補貨整合 | 確認各入口仍呼叫共用 completeRestock／recordRestockBatch 與原 Undo，提供穩定紀錄 ID；移除任何頁面自行立即發布的路徑（若有） |
| 共用 Store 協作 | 在 completeRestock、recordRestockBatch 成功邊界入列，成功復原後取消對應事件；逐區塊修改，不重做補貨公式、資料模型或 Undo |

交接中的通知 API 尚未完成，不能要求組員現在呼叫不存在的函式。正式實作時需提供實際名稱、參數、回傳結果及故障行為，再共同串接。

### 組員共同驗收

1. 單筆／批次補貨即時更新，60 秒前收件人列表無該通知。
2. 第 59 秒成功復原，第 60 秒不出現已取消事件。
3. 部分復原只通知剩餘用品；整批復原沒有通知；批次失敗從未入列。
4. 第 25、50 秒追加事件，仍在第一筆後第 60 秒結束，無重複用品。
5. 重整後固定截止時間與取消結果保留，不重複產生通知。
6. 先補貨、再改單位、再復原原補貨，保留新週期；通知取消不覆蓋後續資料。
7. 通知入列／取消／保存故障不將已成功補貨回報失敗，不影響原公式。

## 補貨延後通知實作交接（2026-10-18）

`feature/final-integration` 已先完成「已補貨」延後 60 秒與 Undo 取消，實際 API、組員頁面接法與限制見 [RESTOCK_NOTIFICATION_DELAY_HANDOFF.md](RESTOCK_NOTIFICATION_DELAY_HANDOFF.md)。原補貨／Undo 呼叫保持相容；認領／接手及通知 UI 尚未整合。本節更新取代前面「通知 API 尚未完成」中針對補貨事件的描述，其餘 V2 功能仍待開發。

## 通知 V2 完整本機整合（2026-10-18）

補貨專用交接已由 [通知 V2 交接](NOTIFICATION_V2_HANDOFF.md) 擴充：認領／接手／補貨皆共用固定 60 秒與故障邊界，原用品管理、單位週期及補貨／Undo API 保留。請依該文件審查共用 items.js 局部掛鉤；未修改組員其他分支，未上傳。
