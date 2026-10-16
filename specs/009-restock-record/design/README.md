# 補貨頁設計預覽（v12）

> 日期：2026-10-16。對應 `specs/009-restock-record/spec.md` 的 FR-901～FR-911，決策見 `docs/DECISION_LOG.md` 的 UT-15～UT-24。

## 這是什麼
定案畫面的可操作 HTML 預覽（`restock-record-v12.html`），用來**對照畫面**，不是可以直接搬進專案的程式碼。用瀏覽器開啟即可（圖示在 `icons/`，路徑是相對的，整個資料夾一起移動才不會破圖）。7 個畫面都能點：切換空間、點用品加入或取消、調數量、換日期、按「記錄」。

| 畫面 | 內容 |
|---|---|
| ① | ＋選單（兩項） |
| ② | 補貨頁（選一個用品） |
| ③ | 連續點選多個用品 |
| ④ | 點空間膠囊的 popover |
| ⑤ | 點「⋯」的選單 |
| ⑥ | 空間名稱與類別名稱最長、已篩選 |
| ⑦ | 沒有任何用品的空間 |

`v12-overview.png` 是全部畫面的總覽，沒有瀏覽器時可以先看這張。
## 使用時要注意
- **行為以規格為準。** 預覽與規格不一致時，照 `spec.md`。
- **樣式要改用專案的 token。** 預覽 `:root` 的 CSS 變數對應 `src/assets/scss/_tokens.scss`（例如 `--primary` 對 `$primary-green`、`--card-bg` 對 `$card-bg`、`--shadow-raised` 對 `$shadow-raised`），不要複製預覽裡的色碼。
- **先找專案現有元件可沿用。** 例如日期選擇器 `DatePickerSheet`、新增空間 `AddSpaceSheet`、「我的用品」的空間 popover 與 pill 樣式。
- **預覽刻意簡化的地方：**
  - 日期選擇器是自己畫的簡易月曆，實作請沿用 `DatePickerSheet`（上限今天）。
  - 類別寫死六個，實作要用 `itemsStore.categoryOptions`（含使用者自訂分類，FR-903）。
  - 使用者新增的用品都用通用圖示；實作依用品資料顯示圖示或照片。
  - 「＋新用品」與「⋯ > 用品管理」只跳提示，實作分別導向新增用品頁與 `item-management`。
  - 用品資料是示範用的假資料。
- **版面不含 Safe area 與底部導覽**：預覽是 390×844 的外框，實作時補貨頁沒有底部導覽（`hideBottomNav`），底部安全區另外處理。
