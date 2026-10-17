# 通知 WIP 保存狀態

基底：origin/main 8f98034。此分支保存 feature/shared-refinements 未提交的通知進度，不代表通知規格全部完成；不建立 PR、不合併 main。

## 範圍
- 通知 Store、示範資料、頁面、文案與保留期限工具、鈴鐺入口。
- router 的通知路由、Inventory 的通知提示、Shopping 的通知 query 監聽。
- items 的通知觸發與補貨錯誤邊界、persist 的 sharedNotifications Key。
- 補貨回歸測試、通知規格、既有決策與審查摘錄。
- 不含新增用品 UI、轉場、設定／購買清單的其他 UI 修改及共用 Toast 調整。

## 已知限制
- 包含 source=demo 展示通知，不提供後端或跨裝置同步。
- 規格包含後續需求，部分文字與現有行為尚未對齊；保留原進度，不在分支整理時改寫功能。
- 通知失敗只記錄 Console，無自動重試；補貨 undo 不撤回已發布通知。
- 認領／接手既有掛鉤未套用補貨專用錯誤邊界。
- NotificationsView 保留舊補貨狀態 Toast 跳轉，與後來不顯示此 Toast 的需求尚待對齊。
- 正式事件尚未完整實作 60 秒合併、事件去重及用品刪除例外。
- 補貨／Catalog 保留 main 既有程式；只加入通知副作用與成功後投遞時序，未修改推算公式。

本分支為可建置的本機通知 WIP，並非完整通知交付。

## 分支驗證

`node --test --test-concurrency=1 tests/*.test.mjs`：66/66 通過。`npm run build` 與 `git diff --check` 通過。未完成手機實機驗證。
