# Feature 008｜編輯用品圖示（修訂版 1）

> 草案日：2026-10-13。決策 ICO-01～ICO-09 見 `docs/DECISION_LOG.md`〈Feature 008〉。
> 圖示的狀態規則沿用 `src/assets/household-icons-by-state/README.md`；補貨狀態與 Badge 沿用 `specs/001-reminder-restock/spec.md`、`specs/003-item-detail/spec.md`。

## 目標
讓使用者在「新增用品」與「用品詳情」更換用品圖示，方式與頭貼編輯一致：【選擇預設圖示】【從相簿選擇】【拍照】。預設圖示只能選我們製作的 10 款；照片自行裁切後使用。**不包含：自訂預設圖示、為照片製作狀態表情、恢復依名稱自動比對、頭貼編輯的修改。**

## 來源
| 來源 | 內容 | 讀取範圍 |
|---|---|---|
| 使用者決策 | 2026-10-13：三選項、小相機角標、照片不顯示狀態、新增用無追蹤 1、詳情顯示目前狀態表情、不做恢復自動比對 | — |
| Figma「[Current] 編輯用品 ICON / Mobile」(2591:19960) | 新增用品 5 張、用品詳情 4 張、說明卡 2 張 | 截圖與圖層樹完整 |
| Figma「[Current] 編輯用品 ICON Components / Mobile」(2590:19881) | Icon Edit Badge / Camera、Bottom Sheet / 更換用品圖示、Bottom Sheet / 選擇預設圖示（新增用品・無追蹤 1／用品詳情・依目前狀態） | 截圖完整 |
| Figma 設定頁「個人檔案設定」(1273:15622、1268:2837) | 頭貼相機角標、拍照／從相簿選擇 popover | 截圖 |
| 本機 repo | `SettingsEditProfile.vue`（頭貼選圖與裁切）、`AddItemView.vue`、`ItemDetailView.vue`、`models/item.js`、`stores/items.js`、`utils/persist.js`、`household-icons-by-state/` | 完整 |

## 入口
| 位置 | 元件 | 備註 |
|---|---|---|
| 新增用品「基本資訊」卡頂端的圖示預覽（64px） | 圖示圓圈＋右下角相機角標 | 預覽現為純顯示 |
| 用品詳情摘要卡的圖示（48px） | 圖示圓圈＋右下角相機角標 | 右上角垃圾桶不變（ICO-01） |

- **整個圖示圓圈**是一個按鈕（`aria-label="更換用品圖示"`），角標只是視覺提示（`aria-hidden`）。
- 角標：22px 深綠圓（`$primary-green`，陰影同設定頁頭貼角標），圖示用 Font Awesome `fa-regular fa-camera`（網站已載入 FA 7.3.1 Free，確認可用）。
- 其他顯示用品圖示的畫面（首頁提醒卡、首頁購買清單摘要、我的用品列、購買清單）**不加角標、不可點**。

## 功能需求

### FR-801｜更換圖示 Bottom Sheet（三選項）
- 點圖示圓圈開 Bottom Sheet（沿用 `BottomSheet.vue`）：標題「更換用品圖示」、說明「可從我們準備的圖示中選擇，或使用自己的照片。」、三列選項、【取消】。
- 選項：**選擇預設圖示**（進 FR-802）、**從相簿選擇**（`fa-regular fa-image`）、**拍照**（`fa-regular fa-camera`）。
- 下滑、點背景、【取消】關閉，不改變圖示。

### FR-802｜選擇預設圖示
- 同一個 Sheet 內切到預設圖示畫面：左上角「‹」回三選項，標題「選擇預設圖示」，說明「點選圖示即可套用。」。
- 10 款（5×2，固定順序）：垃圾袋、衛生紙、洗衣精、洗碗精、海綿／衛生棉、化妝棉、酒精、燈泡、狗狗糧食。名稱以 `PRESET_ITEMS` 為準（Figma 標示「狗狗飼料」，實作時以程式為準，Figma 之後更正）。
- 所有圖示使用**統一底色**（淺灰綠圓底，同新增用品圖示預覽），不用各款自己的彩色底。
- **表情規則（ICO-03）**：選擇器顯示的圖，就是「選完之後這個用品會呈現的樣子」：
  - 新增用品：一律 `getItemIcon(key, 'in-stock')`（Figma「無追蹤 1」，兩顆小眼睛），與頁面頂端預覽一致。
  - 用品詳情：`getItemIcon(key, item.status)`，即該用品目前顯示的狀態表情（需補貨、接近補貨日、庫存充足、在購買清單中）；提醒未開啟時為庫存充足版。選完後表情不改變。
- 目前選取的款有 2px 綠色外框；目前是照片或通用圖（`iconKey` 為 `null`）時沒有任何一款被選取。
- 點選任一款：套用並關閉 Sheet（不需要確認鈕）。

### FR-803｜從相簿選擇／拍照
- 關閉 Sheet 後，以隱藏的 `<input type="file">` 開啟：相簿 `accept="image/jpeg,image/png,image/webp"`；拍照另加 `capture="environment"`（桌機沒有相機時退回選檔，同頭貼）。
- 限制與錯誤訊息**同頭貼**：超過 5 MB →「圖片大小不可超過 5 MB，請重新選擇。」；非 JPG／PNG／WebP →「請選擇 JPG、PNG 或 WebP 圖片。」；讀取失敗 →「無法讀取圖片，請重新選擇。」。錯誤以頁面既有的 Toast 顯示（新增用品、用品詳情都有）。
- 通過檢查後開 FR-804 裁切。

### FR-804｜調整圖示（裁切）
- Dialog 版型同頭貼的「調整頭貼」，標題改「調整圖示」：說明「拖曳照片調整位置，或使用方向鍵移動。」、240×240 裁切區＋圓形遮罩、「縮放」滑桿（1～3）、【取消】【確認】。
- 取消／點背景：關閉，圖示不變。確認：輸出 **256×256 JPEG（品質 0.85）** data URL，套用到用品（FR-805）。
- 新增獨立元件 `ImageCropDialog.vue`；**不修改 `SettingsEditProfile.vue`**（組員負責，避免衝突；日後可再改用同一元件，ICO-07）。

### FR-805｜套用規則與資料欄位
用品新增三個欄位（`createItem` 預設值）：

| 欄位 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `iconKey` | string \| null | 依名稱比對 | 預設圖示種類（沿用） |
| `iconPhoto` | string \| null | `null` | 照片 data URL；有值時優先於 `iconKey` |
| `iconManual` | boolean | `false` | 使用者手動指定過圖示 |

- 選預設圖示：`iconKey = 該款`、`iconPhoto = null`、`iconManual = true`。
- 套用照片：`iconPhoto = data URL`、`iconManual = true`；`iconKey` 保留（不清除）。
- **名稱與圖示的關係（ICO-05）**：新增用品中，`iconManual` 為 `false` 時，圖示隨名稱即時比對（現狀）；手動指定後，改名不再改圖示。用品詳情改名時只有 `iconManual === false` 才重新比對 `iconKey`（現為一律重新比對，需修正）。
- 沒有「恢復自動比對」（ICO-04）。
- 新增用品：選擇暫存在表單狀態，按【新增用品】時一併寫入；返回或離開不儲存（同其他欄位）。
- 用品詳情：選完即儲存（同基本資訊自動儲存，FR-303），Toast「已更新用品圖示」＋「復原」（ICO-08，沿用 DET-15）。

### FR-806｜顯示（統一取圖）
- 新增 `getItemIconSrc(item, status)`（放在 `household-icons-by-state/index.js`）：`item.iconPhoto` 有值回傳照片；否則 `getItemIcon(item.iconKey, status)`。**照片在所有狀態都是同一張，不隨狀態改變**，狀態只靠列表右側的 status Badge 表現（ICO-04）。
- 所有畫面改用它：`ItemListRow.vue`、`ItemDetailView.vue`、`AddItemView.vue`、`ReminderCard.vue`、`ShoppingSummaryCard.vue`、`ShoppingView.vue`（目前還有名稱對照表 `iconKeys`，改為只作為 `iconKey` 為空時的備援）。
- 照片填滿圖示圓圈（`object-fit: cover`、圓形裁切）；預設圖示維持 `contain`。
- 購買清單、首頁摘要等原本以固定狀態（`in-shopping-list`／`in-stock`）取圖的地方，遇到照片同樣顯示該張照片。

### FR-807｜照片儲存（依 `utils/persist.js`）
- 照片隨 `items` 存入 localStorage（持久化 PR #27）；256px JPEG 每張約 10～30 KB。
- 寫入失敗（儲存空間不足）時：本次工作階段照常顯示照片，並以 Toast 提示「儲存空間不足，重新整理後照片可能不會保留」（ICO-09）。需要 `savePersisted` 的結果讓 items store 暴露 `persistFailed`。
- 用品被刪除時照片隨之刪除；刪除後 5 秒內「復原」會連照片一起還原（`snapshotItem` 已完整複製）。

## 受影響檔案
| 檔案 | 變更 |
|---|---|
| `src/components/ItemIconSheet.vue`（新） | FR-801、FR-802 |
| `src/components/ImageCropDialog.vue`（新） | FR-804 |
| `src/components/ItemIconButton.vue`（新） | FR-801 的圓圈＋角標 |
| `src/views/AddItemView.vue` | 入口、暫存選擇、寫入三欄位 |
| `src/views/ItemDetailView.vue` | 入口、套用、Toast、改名只在 `iconManual === false` 時重新比對 |
| `src/models/item.js`、`src/stores/items.js` | `createItem` 欄位、`persistFailed` |
| `src/assets/household-icons-by-state/index.js` | `getItemIconSrc` |
| 其他顯示圖示的元件與頁面 | 改用 `getItemIconSrc`（FR-806） |

## 驗收
1. 新增用品與用品詳情的圖示圓圈有相機角標，點整個圓圈開 Sheet；詳情頁垃圾桶仍是刪除。
2. 預設圖示 10 款統一底色；新增用品顯示小眼睛；詳情顯示該用品目前狀態的表情，選完不變。
3. 相簿與拍照都能進裁切，確認後圖示變成照片；取消不改變。
4. 照片在我的用品、首頁、購買清單、詳情都出現，且各狀態不變；狀態只看 Badge。
5. 手動選過圖示後，改名不再改變圖示；沒選過的維持依名稱比對。
6. 重新整理後照片仍在；空間不足時出現提示。
7. 詳情頁套用後有 Toast，按「復原」回到原圖示（含原本是照片的情況）。
8. 超過 5 MB 或格式不符時顯示對應訊息。
