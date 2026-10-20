import { createPresentationState, PRESENTATION_PRESET_OVERRIDES } from '../models/item.js'
import { DEMO_SESSION_KEY } from './notificationDemoMode.js'
import { PRESENTATION_BACKUP, commitPresentationTransaction, presentationSnapshot, recoverPresentationTransaction } from './presentationTransaction.js'
import { withPresentationExclusive } from './presentationAccess.js'
const encode = data => JSON.stringify({ version: 2, data })
export const emptyPresentationNotifications = () => ({
  'native-notifications': encode({ tasks: [] }),
  'shared-notifications': encode({ records: [], pendingBatches: [], processedEventIds: [], previewHistorySeeded: true }),
})
export function newPresentationSnapshot(today) {
  return { items: encode(createPresentationState(today)),
    catalog: encode({ catalogItems: [], presetOverrides: PRESENTATION_PRESET_OVERRIDES, deletedCategories: [], deletedCatalogItems: [] }),
    ...emptyPresentationNotifications(), 'catalog-integration': null }
}
export async function applyPresentationSetup({ restore = false, confirmed = false, expectedSnapshot } = {}, env = globalThis) {
  if (!confirmed) throw new Error('請先確認已備份並關閉其他分頁。')
  return withPresentationExclusive(async () => {
    // Same lock order as native Demo scheduling. No Pinia stores are mounted here.
    return env.navigator.locks.request('bubu-native-reminders', () => env.navigator.locks.request('bubu-items-write', async () => {
      recoverPresentationTransaction(env.localStorage)
      if (!expectedSnapshot || JSON.stringify(presentationSnapshot(env.localStorage)) !== JSON.stringify(expectedSnapshot)) throw new Error('資料已更新，請重新下載備份並確認。')
      let after
      if (restore) {
        const backup = JSON.parse(env.localStorage.getItem(PRESENTATION_BACKUP))
        if (backup?.version !== 1 || !backup.before) throw new Error('沒有可還原的備份。')
        after = { ...backup.before, ...emptyPresentationNotifications() }
      } else after = newPresentationSnapshot()
      commitPresentationTransaction(env.localStorage, after)
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
