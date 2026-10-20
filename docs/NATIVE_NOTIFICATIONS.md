# 瀏覽器原生系統通知

分支：`feature/native-browser-notifications`。沿用此分支提交與上傳，不合併 main。

## 能做到與不能做到

- 使用瀏覽器原生 Notifications API，在分頁仍執行時，可在切到其他網站後交給作業系統顯示延後提醒。
- 優先使用 Service Worker `showNotification()`，桌面瀏覽器可降級使用 `new Notification()`。Service Worker 只處理既有通知的點擊，不負責背景計時，沒有快取或離線攔截。
- **關閉所有補補分頁後，無法靠 Notifications API 或 Service Worker 計時準時建立新通知。** 真正關閉後的背景通知需要後端排程、Push API 訂閱與 Web Push 發送服務，本次未新增後端、VAPID 金鑰或訂閱功能。
- 分頁在背景時也可能受節流、節能、記憶體回收影響；電腦休眠／瀏覽器完全退出時不保證 08:00 或 10 秒準時執行。
- 重新開啟或恢復前景時，依保存的日期與任務重新驗證，過期且仍有效的排程會處理一次。
- 瀏覽器接受通知請求，不等於已證實作業系統顯示橫幅。專注／勿擾、通知樣式及瀏覽器政策可阻止可見顯示；UI 不宣稱「使用者已收到」。

## 使用方式

1. 從目前工作區執行 `npm run dev`，開啟 Vite 顯示的網址（目前使用 5200）。正式部署需 HTTPS；localhost 為可測試的安全來源，一般 HTTP 區網 IP 不保證可用。
2. 設定 → 提醒設定，或購買清單儲存延後提醒後，主動點擊「開啟系統通知」。只有使用者點擊此授權入口才會呼叫 `Notification.requestPermission()`，啟動 App、登入、排程及計時器不請求權限。
3. 允許通知且「推播通知」設定開啟，才會交付系統通知。拒絕或不支援時有明確提示，不顯示假成功。
4. 在購買清單設定單項「延後提醒」，原本的 `reminderSnoozes.self` 日期保留。新增個人 operation ID 區分取消後重新設定相同日期。
5. 使用**裝置當地時間 08:00**。這是本分支的排程選擇，尚未做帳號時區或跨裝置時區服務；旅行切換時區時以裝置當時設定為準。
6. 提醒到期後先儲存站內事件，再嘗試系統通知；不更動單筆 seen/read 或鈴鐺判斷，也不改補貨公式、單位週期及購買狀態。
7. 點擊系統通知：聚焦已開啟的補補，進入對應用品；沒有補補分頁時開啟對應網址。用品不存在時顯示既有找不到用品流程／提示。

## 期末展示（明確啟用，支援 Vercel Preview）

- 預設關閉，與 `import.meta.env.DEV` 無關。僅在需要展示的環境設定 **`VITE_NOTIFICATION_DEMO=true`**。
- 本機：`VITE_NOTIFICATION_DEMO=true npm run dev`；驗證正式產物：`VITE_NOTIFICATION_DEMO=true npm run build` 後 `npm run preview`。
- Vercel：Project Settings → Environment Variables，新增 `VITE_NOTIFICATION_DEMO`，值 `true`，只勾選 Preview（可限定本分支），然後重新部署本分支。此旗標為建置時的公開 UI 開關，不是權限或秘密；Production 不設定即可關閉。
- 購買清單 → 展開待買用品 → 延後提醒 → 選日期 → 儲存。原本日期先正常提交成功，再顯示通知授權狀態與「Demo：10 秒後測試通知」。測試自動綁定這張卡片的用品與空間，不需選單。
- 不允許通知仍可儲存日期、按完成離開。允許後不再顯示授權按鈕；拒絕時提供網站設定提示。推播開關關閉時測試會提示未安排。
- 點測試後可切到其他網站，但須保留補補分頁；等候時可點「取消測試通知」。關閉 sheet 或重整後，可重新開啟該用品的延後提醒，查看並取消待發送測試，無需再次儲存日期。
- 10 秒任務與正式日期分開保存。補貨、刪除、移除、關閉用品提醒、取消或修改正式延後設定，會使待發送的舊測試失效。
- 多分頁與重複點擊沿用 Web Locks；全站一次最多一個待發送 Demo。重整保留同一任務，已嘗試／已發送的任務不自動重送。測試結束後可主動建立另一個獨立測試。
- 沒有展示旗標的建置不顯示入口、拒絕建立 Demo，且取消殘留待發送 Demo；正式延後排程不受影響。
- 提醒設定頁不再包含 Demo、用品選單或技術說明，原推播開關、補貨提醒、尚未購買提醒保留。

## Demo 資格與操作提示

- UI 與鎖內排程共用 `notificationDemoEligibility`：用品存在、空間可存取、仍在清單、尚未補貨、用品提醒開啟、正式延後日期已儲存，才可繼續檢查權限、推播開關與排程鎖。資格判斷不修改用品。
- 關閉用品提醒時顯示「請先至此用品的補貨明細開啟『補貨提醒』，再進行測試」，不自動開啟。日期尚未儲存時提示先儲存。
- 其他用品有待發送 Demo 時顯示名稱與取消入口；取消只影響舊 Demo，不取消任何正式日期。重複排程仍由 Web Locks 與持久化任務檢查阻擋。
- Demo 回饋依用品 ID 保存，切換／重新開啟用品時清除該次舊回饋；授權元件不顯示用品 Demo 錯誤，因此同一則錯誤不重複。

人工驗收（啟用展示旗標後）：

1. 使用「家庭／酒精」或手動關閉用品補貨提醒，開啟延後提醒。確認測試停用且提示先開啟用品提醒；儲存日期後仍不會自動改開關。
2. 使用另一個已開啟提醒、尚未設定延後的待買用品。確認先提示儲存日期；儲存並允許通知、開啟推播後，按鈕可用。
3. 替用品 A 安排 Demo，立即開啟用品 B。確認 B 顯示 A 的名稱及取消入口，不顯示 A 先前的成功／錯誤訊息；B 日期尚未儲存時也有明確提示。
4. 在 B 取消 A 的測試。確認 A 不發送、兩個正式日期不變；B 符合資格時可建立自己的測試。
5. 切換其他分頁，確認約 10 秒後收到一次系統通知，點擊回到 B；重整不重送。實際 OS 橫幅需在 Windows Chrome、macOS Chrome／Safari 人工驗收。
6. 另測拒絕權限、推播關閉、取消延後、補貨、刪除或移除；確認資格提示正確、過期測試失效，正式資料與既有去重仍保留。

## 資料安全與事件整合

- `native-notifications` localStorage key：保存排程、來源指紋、操作 ID、狀態與失敗原因。保存失敗時不投遞。
- 指紋包含空間、單位週期、加入清單日期、補貨紀錄。補貨／紀錄變更、移除／刪除、取消延後、操作身份變更時重新驗證並取消舊任務；單純改名稱不取消。
- 在原 sharedNotifications Store 透過 `publishScheduledSnooze` 建立事件，事件鍵為 `scheduled-snooze:{taskId}:self`，沿用 `commit`、processedEventIds 與接收者 seen/read，舊正式通知不清空。
- 一般補貨預測通知不再搶先於午夜建立同一個個人延後事件。已失效舊延後設定不應阻擋新補貨週期的一般提醒。
- 多分頁使用 Web Locks，同一來源每次只有一個頁面可處理原生通知。缺少 Web Locks 的瀏覽器明確停用此排程，不以不可靠的 localStorage 鎖假裝保證去重。
- 系統通知與 localStorage 無法原子提交。採**至多一次投遞嘗試**：先保存 attempted，再呼叫 API；程序在兩者間中斷可能漏掉系統通知。恢復後不自動重送，避免重複，並提示結果不確定；已保存的站內通知仍可查看。
- API 失敗保留 failed，不自動無限重試。可用新的 Demo 測試排查，或重新設定正式延後日期建立新操作。不可將 failed 當成已成功交付。
- 原生系統通知只針對操作者本人的延後提醒；認領／接手／已補貨的 60 秒規則不變。
- 未新增「一般未購買提醒」與延後提醒合併流程；該需求仍依通知 V2 文件列為待實作，不以本功能冒充完成。
- 仍是 localStorage 本機展示模型（self），沒有跨帳號、跨裝置同步。

## 手動測試矩陣

| 平台 | 測試方式與限制 |
|---|---|
| Windows Chrome | 最新版 Chrome，以 localhost／HTTPS 開啟，網站允許通知；Windows 設定 → 系統 → 通知，確認 Chrome 可通知、勿擾關閉。安排 10 秒 Demo，切分頁，確認系統通知及點擊返回。未在實體 Windows 驗證，需組員執行。 |
| macOS Chrome | Chrome 網站設定允許通知；macOS 系統設定 → 通知，確認 Chrome 可通知、橫幅與專注模式。安排 Demo、切分頁、點擊返回，並測取消／補貨與重整不重複。自動化 Chromium 搭配隔離 API 替身驗證互動與排程，但不代表真實 macOS 橫幅驗收。 |
| macOS Safari | 使用支援標準 Notifications API 的 Safari、安全來源，必須由按鈕直接取得權限；設定網站通知及系統通知。優先測 Service Worker，必要時走 Notification constructor。若政策拒絕會顯示錯誤，不能假裝可送。Safari 節能與背景停用會延遲；實體 Safari 待驗收。 |
| iPhone／iPad | 一般瀏覽器分頁不保證可用。iOS／iPadOS 16.4 起的 Web Push 需加入主畫面的 Web App；本次沒有 Web Push 後端，因此不承諾切換手機 App／關閉後仍能收到。 |

每個實體平台至少測：允許、拒絕、推播關閉、10 秒切分頁、點擊返回、補貨／移除／取消、兩分頁同時開啟、重整、休眠恢復、儲存失敗。測試前先確認權限，不能藉測試程式替使用者更改作業系統設定。

## 來源

- [MDN：Using the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)
- [MDN：Notification constructor（手機限制）](https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification)
- [WebKit：iOS／iPadOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Chrome：背景分頁計時器限制](https://developer.chrome.com/blog/background_tabs)

## 本分支驗證結果

- 完整 `node --test tests/*.test.mjs`：229 項通過、0 失敗。
- `npm run build`（預設關閉展示）與 `VITE_NOTIFICATION_DEMO=true npm run build`、`git diff --check` 通過。
- 自動化 Chromium（隔離通知 API 替身）：設定頁三項控制保留且無選單；用品儲存後的 10 秒 Demo 可取消、在另一分頁使用中執行一次、通知點擊訊息返回對應用品、正式用品日期不變、重整後沒有再次投遞。拒絕授權仍保存延後日期；手機尺寸下不支援時顯示短提示。版面以桌機與 390px 截圖檢查。
- 正式建置以旗標控制 Demo；啟用的 Preview 產物可執行用品流程，未啟用時入口隱藏。設定頁無用品選單。
- 單元／整合測試涵蓋權限、偏好、08:00 前後、修改／取消、補貨／移除／刪除、跨分頁過時資料、儲存失敗、交付失敗、程序中斷 reservation、worker 聚焦／新開視窗／外站網址拒絕，以及未明確啟用時禁止 Demo、獨立取消與重整保留同一任務。
- 尚未以實體 Windows Chrome、macOS Chrome 或 Safari 驗收 OS 橫幅；不把 API 替身或無頭瀏覽器測試當成作業系統通知已實測。
