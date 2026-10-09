# 補補 Bubu｜Spec Kit 導入草案

> 這是一套待審閱的 **SDD 內容草案**，不是 Spec Kit CLI 初始化後的完整模板。請先在獨立分支使用官方 `specify init`，再把內容轉入 `.specify/memory/constitution.md` 與相應的 `specs/`；不要用這些草案覆寫官方產生的 `.specify` 基礎設施。

## 目前狀態（2026-10-09）
- 分支 `chore/spec-kit-adoption` 已建立，目前就在這個分支上。
- Spec Kit 尚未初始化：repo 沒有 `.specify/`，本機也沒有安裝 `specify` CLI。
- 草案檔案都還沒有 commit。
- 規格已依來源核對並逐項決策（D1～D9）修訂；**D8（資料儲存、共享同步、提醒形式）等待組員確認**。

## 來源與核對範圍
| 來源 | 讀取範圍 |
|---|---|
| 使用者決策 | 2026-10-09 逐項確認 D1～D9（D8 除外），紀錄見 `docs/DECISION_LOG.md` |
| 本機 repo | `src/` 全部檔案，以及所有本機與遠端分支（都沒有新增用品表單或「不確定」選項） |
| Drive〈居家消耗品補充 App｜產品內容與開發資料〉 | 全部 7 個工作表完整讀取（xlsx 匯出，避免儲存格被截斷） |
| Drive〈Mockup製作清單〉〈第二組_補補 Bubu〉〈前期研究〉〈生活用品補貨行為研究｜訪談紀錄（回覆）〉 | 完整 |
| Figma `mockup---prototype` 畫布「首頁」(1:2) | 全部圖層名稱與註解，涵蓋首頁 V3、我的用品、用品詳情 V2、新增用品、Prototype Flow 01～03、Design System、系統通知 Mockup；只截圖 3 張（1179:9396、1189:9807、928:7738），其餘畫面沒有逐張目視比對 |
| FigJam「前期研究分析-整理版」(244:1289) | 完整；「前期研究分析-工作板」沒有讀 |

## 核對時發現、已處理的重點
- 前一版草案說 R002「舊 Drive 規則是 7 天」，**查無出處**；Drive 現值是 5 天。
- 最新 Figma 寫「補貨週期：補貨後自動推算」，和「無週期不自動推算」衝突。已改成以使用者填寫的「庫存量＋預計補貨日」換算（D1、D2）。
- Figma 用品詳情原本沒有關閉提醒的入口；決定新增提醒開關（D5）。
- 程式衝突與未實作的項目列在 `spec.md`「程式現況與本規格的差異」；Figma／Drive 要同步修改的地方列在「外部來源待同步」。

## 已知技術
Vue 3、Vite、Vue Router、Pinia、Bootstrap、Sass。預設資料與狀態判斷在 `src/models/item.js`，Pinia 的用品與空間操作在 `src/stores/items.js`。目前沒有資料持久化，也沒有測試框架（`package.json` 只有 dev、build、preview）。

## 導入守則
1. 不動現有 `src/`，不重構已完成的功能，不自動安裝 MySQL／XAMPP。
2. 開始前檢查 `git status`，先 commit 或 stash 未提交的變更。
3. 執行官方 Spec Kit 初始化後，檢查 `git diff`，確認沒有覆蓋組員的檔案。
4. 從現有功能的小型變更開始，不要求倒寫整個系統。
5. 每次修改規格，都在 `docs/DECISION_LOG.md` 留下舊值、新值與原因；完整歷史由 Git commit 保存。
6. **不要把 `.playwright-mcp/` 加入 commit**：它目前沒有被 `.gitignore` 排除，加檔案時請逐一指定，不要用 `git add .`。

## 草案檔案
| 檔案 | 內容 | 狀態 |
|---|---|---|
| `docs/PRODUCT_BASELINE.md` | 已定案的產品決策、程式現況、待確認事項 | 已更新 |
| `docs/DECISION_LOG.md` | 每項決策的舊值、新值、原因與狀態 | 已更新 |
| `specs/001-reminder-restock/spec.md` | 提醒與完成補貨邏輯，FR-001～007，驗收情境 16 個 | 修訂版 2 |
| `docs/AI_WORKFLOW.md` | Codex 與版本控制規則 | 本次未核對、未修改 |

## 建議執行方法（Windows PowerShell）
```powershell
# 在 repo 根目錄；先人工檢查 git status
git status
git switch chore/spec-kit-adoption   # 分支已存在，不需再 -c 建立
# 安裝 specify-cli 請照官方文件，避免使用過期的安裝指令
specify init --here --force --integration codex --script ps
git status
git diff
```
注意：
- 上面 `specify init` 的參數沿用前一版草案，**本次沒有對照官方文件核對**，執行前請先確認。
- `--force` 只用在已經備份、有可審查基準的目錄；如果和既有的 Spec Kit 管理檔案衝突，可能會被覆寫。已經安裝過 Spec Kit 的話，不要反覆 init。

官方：https://github.com/github/spec-kit/blob/main/docs/guides/existing-projects.md
