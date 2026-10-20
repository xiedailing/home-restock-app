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
7. 點擊系統通知：聚焦已開啟的補補，進入購買清單並展開、捲動定位對應用品卡片；沒有補補分頁時開啟相同的購買清單網址。用品失效時顯示簡短提示，不展開其他用品。

## 期末展示（指定 Preview ＋展示連結＋點擊）

- 唯一允許 origin：`https://home-restock-app-git-feature-native-browser-n-f5352f-xiedailing.vercel.app`，精確比對協定、網域與連接埠，不使用萬用字元。
- 明確禁止正式站 `https://home-restock-app.vercel.app`；其他未知網址及 localhost 同樣不可啟用 Demo。
- 展示連結：<https://home-restock-app-git-feature-native-browser-n-f5352f-xiedailing.vercel.app/shopping?notificationDemo=1>。先點「啟用通知展示模式」，再操作用品延後提醒。連結本身不會自動授權、排程或啟用展示。
- 不需新增 Vercel Environment Variables。`VITE_NOTIFICATION_DEMO` 不再控制啟用，設為 true 也不能繞過網址限制。一般與帶舊 Demo 環境變數的建置都遵守相同規則。
- 模式集中於 App 存續的 nativeNotifications Store。啟用後，Vue Router 導覽至設定、用品明細等頁面不會失效；`sessionStorage` 保存當前分頁的展示工作階段 ID，重新整理可恢復。
- 全頁重新開啟連結（包含可能繼承 opener sessionStorage 的新分頁）需重新點擊；正常站內 SPA 導覽及重新整理不受影響。儲存失敗時拒絕啟用並顯示錯誤。
- 購買清單 → 展開待買用品 → 延後提醒 → 選日期 → 儲存。日期正常提交後自動安排獨立的 10 秒 Demo，無需額外按鈕；sheet 隨即關閉，正式延後日期不變。未啟用展示時只儲存日期。
- 通知權限仍需另外主動點擊取得，且推播設定須開啟；拒絕通知不影響延後日期儲存。展示模式不替使用者更改提醒設定。
- Demo 任務保存 `demoSessionId`，只有啟用相符工作階段的分頁可以嘗試發送；其他分頁不代送，也不因自身未啟用而取消來源仍有效的任務。所有分頁仍可依法驗證用品補貨、刪除、移除、提醒關閉或取消延後而使任務失效。
- 多分頁與重複點擊沿用 Web Locks；一次最多一個待發送 Demo。重整保留同一任務，已嘗試／已發送任務不重送。沒有工作階段 ID 的舊版 Demo 任務作廢，正式任務不受影響。
- 啟用後不顯示常駐浮動控制，sheet 只保留原標題、說明、日期、儲存與依條件顯示的取消延後。操作者可至「設定 → 提醒設定 → 展示控制」取消指定待發送測試，或「結束展示並取消待發送測試」；不影響正式日期或其他工作階段。
- 分頁需保持開啟，可切到其他網站。工作階段所屬分頁關閉後，不承諾發送；若另一個啟用展示的分頁看到舊任務，可由提醒設定的「展示控制」取消，再重新儲存日期以建立測試。
- 提醒設定頁保留原推播開關、補貨提醒、尚未購買提醒，沒有 Demo 用品選單或技術說明。

### Preview 網址確認

提供網址符合 Vercel 的 `<project>-git-<branch>-<scope>.vercel.app` 分支 alias 格式，長名稱包含截短部分。依 [Vercel 官方文件](https://vercel.com/docs/deployments/generated-urls)，分支網址會隨新提交更新，單次部署網址則綁定特定版本。本次未取得 Vercel 後台存取，無法直接查詢 alias 綁定；請在該分支最新 Deployment 的 Domains 核對此 alias。固定 alias 若被重新指派，需重新確認用途；未知網域不會自動擴大白名單。

## 自動 Demo 與失敗提示

- 正式延後日期先透過原 store 交易式儲存，成功後才呼叫原 Demo 排程。`saveSnoozeAndScheduleDemo` 合併同用品／日期的進行中請求，sheet 也同步鎖住儲存按鈕直到關閉。
- 仍由 `notificationDemoEligibility` 檢查用品存在、空間可存取、仍在清單、尚未補貨、用品提醒開啟、日期已儲存、通知已允許、推播設定與 Web Locks。
- 儲存日期不自動開啟用品提醒，也不要求先允許通知。Demo 無法安排時只以 Toast 說明「日期已儲存；原因」，不宣稱通知安排成功。
- 其他用品有待發送任務時保留原任務，不覆蓋；Toast 顯示等待中的用品名稱。操作者可從提醒設定折疊的「展示控制」取消，再重新儲存。
- 同一操作不重複建立；刻意重新開啟並修改／重新儲存延後日期會建立新的正式操作，原等待中的 Demo 失效，再依資格安排新 Demo。
- 已交給瀏覽器的通知不能保證收回；交付失敗以既有 Toast 提示，保留任務狀態，不自動重送。

## 系統通知點擊與購買清單定位

- 目標 URL：`/shopping?tab=personal|shared&space=<共享空間ID>&notificationItem=<用品ID>&notificationSpace=<原空間ID>`，不依名稱尋找。
- 原生 constructor 點擊與 worker message 共用解析／路由規則；每次站內點擊加上新的 `notificationRequest`，同一通知連點也會重新定位。
- `ShoppingView` 驗證用品與原空間後，選擇個人或共享清單及空間，只展開該 ID 卡片。等待 Vue 渲染與既有展開動畫後，捲動至卡片頂端 24px，保留手機下方導覽的捲動空間；不開啟延後 sheet。
- 完成處理即清除 `notificationItem`、`notificationSpace`、`notificationRequest`，保留一般 tab／space 篩選，不干擾後續操作。Router 僅對這次 query 消費避免重置捲動。
- 已補貨者切到對應清單並提示無法展開；移除、刪除、空間消失／無存取權者顯示提示，不展開其他用品，失效共享空間不退回顯示其他空間內容。
- worker 維持同來源與 scope 檢查，只接受通知購買清單路徑及舊版用品路徑。舊版已送出通知若經現有分頁接收，會轉成購買清單定位；不接受外部任意網址。
- 已開分頁由 worker 聚焦並傳訊；沒有分頁時開啟同一購買清單深連結。通知中心的紀錄、已讀與來源事件不修改。

## Safari／Chrome 人工驗收

1. Windows Chrome、macOS Chrome 或 macOS Safari 開啟指定展示連結，點「啟用通知展示模式」。確認浮動控制消失。
2. 至設定允許系統通知、開啟推播；另確認作業系統允許該瀏覽器通知，勿擾／專注模式關閉。
3. 使用尚未補貨且開啟用品補貨提醒的用品，延後日期選明天或之後，按儲存。確認 sheet 關閉、正式日期正確，沒有額外 Demo 按鈕。
4. 切到另一網站，保留補補分頁，約 10 秒後確認原生系統通知。點擊應聚焦補補、進入正確清單、共享空間正確、僅目標 ID 卡片展開並捲動到可見位置。
5. 用不同空間的同名用品重測；折疊卡片後再次點同一通知，仍正確定位。另測原分頁不存在時點通知開啟購買清單深連結。
6. 連續點儲存、重整、兩分頁並存均不得重送；第二用品儲存時若原任務等待中，確認原任務保留、第二用品日期仍儲存且有簡短提示。
7. 等待中補貨／刪除／移除／取消延後／改日期，確認舊任務失效。已送出通知點擊時再測已補貨、已移除、刪除及退出空間，應提示且不展開其他卡片。
8. 安排測試後進入設定 → 提醒設定 → 展示控制，分別驗證取消單筆、結束展示；正式日期不變。關閉展示後再儲存，不得安排 10 秒 Demo。
9. 拒絕通知、關閉推播或關閉用品補貨提醒後儲存，日期仍正常儲存，Toast 說明未安排原因，不自動更改設定。

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

- 完整 `node --test tests/*.test.mjs`：238 項通過、0 失敗。
- `npm run build`（不需展示環境變數）與 `VITE_NOTIFICATION_DEMO=true npm run build`、`git diff --check` 通過。
- 自動化 Chromium（將本機正式產物映射至指定 origin，隔離通知 API 替身，非線上部署驗收）：儲存後自動排程、連續儲存去重、簡潔 sheet、其他用品任務保留、背景發送一次、個人／共享同名用品依 ID 定位、重複點擊、冷啟動深連結、390px 手機捲動、失效用品／空間提示、設定折疊取消／結束展示、正式日期保留與重整不重送。
- 正式建置在指定 origin、展示連結與明確點擊後才啟用；Production 與未知 origin 即使帶舊儲存資料／環境變數也拒絕啟用。設定頁無用品選單。
- 單元／整合測試涵蓋權限、偏好、08:00 前後、修改／取消、補貨／移除／刪除、跨分頁過時資料、儲存失敗、交付失敗、程序中斷 reservation、worker 聚焦／新開視窗／外站網址拒絕，以及精確 origin、連結與點擊、儲存失敗、跨頁／重整保留、未啟用分頁不誤取消、結束展示與獨立取消。
- 尚未以實體 Windows Chrome、macOS Chrome 或 Safari 驗收 OS 橫幅；不把 API 替身或無頭瀏覽器測試當成作業系統通知已實測。

### 重跑隔離瀏覽器驗收

可重跑 `tests/browser/native-shopping-flow.mjs`。此腳本需另備 Playwright 與 Chromium，未新增專案套件依賴；請先 `npm run build`，另開終端執行 `npm run preview -- --host 127.0.0.1 --port 5210 --strictPort`。若 Playwright 不在專案模組搜尋路徑，設定 `PLAYWRIGHT_MODULE` 為其入口絕對路徑再執行 `node tests/browser/native-shopping-flow.mjs`；可用 `BUBU_PREVIEW_URL` 指定其他本機 Preview URL。

腳本使用全新隔離 context、自備資料與 Notification／Service Worker API Mock，將本機產物映射到指定 Preview origin，不存取使用者本機資料，也不修改線上部署。此驗收不代表已驗證實際作業系統橫幅。
