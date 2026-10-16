# 交接｜全域用品資料與新增用品頁（給負責新增用品的組員與她的 AI）

> 日期：2026-10-16（修訂：資料層 `stores/catalog.js` 改由組員負責）。對應 `specs/009-restock-record/spec.md` 的 FR-909，決策見 `docs/DECISION_LOG.md` 的 UT-15、UT-16、UT-28。
> 請先讀完本文件，再讀 spec 009 的 FR-904、FR-909，最後讀現有的 `src/views/AddItemView.vue` 當起點。

## 背景
可用性測試後，「＋」選單的「新增補貨紀錄」進入新的補貨頁（由另一位同學負責）。補貨頁的用品清單裡沒有想要的東西時，使用者點格子裡的「＋新用品」，進入**你負責的新增用品頁**，建立一個用品，回到補貨頁。

關鍵觀念：**這裡新增的是「全域用品」，不屬於任何空間，所有空間都能選。** 所以新增用品頁沒有空間欄位，也沒有提醒、庫存量、預計補貨日、數量、日期，這些全部拿掉。

## 分工
全域用品有三個使用者，寫入（新增、編輯、刪除）的那一側都是你的功能，所以**資料層由你負責**：

| 項目 | 負責 |
|---|---|
| `src/stores/catalog.js`（全域用品資料、新增、檢查重複、讀取、存檔；之後的編輯與刪除，UT-18） | **你** |
| 新增用品頁、設定 > 用品管理 | **你** |
| `utils/persist.js`：`STORE_KEYS` 加 `catalog` | **你**（只加這一行） |
| `models/itemCategories.js`：`PRESET_ITEMS` 補上單位 | **你** |
| 補貨頁、`stores/items.js`（記錄與推算）、示範資料、`SpacePill`、`persist.js` 的 `STORAGE_VERSION` | 補貨頁那位同學 |

**請把 `stores/catalog.js` 的最小版本當成第一件事，做完就先開小 PR 合併。** 補貨頁要等它才能接上；在那之前補貨頁會用一個本機、不 commit 的假版本開發，介面和下面一樣，所以只要你的介面跟本文件一致，之後直接換上就能運作。離 10/21 只剩幾天，這一步越早合併越好。

## 一、`stores/catalog.js`（最小版本）

### 資料
使用者新增的全域用品，欄位：

| 欄位 | 說明 |
|---|---|
| `id` | 用 `utils/id.js` 的 `generateId()` 產生，建立後永遠不變 |
| `name` | 已 trim |
| `iconKey`、`iconPhoto`、`iconManual` | 沿用 008 的圖示規則 |
| `category` | 類別名稱 |
| `unit` | 單位（自訂單位就是使用者輸入的字） |
| `createdAt` | 建立時間 |

預設用品不存進 store，取自 `PRESET_ITEMS` 的 10 款，固定順序。**`PRESET_ITEMS` 要補上 `unit`**，類別沿用它原本的值：

| 名稱 | 類別 | 單位 |
|---|---|---|
| 垃圾袋 | 生活日用品 | 包 |
| 衛生紙 | 生活日用品 | 包 |
| 燈泡 | 生活日用品 | 個 |
| 洗衣精 | 洗衣 | 瓶 |
| 洗碗精 | 廚房 | 瓶 |
| 化妝棉 | 個人護理 | 包 |
| 衛生棉 | 個人護理 | 包 |
| 酒精 | 清潔 | 瓶 |
| 海綿 | 清潔 | 個 |
| 狗狗糧食 | 寵物用品 | 包 |

**預設用品也要有穩定的 `id`**，因為補貨頁的已選用品一律用 `id` 記。預設用品的 `id` 用 `preset:` 加上它的 `iconKey`，例如 `preset:tissues`，不要用隨機值（每次載入要一樣）。

### 對外介面
```js
const catalog = useCatalogStore()

// --- 新增用品頁用 ---
catalog.isNameTaken(name)   // → boolean。使用者新增的與預設用品都要比；忽略前後空白、英文大小寫不分（UT-16）
catalog.addCatalogItem({ name, iconKey, iconPhoto, iconManual, category, unit })
                            // → 新建立的用品（含 id、createdAt）。放到清單最前面、存檔、並記下 justAddedId

// --- 補貨頁用（讀取）---
catalog.catalogItems        // 使用者新增的，新的在前
catalog.allItems            // catalogItems 接著 10 款預設用品；順序固定。補貨頁的格子直接讀它
catalog.getById(id)         // → 用品或 null（含預設用品）；找不到代表已被刪除，補貨頁會把它從已選清單剔除
catalog.justAddedId         // 剛新增的用品 id，沒有就是 null
catalog.clearJustAddedId()  // 補貨頁讀到之後呼叫，把它清成 null
```

- `addCatalogItem` 不需要自己再檢查重複，但請在內部保險：名稱重複就丟錯或回傳 `null`，避免畫面漏擋時產生兩筆同名。
- 順序規則很重要：**依新增時間固定，新的在前，不隨任何篩選改變**（UT-17）。
- 目前不做編輯與刪除；UT-18 討論後再加（那時 `getById` 回傳 `null` 的情況才會真的出現）。

### 存檔
沿用 `utils/persist.js` 的做法（跟 `stores/items.js` 一樣）：
- 在 `STORE_KEYS` 加 `catalog: 'catalog'`，這樣網址帶 `?reset=1` 時才會一起清除。
- 啟動時 `loadPersisted(STORE_KEYS.catalog)`；變動後用 `createDebouncedSaver` 延遲存檔，存 `{ catalogItems }`。
- **不要改 `STORAGE_VERSION`**，補貨頁那位同學會統一升版（升版會重設所有存檔）。

## 二、新增用品頁
保留路由名稱 `add-item`，路徑 `/items/new`。欄位如下：

| 欄位 | 必填 | 說明 |
|---|---|---|
| 圖示 | 否 | 沿用 `ItemIconEditor`（預設圖示／相簿／拍照）。沒選時，依名稱用 `matchItemIconKey` 比對，比對不到用通用圖 |
| 名稱 | 是 | 長度規則沿用 `limitSpaceName`（中文算 2、英數算 1，上限 16） |
| 類別 | 是 | 選項用 `itemsStore.categoryOptions`（**含使用者自訂分類，不能寫死六個**） |
| 單位 | 是 | 選項用 `UNITS`，另有「自訂」可輸入 |

- 必填欄位的標籤旁加小紅色 `*`。
- **名稱重複（UT-16）**：與現有全域用品（含預設用品）重複時，才顯示純文字提示「此用品已經存在」；沒有重複不顯示任何提示。重複時儲存按鈕變灰不能按。請呼叫 `catalog.isNameTaken(name)`，不要自己寫比對。
- **類別、單位的呈現（建議，不是規定）**：收合成「標籤＋目前值＋箭頭」的列，點開展開選項，一次只展開一個，選好自動收合。專案現有的 `AddItemView.vue` 已有同一種展開面板做法可以沿用。
- **缺必填欄位時的處理（建議）**：儲存按鈕保持可按；缺欄位時按下去，把缺的那一列標籤改成紅色並自動展開第一個缺的欄位，**不顯示錯誤句子**（可用性測試反應畫面字太多）。補上後即時恢復。
- 離開頁面時若已填了內容，沿用現有 `onBeforeRouteLeave` 放棄確認的做法。
- 儲存：呼叫 `catalog.addCatalogItem(...)`，成功後 `router.back()`。補貨頁會自己讀 `justAddedId` 選好新用品並顯示 Toast，你不用傳任何東西回去。
- 從補貨頁進來的方式是 `router.push({ name: 'add-item' })`（補貨頁會做）。

## 為什麼用 id（給想知道原因的人）
名稱是使用者看到的，而且之後**可以被改**（例如在「用品管理」把「衛生紙」改成「面紙」）。id 是系統給每個用品的固定編號，建立後永遠不變，就像學號和姓名：改名字，學號還是同一個人。

這裡會用到 id 的地方：補貨頁會記住使用者勾了哪些用品，而且從「用品管理」回來時還要還原。如果用名稱記，使用者中途改了名字，記住的東西就對不上、會憑空消失；用 id 記，就算名字改了，還是同一個用品，只是顯示新的名字。

注意：id 不能取代「名稱不可重複」的檢查，那是 `isNameTaken` 的工作，兩件事是分開的。

## 不要改的檔案
`stores/items.js`、補貨頁（`RestockRecordView.vue`）、`SpacePill.vue`、`persist.js` 的 `STORAGE_VERSION`。

## 可以沿用的現有元件與規則
- `ItemIconEditor.vue`（圖示選擇）、`ImageCropDialog.vue`（裁切）
- `models/item.js`：`UNITS`、`matchItemIconKey`
- `models/space.js`：`limitSpaceName`
- `utils/id.js`：`generateId`
- 藥丸樣式 `pill`、`pill-check.svg`，以及 `AddItemView.vue` 的展開面板與放棄確認
- `utils/persist.js`：`loadPersisted`、`createDebouncedSaver`

## 驗收
**catalog store：**
1. `addCatalogItem` 回傳的用品有 `id`、`createdAt`；`catalogItems` 新的在前；重新整理後仍在。
2. `isNameTaken` 對使用者新增的與預設用品都有效，忽略前後空白與英文大小寫。
3. `allItems` 是使用者新增的接著 10 款預設用品，順序固定；預設用品的 `id` 為 `preset:` 加 `iconKey`，每次載入相同。
4. `getById` 找得到使用者新增的與預設用品；找不到回傳 `null`。
5. `justAddedId` 在新增後有值，呼叫 `clearJustAddedId()` 後為 `null`。
6. 網址帶 `?reset=1` 會一併清除 catalog 存檔。

**新增用品頁：**
7. 從補貨頁的「＋新用品」進入；頁面上沒有空間、提醒、數量、日期欄位。
8. 名稱、類別、單位標紅色 `*`；類別選項包含使用者自訂分類。
9. 名稱重複時才出現「此用品已經存在」，且儲存按鈕不能按；沒有重複就沒有任何提示。
10. 缺必填欄位時按儲存，缺的欄位變紅並展開，沒有錯誤句子；補上後恢復。
11. 填好按儲存，成功後回到補貨頁。
12. 有填內容時按返回鍵，會跳放棄確認。
13. 鍵盤可操作，展開的列有 `aria-expanded`。

## 還沒決定的事
- 全域用品的編輯與刪除，以及「設定 > 用品管理」要怎麼配合（UT-18）：改名要不要連動各空間同名用品、刪除行為、預設用品能否刪除或隱藏、刪除自訂分類時的處理。待與你討論後另外交接；那時 `catalog.js` 會增加編輯與刪除的功能。
