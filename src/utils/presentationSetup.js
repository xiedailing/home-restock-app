import { presentationNotifications } from './presentationNotifications.js'
import { createPresentationState, PRESENTATION_PRESET_OVERRIDES, REMIND_WITHIN_DAYS } from '../models/item.js'
import { DEMO_SESSION_KEY } from './notificationDemoMode.js'
import { PRESENTATION_BACKUP, commitPresentationTransaction, presentationSnapshot, recoverPresentationTransaction } from './presentationTransaction.js'
import { withPresentationExclusive } from './presentationAccess.js'
const encode = data => JSON.stringify({ version: 2, data })
export const emptyPresentationNotifications = () => ({
  'native-notifications': encode({ tasks: [] }),
  'shared-notifications': encode({ records: [], pendingBatches: [], processedEventIds: [], previewHistorySeeded: true }),
})
export function newPresentationSnapshot(today) {
  const state = createPresentationState(today)
  return { items: encode(state),
    profile: encode({ name: 'bubu1028', email: 'bubu1028@gmail.com', avatar: '' }),
    notifications: encode({ pushEnabled: true, restockDays: REMIND_WITHIN_DAYS }),
    catalog: encode({ catalogItems: [], presetOverrides: PRESENTATION_PRESET_OVERRIDES, deletedCategories: [], deletedCatalogItems: [] }),
    ...emptyPresentationNotifications(), 'shared-notifications': encode(presentationNotifications(state)), 'catalog-integration': null }
}
export async function applyPresentationSetup({ restore = false, confirmed = false, expectedSnapshot } = {}, env = globalThis) {
  if (!confirmed) throw new Error('請先確認要替換展示資料。')
  return withPresentationExclusive(async () => {
    // Same lock order as native Demo scheduling. No Pinia stores are mounted here.
    const available = (name, operation) => env.navigator.locks.request(name, { ifAvailable: true }, lock => {
      if (!lock) throw new Error('無法安全取得展示重置所需的鎖，請稍後再試。')
      return operation()
    })
    return available('bubu-native-reminders', () => available('bubu-items-write', async () => {
      recoverPresentationTransaction(env.localStorage)
      if (!expectedSnapshot || JSON.stringify(presentationSnapshot(env.localStorage)) !== JSON.stringify(expectedSnapshot)) throw new Error('資料已更新，請重新按下操作按鈕並確認。')
      let after
      if (restore) {
        const backup = JSON.parse(env.localStorage.getItem(PRESENTATION_BACKUP))
        if (backup?.version !== 1 || !backup.before) throw new Error('沒有可還原的備份。')
        after = { ...backup.before, ...emptyPresentationNotifications() }
      } else after = newPresentationSnapshot()
      try { commitPresentationTransaction(env.localStorage, after) }
      catch (error) { throw new Error('無法完成自動備份或重置，請確認儲存空間後重試：' + error.message) }
      try { env.sessionStorage.removeItem(DEMO_SESSION_KEY) } catch { /* Full navigation below still requires a new explicit activation. */ }
      // 已交給作業系統的通知不能撤回交付；盡力關閉本 App 已顯示的舊橫幅。
      try {
        const registration = await env.navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL)
        for (const notification of await registration?.getNotifications() || []) notification.close()
      } catch { /* old click URLs are safe because new items have fresh IDs */ }
      return { ok: true }
    }))
  }, env)
}
export function exportPresentationBackup(storage) {
  recoverPresentationTransaction(storage)
  return JSON.stringify({ version: 1, createdAt: new Date().toISOString(), before: presentationSnapshot(storage) }, null, 2)
}
