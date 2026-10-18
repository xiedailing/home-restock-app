# 我的用品｜長按多選 設計稿

> 日期：2026-10-18。對應 `specs/013-inventory-multiselect/spec.md`，決策見 `docs/DECISION_LOG.md` 的 UT-43。

## 這是什麼
設計稿在 Figma，不是 repo 內的 HTML 預覽。檔案 `mockup---prototype`（file key `7Am2bN1HLIYG2vwiJkbMKu`），首頁頁面最底部。只畫手機版。

| 區塊 | 節點 | 內容 |
|---|---|---|
| `[Current] 我的用品 v4 多選 / Mobile` | `2777:21780` | 4 張 390×844 畫面與說明卡 |
| 　長按後（已選 1 項） | `2777:21781` | 洗衣精已選，【取消】【加入購買清單】 |
| 　已選 3 項 | `2777:22071` | 含已在清單的洗碗精（加入時略過） |
| 　未選取（加入鈕停用） | `2777:22365` | 已選 0 項，加入鈕灰色 |
| 　加入後 Toast（可復原） | `2777:22653` | 標記更新、深色 Toast「已加入 2 項到購買清單」＋「復原」 |
| 　說明卡 | `2777:22813` | 規則摘要 |
| `[Current] 我的用品 v4 多選 Components / Mobile` | `2776:21718` | Select Checkbox v4、Product List Row v4 / 選取模式、Header v4 / 選取模式、Bottom Action Bar v4 / 選取模式 |

Toast 沿用既有 `Feedback / Toast`（`708:4456`）Type=With Action；其餘「我的用品 v4」元件見 `[Current] 我的用品 v4 Components / Mobile`（`2769:21445`）。

## 設計時的取捨
- 選取圓圈放在卡片**最前方**（使用者要求），而不是取代右側箭頭：名稱區變窄約 38px，但勾選位置固定、單手好按。
- 選取底色用很淡的綠（`#eff6ee`），避免與「購買清單中」pill 的綠色（`#e4f2e8`）融在一起；選取主要靠綠色勾勾表達。
- Toast 用深色，與既有 App 的 Toast 一致（淺色版是設計過程的誤用）。
