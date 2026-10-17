# 補貨通知最小整合

分支：fix/restock-notification-integration；基底：main 8f98034。
完整未完成通知功能已保存於 origin/feature/notifications-wip（a984fe3），不納入此分支。

## 本次內容

- items.js：已審查的 completeRestock、recordRestockBatch、runRestockNotification 差異，以及必要的 Store import 與共享通知橋接。
- completeRestock 既有兩參數用法相容；第三參數僅供批次收集通知回呼。
- 批次全部成功後才發布通知；ensureCatalogItem 回傳失敗時沿用原 undo，尚未發布的通知丟棄。
- 發布／追蹤各自捕捉通知錯誤，Console 保留操作、用品／空間／紀錄 ID 與原始錯誤。
- 補貨資料錯誤不在通知 catch 內，不修改日期公式、Catalog ID、補貨紀錄模型或既有復原操作。
- 最小 sharedNotifications Store：records、publishMemberEvent（僅 restocked）、trackRestockCompletion、pruneExpired。
- notificationRetention：沿用六個曆月保留與每分鐘／頁面顯示時清理；計時器在 Store dispose 時清理。
- persist.js 僅增加 sharedNotifications Key；STORAGE_VERSION 維持 2，保留 Catalog 交易機制。

## 明確排除

沒有通知頁／路由、鈴鐺、展示資料產生器、提醒通知產生器、認領／接手觸發、用品／設定 UI。未新增任何後端或跨裝置服務。
最小 Store 不具完整 WIP API，不可直接搭配 WIP UI；未來整合時需逐段合併，不能覆蓋兩個版本的 Store。
既有已保存的合法通知（含過去展示資料）及已讀資訊照常載入，並保留額外存檔欄位；不重新建立或更新展示內容。

## 測試

- node --test --test-concurrency=1 tests/*.test.mjs：68/68 通過。
- npm run build：通過。
- git diff --check：通過。
- 回歸包含單筆／批次、驗證失敗回復、手動 undo、通知故障不阻斷補貨、紀錄不重複、計時器清理。
- 提醒追蹤測試改為直接建立 fixture，避免為測試引入正式提醒產生器。
- 新增最小依賴測試：空 Store 不產生 demo、不接受未整合事件、個人不發布共享通知、存檔重新載入與既有 WIP metadata 保留。
- 未完成手機實機與跨裝置測試。

## 合併評估與保留限制

依目前自動測試與差異範圍，可作為此已審查修正的合併候選；不代表完整通知功能完成。待使用者確認後再建立 PR，不自動合併。

1. 通知失敗僅 Console 記錄，無持久化錯誤佇列或自動重試。
2. 發布成功但追蹤失敗可能留下部分通知結果；不回滾已成功補貨。
3. 使用者 undo 不撤回已發布通知；追蹤目標可能保留不存在的紀錄 ID。
4. 原有批次只在 ensureCatalogItem 回傳失敗時執行 undo；真正資料函式意外拋錯的通用原子回復不在本次範圍。
5. 目前僅本機儲存其他成員的事件，尚無跨帳號／裝置投遞，亦無 UI 入口。
6. 最小 Store 尚無同事件自動去重／60 秒合併；未連接任何認領／接手掛鉤。
7. 既有推算公式未修改；回歸不代表新增完整公式證明。
