# 通知與補貨整合修正｜程式審查摘錄

比較基準：`main 8f98034`。來源：`feature/shared-refinements` 本機未提交內容。此文件僅供程式審查，不是可獨立套用的修補檔，也不是可執行分支。

## 審查範圍與修改原因

只列出 `src/stores/items.js` 的 `completeRestock()`、`recordRestockBatch()`、新增的 `runRestockNotification()`，以及 `tests/restock-catalog-link.test.mjs` 的相關差異。排除通知頁、展示資料、認領／接手掛鉤與其他 UI 修改。

原本本機通知整合在補貨紀錄寫入後直接呼叫通知 Store。測試的 `window` 只有 `EventTarget`，沒有 `setInterval`，Store 初始化會拋錯。這代表測試環境缺漏，也暴露「紀錄已更新，但通知例外使操作中斷」的錯誤邊界問題。注意：這個直接呼叫通知的中間版本尚未進入 main；main 本身沒有這項通知初始化錯誤。

## 前後行為

| 項目 | main 基準 | 本機修正後 |
|---|---|---|
| 單筆補貨 | 修改紀錄及購買狀態，沒有共享通知掛鉤 | 原有資料操作完成後，獨立執行發布通知與追蹤完成狀態 |
| 批次補貨 | 依序取得／建立用品並記錄，失敗結果使用既有 undo 回復 | 同樣流程，另收集通知回呼；全部成功後才投遞 |
| 通知例外 | 無這項整合 | 個別捕捉並記錄，仍保留補貨成功結果 |
| 補貨資料例外 | 原有處理 | 不納入通知 catch，不把資料錯誤誤報為通知錯誤 |
| 測試計時器 | EventTarget 無瀏覽器計時器 | 補上 interval API 並清理 Store／計時器 |

## 指定函式差異

以下每段 diff 的行號為該函式摘錄內的相對行號，不是完整檔案行號。未列出的補貨推算函式、紀錄模型及 Catalog 關聯邏輯沒有在本次修正中改寫。

### `completeRestock()`

```diff
--- main/completeRestock
+++ local/completeRestock
@@ -1,5 +1,5 @@
-  function completeRestock(id, { date = toDateString(), quantity = 1 } = {}) {
+  function completeRestock(id, { date = toDateString(), quantity = 1 } = {}, notificationQueue = null) {
     const item = getItem(id)
     if (!item) return
     clearShoppingCompletion(id)
     applyRestockRecords(id, [...item.restockRecords, createRestockRecord({ date, quantity })], {
@@ -7,5 +7,12 @@
       quantity: null,
       addedToShoppingListDate: null,
       snoozedUntil: null,
     })
+    const recordId = item.restockRecords.at(-1).id
+    const deliver = () => {
+      runRestockNotification('publish', item, recordId, () => notifySharedOperation(item, 'restocked'))
+      runRestockNotification('track-completion', item, recordId, () => useSharedNotificationsStore().trackRestockCompletion(id, recordId))
+    }
+    if (notificationQueue) notificationQueue.push(deliver)
+    else deliver()
   }
```

### `runRestockNotification()`

```diff
--- main/runRestockNotification
+++ local/runRestockNotification
@@ -0,0 +1,8 @@
+  function runRestockNotification(operation, item, recordId, deliver) {
+    try { deliver() }
+    catch (error) {
+      console.error('[restock-notification] Notification failed after restock', {
+        operation, itemId: item.id, spaceId: item.spaceId, recordId, error,
+      })
+    }
+  }
```

### `recordRestockBatch()`

```diff
--- main/recordRestockBatch
+++ local/recordRestockBatch
@@ -1,8 +1,9 @@
   function recordRestockBatch(entries, { spaceId, date }) {
     const createdIds = []
     const snapshots = []
     const results = []
+    const notificationQueue = []
     function undo() {
       for (const snapshot of snapshots) restoreItem(snapshot)
       if (createdIds.length) items.value = items.value.filter((item) => !createdIds.includes(item.id))
     }
@@ -15,9 +16,9 @@
       const { item, created } = ensured
       if (created) createdIds.push(item.id)
       else snapshots.push(snapshotItem(item.id))
       const datesBefore = countRecordDates(item.restockRecords)
-      completeRestock(item.id, { date, quantity: entry.quantity })
+      completeRestock(item.id, { date, quantity: entry.quantity }, notificationQueue)
       const datesAfter = countRecordDates(getItem(item.id).restockRecords)
       results.push({
         id: item.id,
         name: item.name,
@@ -26,6 +27,8 @@
         // 第 2 個不同日期：開始推算下次補貨日（FR-907、FR-912）。
         startedInferring: datesBefore === 1 && datesAfter === 2,
       })
     }
+    // 整批成功後才投遞；驗證失敗復原時不留下半批通知。
+    for (const deliver of notificationQueue) deliver()
     return { ok: true, results, undo }
   }
```

### 呼叫順序與介面

- `completeRestock(id, options)` 的既有兩參數用法維持相容。新增第三參數 `notificationQueue = null` 僅供批次流程收集通知回呼。
- 原本 `clearShoppingCompletion()`、`applyRestockRecords()`、`createRestockRecord()` 呼叫與資料內容保留。
- 最新紀錄 ID 在資料操作之後取得；建立一次紀錄後不因通知失敗重試補貨。
- 發布成員通知與追蹤完成狀態使用兩個獨立邊界，一項失敗不阻止另一項。
- `recordRestockBatch()` 遇到 `ensureCatalogItem()` 回傳失敗，仍使用原有 undo 並返回；通知佇列尚未投遞，因此不留下半批通知。
- 成功後回傳的 `results`、`undo` 契約不變；新增與既有用品的復原方式不變。
- 錯誤輸出為 `console.error`，含 operation、itemId、spaceId、recordId、原始 error；不是持久化錯誤佇列或自動重試機制。

## 測試差異

此處是該測試檔相對 main 的完整差異；沒有移除或跳過既有案例。包含計時器模擬／清理、共享成員 fixture、通知故障測試需要的 import，以及五個新增子測試。計時器使用 Node interval 並 unref；每次 fresh 與 finally 均清理。

```diff
diff --git a/tests/restock-catalog-link.test.mjs b/tests/restock-catalog-link.test.mjs
index 37bdc91..89055a2 100644
--- a/tests/restock-catalog-link.test.mjs
+++ b/tests/restock-catalog-link.test.mjs
@@ -10,7 +10,13 @@ test('recordRestockBatch resolves space items by catalogId', async t => {
   const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
   const install = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
   install('localStorage', storage)
-  install('window', new EventTarget())
+  const intervals = new Set()
+  const piniaInstances = []
+  const stopIntervals = () => { for (const timer of intervals) clearInterval(timer); intervals.clear() }
+  install('window', Object.assign(new EventTarget(), {
+    setInterval(fn, delay) { const timer = setInterval(fn, delay); timer.unref(); intervals.add(timer); return timer },
+    clearInterval(timer) { clearInterval(timer); intervals.delete(timer) },
+  }))
   install('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
   setMaxListeners(0, window, document)
   // Store 的延遲存檔計時器不可讓測試程序一直掛著。
@@ -20,6 +26,8 @@ test('recordRestockBatch resolves space items by catalogId', async t => {
   try {
     const { useCatalogStore } = await server.ssrLoadModule('/src/stores/catalog.js')
     const { useItemsStore } = await server.ssrLoadModule('/src/stores/items.js')
+    const { useSharedNotificationsStore } = await server.ssrLoadModule('/src/stores/sharedNotifications.js')
+    const { getNextRestockDate } = await server.ssrLoadModule('/src/models/item.js')
     const { createItem } = await server.ssrLoadModule('/src/models/item.js')
     const { STORAGE_VERSION } = await server.ssrLoadModule('/src/utils/persist.js')
     const encode = data => JSON.stringify({ version: STORAGE_VERSION, data })
@@ -27,12 +35,17 @@ test('recordRestockBatch resolves space items by catalogId', async t => {
     const tissues = createItem({ id: 'p', name: '衛生紙', category: '生活日用品', unit: '包', iconKey: 'tissues', spaceId: 'personal',
       restockRecords: [{ id: 'p-record', date: '2026-01-01', quantity: 2 }] })
     const fresh = () => {
+      for (const pinia of piniaInstances) for (const store of pinia._s.values()) store.$dispose()
+      piniaInstances.length = 0
+      stopIntervals()
       window.dispatchEvent(new Event('pagehide'))
       memory.clear()
-      memory.set(key('items'), encode({ items: [tissues], spaces: [{ id: 'personal', name: '個人', shared: false }, { id: 'family', name: '家庭', shared: true }],
+      memory.set(key('items'), encode({ items: [tissues], spaces: [{ id: 'personal', name: '個人', shared: false }, { id: 'family', name: '家庭', shared: true, members: [{ id: 'member-1', name: '小明' }] }],
         customCategories: [], departedSpaces: [], demoSeeds: ['family-unclaimed-alcohol-v1'] }))
       memory.set(key('catalog'), encode({ catalogItems: [], presetOverrides: {}, deletedCatalogItems: [] }))
-      setActivePinia(createPinia())
+      const pinia = createPinia()
+      piniaInstances.push(pinia)
+      setActivePinia(pinia)
       return { items: useItemsStore(), catalog: useCatalogStore() }
     }
     const date = '2026-10-17'
@@ -91,7 +104,99 @@ test('recordRestockBatch resolves space items by catalogId', async t => {
       assert.equal(items.getItemByCatalogId('personal', 'preset:trash-bags'), null)
       assert.ok(items.getItem('p'))
     })
+    await t.test('single shared restock publishes once and tracks its record', () => {
+      const { items } = fresh()
+      const linked = items.ensureCatalogItem('family', 'preset:tissues').item
+      const notifications = useSharedNotificationsStore()
+      notifications.publishRestockReminder(items.getSpace('family'), [linked])
+      items.completeRestock(linked.id, { date, quantity: 2 })
+      assert.equal(linked.restockRecords.length, 1)
+      const events = notifications.records.filter(entry => entry.type === 'restocked')
+      assert.equal(events.length, 1)
+      assert.ok(!events[0].recipientIds.includes('self'))
+      assert.deepEqual(notifications.records.find(entry => entry.type === 'restock-due').targets[0].completionRecordIds, [linked.restockRecords[0].id])
+    })
+    await t.test('failed shared batch publishes no notifications and restores all items', () => {
+      const { items } = fresh()
+      const notifications = useSharedNotificationsStore()
+      const before = JSON.stringify(items.items)
+      const batch = items.recordRestockBatch([
+        { catalogId: 'preset:tissues', quantity: 1 },
+        { catalogId: 'missing', quantity: 1 },
+      ], { spaceId: 'family', date })
+      assert.equal(batch.ok, false)
+      assert.equal(JSON.stringify(items.items), before)
+      assert.equal(notifications.records.length, 0)
+    })
+    await t.test('successful batch publishes one event per item and undo restores existing records', () => {
+      const { items } = fresh()
+      const item = items.ensureCatalogItem('family', 'preset:tissues').item
+      items.completeRestock(item.id, { date: '2026-01-01', quantity: 2 })
+      const before = JSON.stringify(item.restockRecords)
+      const notifications = useSharedNotificationsStore()
+      const eventCount = notifications.records.filter(entry => entry.type === 'restocked').length
+      const batch = items.recordRestockBatch([
+        { catalogId: 'preset:tissues', quantity: 1 },
+        { catalogId: 'preset:trash-bags', quantity: 1 },
+      ], { spaceId: 'family', date })
+      assert.equal(batch.ok, true)
+      assert.equal(notifications.records.filter(entry => entry.type === 'restocked').length, eventCount + 2)
+      assert.equal(item.restockRecords.length, 2)
+      batch.undo()
+      assert.equal(JSON.stringify(item.restockRecords), before)
+      assert.equal(items.getItemByCatalogId('family', 'preset:trash-bags'), null)
+    })
+    await t.test('restock data errors are not swallowed as notification failures', () => {
+      const { items } = fresh()
+      const item = items.getItem('p')
+      item.restockRecords = null
+      const reported = []
+      const originalError = console.error
+      console.error = (...args) => reported.push(args)
+      try {
+        assert.throws(() => items.completeRestock('p', { date }), TypeError)
+        assert.equal(reported.length, 0)
+        assert.equal(item.restockRecords, null)
+      } finally { console.error = originalError }
+    })
+    await t.test('notification failures cannot interrupt single/batch restock or undo', () => {
+      const { items } = fresh()
+      const notifications = useSharedNotificationsStore()
+      const reported = []
+      const originalError = console.error
+      console.error = (...args) => reported.push(args)
+      notifications.publishMemberEvent = () => { throw new Error('delivery failed') }
+      notifications.trackRestockCompletion = () => { throw new Error('tracking failed') }
+      try {
+        const item = items.getItem('p')
+        const before = JSON.stringify(item.restockRecords)
+        items.completeRestock('p', { date, quantity: 1 })
+        assert.equal(item.restockRecords.length, 2)
+        const expectedNextDate = getNextRestockDate(item, 5)
+        assert.equal(reported.length, 1) // 個人用品不發共享通知；仍追蹤完成狀態。
+        assert.equal(reported[0][1].recordId, item.restockRecords[1].id)
+        assert.equal(reported[0][1].error.message, 'tracking failed')
+        const batch = items.recordRestockBatch([
+          { catalogId: 'preset:tissues', quantity: 1 },
+          { catalogId: 'preset:trash-bags', quantity: 2 },
+        ], { spaceId: 'family', date })
+        assert.equal(batch.ok, true)
+        assert.equal(batch.results.length, 2)
+        for (const result of batch.results) assert.equal(items.getItem(result.id).restockRecords.length, 1)
+        assert.equal(reported.length, 5)
+        assert.equal(getNextRestockDate(item, 5), expectedNextDate)
+        batch.undo()
+        assert.equal(items.getItemByCatalogId('family', 'preset:tissues'), null)
+        assert.equal(items.getItemByCatalogId('family', 'preset:trash-bags'), null)
+        assert.equal(item.restockRecords.length, 2)
+        assert.notEqual(JSON.stringify(item.restockRecords), before)
+        assert.equal(new Set(item.restockRecords.map(record => record.id)).size, 2)
+      } finally { console.error = originalError }
+    })
+
   } finally {
+    for (const pinia of piniaInstances) for (const store of pinia._s.values()) store.$dispose()
+    stopIntervals()
     await server.close()
     globalThis.setTimeout = originalSetTimeout
     for (const [name, descriptor] of originals) {
```

### 驗證內容與既有結果

上次在完整本機工作區執行 `node --test --test-concurrency=1 tests/*.test.mjs`：66 項通過、0 失敗；`npm run build` 通過。這是含未提交通知依賴的完整工作區結果，不能解讀為只套用本文件即可通過。

新增測試涵蓋：

1. 單筆共享補貨只發一次通知，排除操作者，追蹤實際紀錄 ID。
2. 批次後段缺少 Catalog 用品時完整回復，且沒有通知。
3. 成功批次每項通知一次，手動復原保留原有紀錄並移除新建空間用品。
4. 補貨資料錯誤仍拋出，不被通知邊界吞掉。
5. 發布與追蹤通知均拋錯時，單筆與批次仍完成；記錄可追查、紀錄不重複、undo 正常。

推算測試確認通知故障的家庭批次不會改變原個人用品的推算結果；本次未加入獨立的全套日期公式正確性證明，推算公式本身未修改。

## 尚未進入 main 的必要依賴

| 依賴 | 原因 |
|---|---|
| `useSharedNotificationsStore` import（items.js） | 本文指定函式直接呼叫 Store，但此 import 未在 main |
| `notifySharedOperation()`（items.js） | 本文未擷取的既有本機通知橋接函式；取得共享空間、操作者與成員後呼叫 publishMemberEvent，個人空間不發布成員通知 |
| `src/stores/sharedNotifications.js` | 提供 publishMemberEvent、trackRestockCompletion、publishRestockReminder、records；包含通知計時器與其他未完成功能，本文件不收錄其實作 |
| `src/utils/notificationCopy.js` | 通知 Store 的文案依賴 |
| `src/utils/notificationRetention.js` | 通知 Store 的過期清理依賴 |
| `STORE_KEYS.sharedNotifications`（persist.js） | 通知存檔 key；未加入時不得直接執行整合版 |

本文件故意未打包上述通知功能。僅將三個函式或測試套至 main，會缺少上述依賴；不可當成可獨立合併、執行的變更。

## 預期影響與仍需組員確認的風險

- 資料與推算：不改日期計算、Catalog ID、紀錄 ID、數量或存檔版本；只延後通知與隔離通知例外。
- 同步通知延後：批次完成後才發布，請確認組員沒有依賴「每完成一筆立即發送」的其他功能。
- 通知不保證整體原子性：發布成功、追蹤失敗時會保留部分通知結果；有錯誤記錄，但沒有自動重試或回滾通知。
- 使用者 undo：補貨資料可復原，但已發布的成員通知不撤回；舊提醒的 completionRecordIds 也可能保留已移除紀錄 ID，現有判斷會再檢查紀錄是否存在。是否撤回通知須另定規則。
- 原有批次範圍：現有 undo 處理的是 ensureCatalogItem 回傳失敗；若真正資料處理函式意外拋錯，既有批次沒有完整的通用例外回復。本次不擴大修改這段業務邏輯，不能宣稱所有資料例外都具原子性。
- 其他通知入口：認領、接手的既有本機通知呼叫不在本次修正範圍，尚未套用此補貨專用錯誤邊界。
- 錯誤追查：目前只輸出 Console；重新整理後不保證保留日誌。
- 實機：上述結果為自動測試與建置，不代表已完成 iPhone 實測或跨裝置通知同步。

## 本文件產製安全

僅新增此 Markdown；不改任何程式碼、不建立分支、不執行 Commit／Push／Merge／PR，不修改或刪除 stash。原工作區的其他未提交內容維持原狀。
