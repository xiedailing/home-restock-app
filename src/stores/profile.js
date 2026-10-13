import { reactive, readonly } from 'vue'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'

// 兩個頁面共用個人資料；之後可在此串接帳號 API。
// 頭像是數百 KB 的 data URL，與用品分開存，寫入失敗時不影響用品資料。
const saved = loadPersisted(STORE_KEYS.profile)
const state = reactive({
  name: typeof saved?.name === 'string' && saved.name.trim() ? saved.name : '123',
  email: '123@gmail.com',
  avatar: typeof saved?.avatar === 'string' ? saved.avatar : '',
})
export const profile = readonly(state)

export function updateProfile({ name, avatar }) {
  const trimmedName = name.trim()
  if (!trimmedName || trimmedName.length > 30) {
    throw new Error('請輸入 1～30 個字的顯示名稱。')
  }
  state.name = trimmedName
  state.avatar = avatar
  savePersisted(STORE_KEYS.profile, { name: state.name, avatar: state.avatar })
}
