# 共享補貨通知延後 60 秒：串接交接

> 此為補貨先行階段的交接記錄。三類事件與 UI 現已完整整合，請以 [通知 V2 最新交接](NOTIFICATION_V2_HANDOFF.md) 為準。

狀態：2026-10-18，本機 `feature/final-integration` 已實作「已補貨」待發送與復原取消。未 Commit／Push。這不代表通知 V2 全部完成；認領、接手、通知 UI、查看／全部已讀仍待後續整合。

## 行為

- 補貨資料立即更新。共享補貨成功後先保存待發送事件，第一筆起固定 60000ms 後才建立正式通知。
- 同操作者、空間、類型及相同收件人名單合併，後續不延長截止時間。事件依空間用品／紀錄 ID 去重，同批用品依用品 ID 計數。
- 單筆／批次 Undo、紀錄移除等造成對應紀錄不存在時，立即嘗試持久化取消該待發送事件。第 59 秒成功 Undo 不會在第 60 秒產生該次補貨通知。
- 部分復原保留其餘有效事件，全部復原清空批次。已正式建立的通知不撤回。
- 選項、單位、計算週期、歷史紀錄不由通知層寫入；到期只讀目前用品與紀錄判斷有效性。
- 固定截止時間與去重 IDs 保存在既有 sharedNotifications Key，不改 STORAGE_VERSION。
- 重新開 App 時 Items Store 註冊只讀來源，再處理保存的批次；來源未就緒不發布。正式通知與移除 pending 在同一次 localStorage 寫入成功後才套用記憶體。

## 組員補貨頁

繼續使用既有 API，不要在頁面自己建立通知或 setTimeout：

```js
const result = itemsStore.recordRestockBatch(entries, { spaceId, date })
if (result.ok) {
  // 原 Toast 的復原呼叫保持不變。
  // result.undo() 同時使已撤銷紀錄的待發送通知失效。
}
```

單筆繼續使用 `snapshotItem(id)` → `completeRestock(id, options)` → `restoreItem(snapshot)`。購買清單既有透過共用紀錄變更的復原同樣由觀察器處理。不得藉通知事件直接重做補貨。

## 實際通知 API

`src/stores/sharedNotifications.js`：

- `publishMemberEvent({type, space, actorId, actorName, itemName, memberIds, itemId, recordId})`：目前只接受 `restocked`，其他類型／非共享／無收件人跳過。用品與紀錄 IDs 必填；缺少時拋錯，由現有 runRestockNotification 邊界記錄，不能阻斷已成功補貨。
- 成功入列回 `{ok:true}`；重複回 `{ok:true,duplicate:true}`；跳過回 `{ok:true,skipped:true}`；保存失敗回 `{ok:false,error}` 並記錄 Console。名稱沿用舊 API 是為相容，但它現在代表入列，不代表立即發布。
- `pendingBatches`：批次含固定 `id/type/actorId/actorName/spaceId/spaceName/recipientIds/firstEventAt/deadlineAt/events[]`。每事件含 `eventId/itemId/recordId/itemName/occurredAt`。
- `processedEventIds`：持久化去重，已取消事件也不因同事件重播而重建。真正再次補貨有新 recordId，不受阻擋。
- `flushPending(now = Date.now())`：來源就緒後校驗、取消失效事件並處理到期批次，回 `{ok:true}` 或 `{ok:false,error}`；參數供假時鐘測試，產品應使用預設實際時間。
- 正式通知有穩定 `restock-batch:<batchId>` ID，保留事件快照、用品 IDs、原起點／截止時間；createdAt 是實際建立時間。新建時每收件人 `recipientState` 初值為 `{seen:false,read:false}`，但查看／已讀 UI API 尚未串接。
- 原 `records/trackRestockCompletion/pruneExpired` 保持相容，舊合法通知與未知存檔欄位保留，不重新產生 demo。

共用連接（Items Store 內部使用）：

- `registerRestockNotificationSource(pinia,{getItem,getSpace})`：註冊該 Pinia 實例的只讀來源，回傳清理函式。
- `reconcileRestockNotifications(pinia)`：透過該實例的通知協調器處理紀錄移除；未建立通知 Store 時無作用。

## items.js 的實際變動

1. completeRestock() 的成功後通知回呼傳入新紀錄 recordId；既有批次 notificationQueue 保留。
2. notifySharedOperation() 增加 recordId 參數，傳入 itemId／recordId，沒有改購買清單、認領清理或公式。
3. Store 初始化註冊來源，觀察用品／空間／紀錄 ID 的變化。復原演算法與 recordRestockBatch 的資料操作不重寫。
4. 若有保存的 pending，Items Store 完成來源初始化後恢復處理；通知恢復失敗只記錄錯誤。

## 驗證

- 全部測試：132 項通過（含現有補貨、Catalog、單位週期、批次失敗、購買清單／Undo 回歸）。
- 新增驗證：59 秒 Undo＋單位改動、固定視窗／事件重播去重、部分 Undo／通知寫入失敗、完整 App 重載到期只建立一次。
- 測試使用截止時間／假時鐘，不等待實際一分鐘。計時器及來源在 Store dispose 時清理。

## 限制與剩餘風險

- 只在此整合 worktree 生效；組員分支仍須後續審查整合，沒有自動修改對方程式。
- 沒有後端或跨裝置投遞。這裡「不收到」指到期前不建立／公開本機正式通知；不能宣稱其他裝置已具可靠投遞。
- 頁面關閉時不保證背景準點執行；重新開啟／回前景依原期限處理，不重新倒數。
- 通知存檔失敗保留錯誤及尚未提交的批次狀態，沒有失敗後持續高速自動重試；回前景／後續協調或重新載入可再次處理。補貨成功但首次入列失敗時，不會自行重做或補建補貨。
- 用品存檔沿用既有 debounce，與通知不是完整跨 Key 交易；瀏覽器在成功 Undo 後、用品持久化前崩潰且通知保存也失敗時，仍可能恢復較舊磁碟狀態。發布前校驗能阻擋已保存的撤銷，不宣稱抵抗所有崩潰情境。
- 多分頁同時寫入沒有分散鎖；去重保證限單一執行環境與正常重新載入。
- processedEventIds 目前持久保留，長期大量操作需另定安全清理策略，不能為節省空間任意刪除仍可能重播的事件識別。
- 批次在 60 秒內只要操作仍有效才發布；認領／接手延後功能尚未掛鉤，必須後續依 V2 實作，不能拿此補貨修正宣稱三類皆完成。
