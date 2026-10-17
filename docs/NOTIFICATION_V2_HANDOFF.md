# 通知 V2：實作與組員交接

2026-10-18；`feature/final-integration`，`/tmp/home-restock-final-integration`。本次提交上傳供組員審查，使用 Draft PR，禁止自動合併。原工作區、兩個功能分支與全部 stash 保留。

## 完成狀態

| 規則 | 結果 |
| --- | --- |
| 該補貨了 | 依現有 reminderStatus／門檻／暫緩設定產生共享空間提醒，依單位週期及預計日建立穩定事件鍵，不改公式 |
| 認領／接手／已補貨 | 三類操作成功後入列，資料立即更新；第一筆起固定 60 秒後正式建立 |
| 合併與去重 | 同操作者／空間／類型合併，收件人快照合併去重；事件 ID 去重、用品 ID 計數，後續不延長 |
| 取消與 Undo | 合併期取消移除用品，全部取消無通知；復原取消於期限內還原原批次及截止時間；補貨 Undo 保留單位週期安全規則 |
| 重整恢復 | 保存 pendingBatches、第一筆／截止時間、processedEventIds、取消事件標記，來源就緒後處理到期批次 |
| 查看／已讀 | 每接收者 recipientState，進頁只標 seen；單筆及全部已讀標 read，互不影響其他成員 |
| 鈴鐺 | 購買清單右上 bell.svg，尺寸及 Soft UI 沿用；只有未查看正式通知亮圓點，待發送不亮 |
| 通知頁 | 四類左側 icon、事件快照文字、當天 HH:mm／其他 MM/DD、未讀淺綠稍粗／已讀白底一般字重；無卡片圓點 |
| 全部已讀 | 沿用現有淺綠按鈕，全部已讀或空列表停用 |
| 跳轉 | 補貨提醒／已補貨去我的用品，認領／接手去共享清單；選對應空間，不進用品詳情，不重做操作 |
| 刪除例外 | 空間不存在／無法查看優先；全部用品刪除留原頁、部分刪除跳轉，一次最多一則 Toast；無法跳轉仍可已讀 |
| 舊通知 | 保留原 message／createdAt、合法 demo/event、未知存檔欄位；缺 IDs 不假造「全刪除」，沿用原空間跳轉 |
| 六個月 | 使用既有六個曆月截止工具，App 建立通知 Store／進通知頁／回前景清理，只刪過期通知 |
| 故障隔離 | 通知保存成功才套用正式通知／狀態；失敗保留 pending、記錄錯誤，不反向修改已成功補貨／認領／接手 |

提醒產生依 App 內既有提醒狀態；notificationSettings.pushEnabled 是裝置推播偏好，不代表已取得權限，也不會關閉 App 內狀態。沒有加入任何系統推播或後端。

## 本次主要程式檔案

- `src/stores/sharedNotifications.js`：擴充同一 Store，沒有建立重複 Store。
- `src/stores/items.js`：只接成功後通知／取消／Undo 通知掛鉤與提醒只讀來源。
- `src/utils/notificationCopy.js`（新增）：四類事件快照文案、數量及 icon 映射。
- `src/utils/notificationNavigation.js`（新增）：只讀的目的地與刪除提示決策。
- `src/views/NotificationsView.vue`（新增）：由 WIP 版面逐區塊改造；移除 demo 初始化、舊補貨 Toast 和錯誤跳轉。
- `src/components/SharedNotificationsMenu.vue`（新增）：由 WIP 外觀改造，移除 demo 初始化。
- `src/router/index.js`：只新增 notifications 路由，保留現有用品路由及 nav meta。
- `src/views/ShoppingView.vue`：頭貼入口換鈴鐺；局部監聽 tab/space query，保留購買清單 UI／認領流程。
- `src/App.vue`：只讀監聽現有用品提醒狀態，呼叫提醒產生 API，錯誤隔離；原轉場及 Toast provider 保留。
- `tests/notifications-v2.test.mjs`（新增）、`tests/restock-catalog-link.test.mjs`（更新）：新規則及原補貨通知回歸。

`persist.js`、Toast、用品模型、單位週期工具、補貨公式、RestockRecordView、歷史列表、分類刪除皆未因本次 V2 實作再修改。它們相對 main 的差異是此前已存在的最新用品基礎，不能當成本次通知新增內容。

## Store API

- `publishMemberEvent({ type, space, actorId, actorName, itemName, memberIds, itemId, recordId?, operationId? })`：補貨需要 recordId；認領／接手需要穩定 operationId。成功入列 `{ok:true}`；重播 `{ok:true,duplicate:true}`；不適用／無其他成員 `{ok:true,skipped:true}`；保存失敗 `{ok:false,error}` 並記錄。
- `flushPending(now = Date.now())`：只讀來源校驗後，處理到期、取消及正式建立；穩定批次 ID 避免重複。正式通知 createdAt 是實際建立時間，另保留 firstEventAt/deadlineAt。
- `cancelMemberEvents({itemId,actorId,spaceId,now?})`：只取消尚在原視窗的認領／接手事件，不建立新通知。回傳結果另含 `undo()`，僅能在原視窗內恢復，不延長截止時間。
- `publishRestockReminders()`：讀現有狀態、空間及成員；按空間彙總新提醒，持久化事件鍵避免重整重複。
- `visibleRecords`：目前本機成員 self 的有效通知，依建立時間新到舊；不因空間已刪除而隱藏歷史。
- `hasUnseen`：鈴鐺圓點；`hasUnread`：卡片未讀；`recipientState(entry,recipientId='self')`：個別收件人狀態。
- `markViewed(recipientId='self')`：目前通知標 seen；不改 read。
- `markRead(id,recipientId='self')`：單筆標 read/seen。
- `markAllRead(ids?,recipientId='self')`：只改目前列表指定 IDs，不改 pending。成功保存後才反映狀態。
- 原 `records/trackRestockCompletion/pruneExpired` 保持相容。

單一 sharedNotifications localStorage Key 保存 records、pendingBatches、processedEventIds、cancelledEventIds，沿用版本 2。舊通知的 scalar read/seen 保留作相容 fallback，新操作寫入每收件人狀態表；不替舊通知猜用品 IDs，也不改寫歷史文字。

## 組員共用函式的局部調整

| items.js 函式 | 變動 |
| --- | --- |
| completeRestock／notifySharedOperation | 成功後傳用品／紀錄 ID 及文字快照，沿用原批次 notificationQueue |
| runRestockNotification | 通知例外 Console 可追查；回傳通知結果供取消 Undo 使用，補貨資料錯誤仍在外層 |
| claimShoppingItem | 原條件及 updateItem 後才加入 claimed，使用新 operationId |
| takeOverShoppingClaim | 原條件及 updateItem 後才加入 takeover |
| cancelShoppingClaim | 原取消成功後取消對應 pending，回傳 operation 增加 notificationUndo 回呼，不改 before/after |
| undoShoppingOperation | 保留原差異復原；撤銷認領／接手時取消 pending，復原取消時還原未到期原批次 |
| Store 初始化／只讀來源 | 提供 getItem/getSpace/reminderGroups；觀察紀錄 IDs 以取消補貨 Undo；不寫單位／歷史／公式 |

組員頁面繼續用原本 Store API，不自行 setTimeout、不直接發通知、不重做補貨。變動仍需後續經共同審查再合併；本機沒有改組員其他分支。

## 測試與手機版

- 全部測試：149 項通過，無跳過。包含實際計時器假時鐘回呼、60 秒前不可見、到期一則、固定窗口／跨操作者／類型、取消部分／全部、取消 Undo、重整恢復、事件去重、seen/read／全部已讀、每接收者隔離、舊存檔、存檔失敗、刪除導航、六個月與原有單位／補貨／Undo 回歸。
- Chromium 手機寬度 320／375／390／430 與桌面 1440：通知頁、全部已讀／停用、鈴鐺查看狀態、共享清單／我的用品跳轉、刪除 Toast，沒有橫向溢出或 pageerror。
- 最新編輯 Sheet 另回歸四種手機寬度、單位確認／取消／儲存及重整。
- 測試資料只存在隔離的瀏覽器 context；正式 App 無 initializeDemo 或展示事件產生器。
- 本機通知測試截圖／結果：`/tmp/bubu-v2-mobile`；自動測試 log：`/tmp/bubu-v2-tests.log`。

## 可交付與剩餘限制

可提供組員在獨立 worktree 進行本機整合測試；本版準備上傳 feature/final-integration 的 Draft PR，待共同確認後才合併。

1. 無後端、跨裝置即時投遞或真實多帳號登入；UI 使用現有 self 身分。其他成員事件與 per-recipient 隔離已以測試 fixture／API 驗證，不能宣稱兩支手機可同步。
2. 背景／關閉頁面不保證準點執行，到前景／重新開啟依原期限補處理。
3. 跨分頁並行寫入沒有分散鎖；本次去重涵蓋單一執行環境、重播及正常重整。
4. 通知保存失敗不回報通知成功；沒有無限自動重試。回前景／後續協調可重試。補貨資料與通知仍是不同 Key，瀏覽器在兩者都未保存且突然終止時無完整跨 Key 交易保證。失敗首次入列不會為補通知重建補貨。
5. 取消保存失敗時，本執行環境保留取消標記避免誤發；在存檔仍失敗時立即崩潰／重整，無法宣稱未保存狀態必定恢復。
6. 已刪用品的舊通知若根本沒有歷史 IDs，不能準確判斷全部／部分刪除；保留原文並正常開對應有效空間，不捏造刪除提示。
7. processedEventIds／取消識別目前保留以防重播，長期大量操作的安全清理策略可後續制定；六個月正式通知清理已實作。
8. 尚未檢查實體 iPhone Safari、實體鍵盤／系統推播。已完成 Chromium 響應式與實際互動測試。

## 使用者要求新增的舊通知預覽（2026-10-18）

開發預覽新增 12 筆 source=demo／previewOnly 的舊通知，使用 notificationCopy 同一文案函式、只針對目前共享空間。日期涵蓋 1～170 天，全部在六個月保留期內；已讀／未讀混合。App 僅於 import.meta.env.DEV 呼叫 seedPreviewHistory，成功後保存一次性標記，重新整理不重建、不覆寫已讀狀態。Production build 不自動產生預覽通知；已存的合法 demo 記錄仍照舊相容保留。已刪除的歷史用品以明確預覽 ID 表示，點擊仍由同一導航例外規則處理，不建立／修改用品或補貨。新增 src/utils/notificationPreview.js，Store 使用既有原子通知保存，新增一項回歸確認只建立一次及資料不受影響。

## 上傳審查版補充

- 我的用品（InventoryView）與購買清單現皆共用通知鈴鐺，避免跨頁或重整時看到不同入口。
- 新增 notificationPreview.js 的開發用舊通知資料；source=demo／previewOnly、只建立一次，Production 不自動產生。
- 上傳前完整測試 149 項通過、Build 通過；main 基底為 d13e8e8。此 PR 含完整用品 UI、Catalog 分類管理、自訂單位、單位週期與通知整合，並非單獨通知變更，請組員特別審查共用 items.js／item.js／catalogLinks.js／persist.js。
- 文件中先前「尚未實作」「未上傳」屬歷史階段記錄；本節及本文件完成表為目前審查版本。PR 不自動合併。
