# 通知 V2 與最新用品管理整合分析

日期：2026-10-18。本文件保留原安全環境、規格整理與衝突分析；後續 V2 已在本機實作，請以文件末尾更新及 NOTIFICATION_V2_HANDOFF.md 為最新完成狀態。

## 1. 分支與實際成果來源

| 位置 | 分支／版本 | 狀態 |
| --- | --- | --- |
| 原 IDE 工作區 | feature/shared-refinements，HEAD d13e8e8 | 35 個修改／未追蹤檔案，已含單位週期整合及最新 UI |
| /tmp/home-restock-unit-period-integration | feature/unit-period-integration，HEAD d13e8e8 | 24 個修改／未追蹤檔案；原單位週期成果，部分 UI 較舊 |
| /tmp/home-restock-notifications-wip | feature/notifications-wip，a984fe3 | 乾淨；已保存舊通知進度 |
| /tmp/home-restock-final-integration | feature/final-integration，HEAD d13e8e8 | 本次新建獨立 worktree，尚未 Commit |
| origin/main | fetch 後 d13e8e8 | 本次沒有新遠端 main 更新 |

兩個功能分支的最近共同祖先為 8f98034。不能只看分支 HEAD 就認為已包含未提交功能。

最新完整基礎是原 IDE 工作區：先前已將單位週期逐區塊整合回該處，並增加確認彈窗、最新文案、分隔線、分類分組、左滑刪除等。新分支從 unit-period-integration 的 HEAD 建立後，再複製原工作區 35 份修改／新檔，逐檔 SHA-256 校驗。**不是 cherry-pick 已提交單位週期成果；目前功能仍在未提交工作樹。**

此完整快照也保留原工作區原有的設定／購買清單 UI 與轉場修改；它們是已存在的基礎內容，不是本次新增的通知改動。日後準備 PR 時須再次分辨基礎與通知改動，不能把新分支相對 main 的全部差異直接當成通知 V2。

## 2. 安全保存

完整備份：`/tmp/bubu-final-integration-backup-20261018-042836`。

- current.tar.gz、unit.tar.gz：兩邊全部修改／未追蹤檔案；各有 binary diff、SHA-256 manifest。
- notifications 分支當下為乾淨；commit a984fe3、refs 及 worktree 清單均記錄。
- stash.txt：原 stash 完整列表，本次不 stash/pop/drop，不改既有 stash。
- final-foundation.manifest.json：新 worktree 初始完整成果的 35 份雜湊，可區分後續通知改動。
- notification-source.sha256：原 HTML 雜湊。
- dry-merge.json 及 dry-merge/：僅在備份目錄模擬文字三方合併，**沒有將模擬結果套用到程式**。

保存方式建議：本機壓縮備份＋新 worktree 快照先保留；待使用者確認後，才在新分支建立「用品基礎」與「通知 V2」分開的 Commit。本階段沒有 Commit／Push／PR／Merge。未 Commit 的分支指標本身不包含這些成果，不能只 Push 空分支就宣稱已備份功能。

## 3. 規格來源與尚待確認

正式整理見 [NOTIFICATION_SPEC_V2.md](NOTIFICATION_SPEC_V2.md)；來源 HTML 完整保存於 docs/sources/。

2026-10-18 三項衝突已確認，正式規格以 NOTIFICATION_SPEC_V2.md 為準：

1. 認領、接手、已補貨均固定等待第一筆起 60 秒後才正式建立通知，操作資料立即更新。
2. 鈴鐺依接收者 seen 表示尚未查看；進頁清除 seen 提示，不改單筆 read。後續新通知再次亮點。
3. 保留全部已讀，將目前列表全部標 read；空列表／全部已讀時沿用停用按鈕。
4. 已讀批次再合併已不適用此三類延後通知：等待期無正式通知，到期後內容固定。
5. 補貨提醒的穩定事件鍵、再次提醒時機，以及無完整帳號 ID 時的本機成員驗收方式。
6. 無用品 IDs 的舊通知如何保守處理，不能由文案反推歷史物件，也不能當作全部已刪除。
7. 當日時間／其他日期格式沿用哪一版；HTML 樣式示例不等於正式格式。

## 4. 衝突檢查

三方文字試算以 8f98034 為共同基底、最新基礎與通知 WIP 為兩側。文字無衝突不代表行為相容。

| 檔案 | 文字衝突塊 | 程式／語意風險與處理 |
| --- | --- | --- |
| src/stores/items.js | 2 | 高：新版週期快照、批次失敗回復、差異 Undo 與通知觸發共同修改。只加事件介面，保留全部新週期及補貨流程 |
| src/stores/sharedNotifications.js | 7 | 高：目前為 main 最小通知層；WIP 有 demo、seen 與舊 API。以目前層擴充，不覆蓋整份 |
| src/utils/persist.js | 1 | 高：STORE_KEYS 的 sharedNotifications 與 catalog/unitOptions 共存；保留版本 2 與交易復原，不搬回舊 keys |
| src/router/index.js | 0 | 中：只增 /notifications 路由，保留新增用品 nav、目前 meta 與轉場需求 |
| src/views/ShoppingView.vue | 0 | 中：現有初始化讀 tab/space query；若已掛載再導入，需只加必要 query 監聽，不重做認領／面板 |
| src/views/InventoryView.vue | 0 | 中：舊 WIP 的 notificationRestocked Toast 與 V2 不符；不能移入。沿用 inventorySpaceId 選空間 |
| src/components/ProfileAvatarMenu.vue | 新舊用途不同 | 中：WIP 是鈴鐺相容包裝；需先確認所有引用位置，避免誤換不該變的頭貼 |
| src/components/AppToast.vue、src/composables/useToast.js | 0 | 高（整檔覆蓋）：WIP 沒有最新 Sheet 內顯示、紅色錯誤與觸碰／聚焦暫停；沿用現版，不移入舊版 |
| src/App.vue | 0 | 保留最新轉場。只有通知頁轉場確有需求才局部調整 |
| StatusCard.vue、ItemDetailView.vue、RestockRecordView.vue、RestockItemGrid.vue | 0 | WIP 相對共同基底未修改；差異主要是 main 後續更新，不能搬回舊檔 |

禁止以 `git checkout notifications-wip -- src` 或整份複製共用檔案完成整合；也不可復活舊分支刪除的補貨／認領測試。

## 5. 後續預計檔案範圍

### 可優先引入／改造的通知專用檔案

- src/views/NotificationsView.vue：保留 Soft UI；去除 initializeDemo、舊補貨 Toast 分流；按 V2 做跳轉與例外。
- src/components/SharedNotificationsMenu.vue：沿用 bell.svg 與尺寸；seen/read 分離規則已確認。
- src/utils/notificationCopy.js：四類文案函式可沿用思路；正式文字只用事件快照。
- src/stores/sharedNotifications.js：擴充目前 Store，增加結構化事件、接收者已讀表、合併資訊、待發送批次、去重及相容舊存檔。
- 必要時新增通知專用的批次／排程／導航工具與測試，不建立另一個重複通知 Store。

### 共用檔案的最小修改計畫（尚未執行，供組員確認）

| 位置／函式 | 原因 | 允許的局部變動 | 不得改動 |
| --- | --- | --- | --- |
| items.js completeRestock() | 現在缺用品 ID／紀錄 ID 的事件快照與延後發送 | 成功後入列；沿用 runRestockNotification 邊界 | 日期、數量、週期寫入、清單移除與認領清理 |
| items.js recordRestockBatch() | 整批成功才入列，復原能取消對應待發送事件 | 沿用 notificationQueue，保留對應操作 ID／紀錄 IDs | 批次原子回復、created item 保護、單位週期安全 Undo |
| items.js restoreItem()、applyRestockRecords() 或獨立觀察器 | 第 59 秒復原／刪除紀錄後不得發送；不能用過期快照回滾週期 | 僅取消已成功復原的事件或提供只讀驗證 | 三方 Undo 演算法、紀錄推算公式 |
| items.js claimShoppingItem() | 成功後加入認領事件 | 通過既有條件後掛安全通知邊界，傳前後操作者資料 | 認領資格、購買資料與所有原有驗證 |
| items.js cancelShoppingClaim() | 60 秒內移除原認領批次用品 | 依原事件／用品 ID 取消，不發新事件 | 原取消／復原資料規則 |
| items.js takeOverShoppingClaim() | 成功後產生接手事件 | 既有成功路徑後掛通知；先快照原認領人 | 接手條件與購買清單狀態 |
| router/index.js | 通知頁入口 | 單一路由及原有 meta 慣例 | 其他路由／nav／轉場 |
| ShoppingView.vue | 通知導入共享空間 | 只同步 tab/space query | 認領／接手 UI 與業務流程 |
| InventoryView.vue（若必要） | 選通知空間並維持最新資料 | 沿用 inventorySpaceId；若部分刪除需跨頁 Toast，優先現有 appToast | 列表篩選與補貨邏輯 |
| persist.js | 通知現有 Key 已存在 | 優先零修改，通知新欄位在既有 Key 相容載入 | STORAGE_VERSION、Catalog journal、單位 keys |

通知提醒產生器優先獨立模組讀取現有 getReminderStatus／提醒設定，不在每個頁面重複產生，不更動公式。若提醒接收對象或週期鍵不明，先與組員確認。

## 6. 舊通知實作不符合 V2 的具體位置

- NotificationsView 和鈴鐺 setup 皆 initializeDemo；會產生個人及共享假資料，正式版不能自動呼叫。
- Store 沒有固定 60 秒事件合併與穩定事件去重，也沒有待發送佇列；cancelShoppingClaim 無通知取消介面。
- Store 只有單筆 read／seen，沒有依接收者分開的已讀表；hasUnread 使用 seen，進頁全部 seen。
- NotificationsView 的 canView 直接過濾已消失空間，讓使用者無法點到舊通知取得 V2 例外提示。
- follow() 把已補貨導向 shopping，應改 inventory；allRestocked 分流顯示補貨狀態 Toast 需移除。
- follow() 未做空間權限、部分／全部用品刪除檢查，缺每次最多一則 Toast 優先序。
- 正式 member event 只有單一品名文字，缺 item IDs、完整快照、批次 ID／事件 ID。
- initializeDemo 會改寫舊 demo 文案，不可用來遷移正式歷史通知。
- 認領／接手通知沒有補貨專用的錯誤邊界，通知失敗可能讓已成功的操作被回報為失敗。
- 目前與 WIP 都沒有後端投遞；本機操作排除 self 後不會自然變成自己收到他人事件，驗收需明確測試 fixture／身分方式。

## 7. 建議資料／交易方向（待程式階段確認）

保留既有 records、合法舊通知及未知存檔欄位。新事件增加結構化用品／名稱快照、事件 ID、固定第一筆時間／截止時間、接收者已讀資料及 pending 狀態。舊 message 與 createdAt 不改寫；不由名稱猜 IDs。

補貨資料先成功 → 待發送事件持久化 → 復原成功取消對應事件 → 到期再讀最新用品／紀錄驗證 → 在同一通知 Key 一次保存正式通知與批次完成／去重狀態。通知錯誤只在通知邊界記錄，不能將補貨例外吞掉或重做補貨。

到期前重新驗證不可取代 Undo 的持久化取消資訊；需要同時設計重整、存檔失敗、時鐘邊界及關頁恢復。跨 Key 的補貨／通知不宣稱具完整跨裝置交易保證，絕不可為了補發通知重建補貨紀錄。

## 8. V2 功能狀態

| 驗收項目 | 最新基礎／舊 WIP 狀態 | 本階段結果 |
| --- | --- | --- |
| 鈴鐺、獨立通知頁、Soft UI | WIP 有 UI | 已分析，未移入 |
| 四類事件與接收對象 | 基礎只接補貨，WIP 部分掛鉤 | 待程式整合及組員確認 |
| 文案快照及數量規則 | WIP 函式部分可用，事件欄位不足 | 規格完成；未串接 |
| 固定 60 秒合併／去重 | 無完整實作 | 待實作 |
| 補貨等待 60 秒／復原取消 | 基礎立即建立 | 三類操作延後建立已確認；待實作 |
| 取消認領移除原批次 | 無 | 待實作 |
| 每接收者已讀／鈴鐺 | WIP 舊 read/seen | 已確認分開處理，待正式實作 |
| 兩種跳轉／刪除例外／Toast | WIP 有錯誤路由與舊提示 | 待實作 |
| 六個月、重新載入 | 基礎已有保留工具及持久化 | 新 schema 仍須回歸 |
| 通知失敗不影響補貨 | 基礎已有邊界與回歸 | 保留；新認領／排程仍需驗證 |
| 單位週期／歷史／批次／Undo | 最新用品基礎已有實作 | 新 worktree 基準測試驗證；不表示通知 V2 通過 |

## 9. 驗證與下一步

基準測試／Build 記錄位於備份目錄 foundation-tests.log、foundation-build.log。這是新品用品基礎的驗證，通知 V2 尚未整合，因此不標記四類通知／60 秒等驗收通過。

後續先確認第 3 節規則與第 5 節組員共用函式的修改範圍，再依序進行：純通知 UI／文案與導航 → Store schema／已讀／保留 → 批次去重／延後發布／取消 → 成功後事件掛鉤 → 全部回歸與手機版 QA。完成前不 Push，不 Merge main。

## 2026-10-18 最新決定與 Store 檢查補充

- 三項決定已同步正式規格：三類操作延後 60 秒、鈴鐺 seen 與 read 分離、保留全部已讀並於全已讀時停用。
- 現有最小 Store 沒有 pending、deadline、收件人 seen/read 表，必須擴充。舊 WIP 單一 read/seen 不能直接滿足每收件人狀態。
- 建議在現有 sharedNotifications Key 保存 pendingBatches、固定起點／截止時間、事件 IDs、用品／紀錄 IDs、快照與發布去重識別；正式通知增加 recipientState，不碰用品及單位週期模型。
- 本次仍僅修改文件，沒有啟用延後排程、三類通知或已讀 UI。現有測試通過不得當成新通知規則驗收完成。

## 通知 V2 實作更新（2026-10-18）

前述「尚未實作／待實作」是分析階段記錄。本機 feature/final-integration 現已完成四類通知、三類操作固定 60 秒、取消與 Undo、每收件者 seen/read、全部已讀、導航例外及六個月保留；實際 API、148 項回歸及限制詳見 [NOTIFICATION_V2_HANDOFF.md](NOTIFICATION_V2_HANDOFF.md)。未 Commit／Push，不代表原分支或其他裝置已更新。
