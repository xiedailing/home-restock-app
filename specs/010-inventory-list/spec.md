# Feature 010｜我的用品：購買清單標記（列表與詳情）（草案）

> 草案日：2026-10-17。決策 UT-35 見 `docs/DECISION_LOG.md`〈決策紀錄｜可用性測試修改（2026-10-15）〉。
> 狀態判斷沿用 `specs/001-reminder-restock/spec.md` 與 `models/item.js` 的 `getReminderStatus`；詳情頁提醒區沿用 `specs/003-item-detail/spec.md` FR-302；用品圖示取用沿用 `specs/008-item-icon/spec.md`。
> 「我的用品」其他規則（空間膠囊 UT-30、狀態篩選移除與類別 pills UT-32）不在本規格範圍，維持原狀。

## 目標
使用者在「我的用品」列表與用品詳情的右側／右上角，**一眼就能同時看出一個用品的提醒狀態（該補貨了）與是否已在購買清單**，不必點進詳情或對照下方的卡片。列表與詳情用同一套規則、同一個元件。

## 來源
| 來源 | 內容 | 讀取範圍 |
|---|---|---|
| 使用者決策 | 2026-10-17：UT-35。「該補貨了」與「購買清單中」會重疊；列表要一目了然；個人與共享空間統一；圖示與導覽列「購買清單」一致；單獨出現的圖示要有文字；詳情頁套用同一規則 | — |
| HTML 設計預覽 | `design/inventory-list-v4.html`（列表：方案 A、B、C、A+，**定案為 A+**）、`design/item-detail-badge-v1.html`（詳情頁）。用品資料是示範用假資料 | 完整 |
| 本機 repo | `components/items/ItemListRow.vue`、`views/InventoryView.vue`（`displayItems`、`STATUS_PRIORITY`）、`views/ItemDetailView.vue`、`components/item-detail/StatusCard.vue`、`components/BottomNav.vue`、`models/item.js`、`assets/household-icons-by-state/index.js` | 完整 |

## 名詞
- **提醒狀態**：`getReminderStatus` 的結果（只看提醒開關與預計補貨日，不看購買清單）：`overdue`、`dueSoon`（兩者文案同為「該補貨了」）、`notNeeded`、`reminderOff`。
- **已在清單**：`item.inShoppingList === true`。
- **狀態 pill**：右側／右上角的橢圓標籤。
- **清單標記**：pill 前面的圓形小圖示，表示「已在購買清單」。

## 現況與問題
- 「我的用品」列表（UT-31）：個人空間只顯示提醒狀態，使用者看到「該補貨了」，看不出已在清單；共享空間只顯示「購買清單中」，反而看不到「該補貨了」。
- 用品詳情右上角 Badge 是「購買清單優先」（`getStatus`，003 RST-07）：已在清單時顯示「購買清單中」，但下方提醒卡寫「補貨時間已過」，兩處說的不一樣；列表與詳情對同一個用品顯示不同的狀態。

## 功能需求

### FR-1001｜顯示規則（列表與詳情共用）
輸入：提醒狀態、是否已在清單。

| 提醒狀態 | 已在清單 | 狀態 pill | 清單標記（圓圈） |
|---|---|---|---|
| `overdue`／`dueSoon` | 是 | 該補貨了（橘） | **有** |
| `overdue`／`dueSoon` | 否 | 該補貨了（橘） | 無 |
| `notNeeded`／`reminderOff` | 是 | 購買清單中（綠，pill 內帶清單圖示） | 無 |
| `notNeeded`／`reminderOff` | 否 | 無 | 無 |

- pill 只顯示**最重要的一個狀態**，優先順序：該補貨了 > 購買清單中。
- 圓圈只在「該補貨了＋已在清單」同時成立時出現（pill 位置已被「該補貨了」佔走）；其餘情況「已在清單」由綠色「購買清單中」pill 表達。這樣使用者先在綠色 pill 看到「圖示＋文字」，之後圓圈單獨出現也認得。
- 個人空間與共享空間**同一套規則**。共享空間的列表不再單獨以「購買清單中」取代「該補貨了」。
- 沒有未知組合：`reminderOff`＋已在清單也走第三列（pill「購買清單中」）。
- 不新增「補貨時間已過」的獨立標籤：`overdue` 與 `dueSoon` 的 pill 同樣是「該補貨了」（沿用可用性測試 2026-10-15）。

### FR-1002｜視覺規格
- **圖示**：Font Awesome `fa-solid fa-clipboard-list`，與底部導覽「購買清單」（`BottomNav.vue`）同一個。網站已載入 FA 7.3.1，不新增圖檔。
- **清單標記（圓圈）**：24px 圓形（與 pill 等高），底色 `$primary-subtle`（`#e4f2e8`），圖示 12px、顏色 `$primary-green`。
- **「購買清單中」pill**：底色 `$primary-subtle`、字色 `$primary-green`，內含 11px 同一個圖示加 4px 間距，其餘（內距 3px 9px、12px 字、圓角）同「該補貨了」pill。
- **「該補貨了」pill**：不變（底色 `#ffebd7`、字色 `$accent-text`）。
- 圓圈與 pill 垂直置中，圓圈在 pill 左邊，間距約 6px。圓圈與 pill 都不可點。
- 無障礙：圓圈 `role="img"`、`aria-label="已在購買清單"`；「購買清單中」pill 的圖示 `aria-hidden`（文字已足夠）。顏色不是唯一的傳達方式（有圖示或文字）。

### FR-1003｜列表（`ItemListRow.vue`）
- 位置：每列右側、箭頭左邊，順序為「圓圈、pill、箭頭」。
- 用品名稱維持最多 2 行再省略、類別單行省略（不改）。
- 寬度：「圓圈＋該補貨了」約 98px，「購買清單中」pill 約 96px，兩者幾乎一樣寬；390px 寬時名稱區最窄約 132px（每行約 8 個字），360px 時約 102px（約 6 個字）。這是接受的取捨，不做單行名稱。
- 每列高度維持最小 96px。

### FR-1004｜詳情摘要卡（`ItemDetailView.vue`）
- 位置：摘要卡右上角（原 Badge 位置），圓圈在 pill 左邊，與用品名稱第一行垂直對齊。
- 名稱在詳情頁不省略（沿用）、會換行；右上角標記固定不縮小。390px 寬時名稱區約 150px。
- **提醒區（`StatusCard`）與按鈕不變**：仍依提醒狀態顯示，已在清單時主要按鈕為「查看清單」、說明文字沿用 RST-08；不因本規則增加或刪除任何文案。
- 摘要卡的顏色 class（`summary-card--*`）改依提醒狀態，不再因為已在清單變成綠色。

### FR-1005｜用品圖示依提醒狀態
- 列表與詳情的用品圖示（含詳情「更換用品圖示」Sheet 的預設圖示預覽）一律依**提醒狀態**取圖：`overdue`→需補貨、`dueSoon`→接近補貨日、`notNeeded`／`reminderOff`→庫存充足。
- **不再因為已在清單就換成 `in-shopping-list` 版圖示**；「已在清單」由 FR-1001 的標記表達。
- 其他頁面（購買清單、首頁摘要）取圖規則不變。

### FR-1006｜排序（`InventoryView.vue`）
- 預設排序仍依緊急程度，排序用「pill 狀態」（FR-1001 的優先順序）：該補貨了（`overdue` 在 `dueSoon` 前）、購買清單中、不需補貨、未開啟提醒；同狀態維持原順序（穩定排序）。
- 影響：個人空間「沒到補貨期但已在清單」的用品，排在「不需補貨」之前（原本個人空間不看購買清單）。

### FR-1007｜共用元件與函式
- `models/item.js` 新增 `getStatusMarks(reminderStatus, inShoppingList)`，回傳 `{ pill: 'overdue' | 'dueSoon' | 'inShoppingList' | null, showListMark: boolean }`（FR-1001 的表）；純函式，不碰 store。
- 新增 `components/items/StatusMarks.vue`：吃 `getStatusMarks` 的結果，畫圓圈與 pill；`ItemListRow.vue` 與 `ItemDetailView.vue` 共用，兩處不再各自判斷。
- `hasStatusBadge` 與 `STATUS_LABELS` 的使用處隨之調整；`STATUS_LABELS` 保留（購買清單、首頁仍用）。
- `InventoryView.vue` 的 `displayItems`（UT-31 的個人空間覆寫狀態）移除：每個用品同時帶 `reminderStatus` 與 `inShoppingList`，列表不再覆寫 `status`。

## 取代的既有規則
| 原規則 | 位置 | 本規格 |
|---|---|---|
| 非共享空間列表不顯示「購買清單中」，狀態、圖示與排序都用提醒狀態；共享空間顯示「購買清單中」 | DECISION_LOG UT-31 | 兩種空間統一為 FR-1001；圖示一律依提醒狀態 |
| 用品摘要卡 Badge 是主要顯示狀態，購買清單優先（`getStatus`） | 003 FR-302、DECISION_LOG RST-07 | 摘要卡改用 FR-1001；提醒區仍依提醒狀態（RST-07 的提醒區部分不變） |
| 詳情「更換用品圖示」預設圖示預覽依 `item.status` | 008 FR-802 | 依提醒狀態（FR-1005） |
| 「我的用品」排序以顯示狀態為準，個人空間不看購買清單 | `InventoryView.vue` `STATUS_PRIORITY` | FR-1006 |

## 不變
- 狀態判斷（`getReminderStatus`、`getStatus`）本身不改；`getStatus` 仍給購買清單等其他地方用。
- 提醒區的標題、說明、預計補貨日、開關、按鈕。
- 「我的用品」的搜尋、類別 pills、空間膠囊、刪除手勢。
- 購買清單頁、補貨頁、設定頁。

## 受影響檔案
| 檔案 | 變更 |
|---|---|
| `src/models/item.js` | 新增 `getStatusMarks`；圖示狀態改由提醒狀態取得的輔助 |
| `src/components/items/StatusMarks.vue`（新） | FR-1002：圓圈＋pill |
| `src/components/items/ItemListRow.vue` | 用 `StatusMarks`；圖示依提醒狀態 |
| `src/views/InventoryView.vue` | 移除 `displayItems` 覆寫；每個用品帶 `reminderStatus`、`inShoppingList`；排序用 pill 狀態 |
| `src/views/ItemDetailView.vue` | 摘要卡用 `StatusMarks`；圖示與 `ItemIconEditor` 的 `previewState` 依提醒狀態；`summary-card--*` 依提醒狀態 |
| `tests/status-marks.test.mjs`（新） | `getStatusMarks` 的 8 種組合 |
| `docs/DECISION_LOG.md` | UT-35；UT-31 狀態欄 |

## 驗收
1. 垃圾袋（個人，該補貨了＋已在清單）：列表右側是「圓圈＋該補貨了」；詳情右上角相同；提醒卡仍是「補貨時間已過」，按鈕「查看清單」。
2. 衛生紙（沒到補貨期＋已在清單）：列表與詳情都是綠色「購買清單中」pill（帶清單圖示），沒有圓圈；提醒卡「尚未到補貨時間」。
3. 洗衣精（只有該補貨了）：只有橘色 pill，沒有圓圈；按鈕「加入清單」。
4. 沒到補貨期且不在清單：沒有 pill、沒有圓圈。
5. `reminderOff`＋已在清單：綠色「購買清單中」pill；`reminderOff` 且不在清單：沒有標記。
6. 共享空間（家庭）與個人空間規則相同：家庭的衛生紙（該補貨了＋已在清單）是圓圈加「該補貨了」，酒精（沒到補貨期＋已在清單）是綠色 pill。
7. 用品圖示依提醒狀態：已在清單的垃圾袋（逾期）顯示「需補貨」表情，不是「購買清單」版；「更換用品圖示」預設圖示預覽同樣依提醒狀態。
8. 排序：該補貨了 → 購買清單中 → 不需補貨 → 未開啟提醒；同狀態維持原順序。
9. 名稱很長（20 字）：列表名稱 2 行內省略，圓圈與 pill 不被擠掉；詳情名稱換行，標記固定在右上角。360px 寬仍可用。
10. 圓圈有 `aria-label="已在購買清單"`；加入或移出購買清單後，列表與詳情的標記立即更新，不需重新整理。
11. 回歸：購買清單頁、補貨頁、提醒卡、用品圖示更換、刪除與復原行為不變；主控台無錯誤。

## 未決與不做
- 不做：圓圈與 pill 可點、名稱單行（方案 B、C 已比較，見預覽）、名稱過長時標記自動換行。
- 設計稿：只有 HTML 預覽，沒有 Figma 稿；`design/inventory-list-v4.html` 保留方案 A、B、C 作為比較紀錄。
