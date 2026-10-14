import { reactive, readonly } from 'vue'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'

// 兩個頁面共用個人資料；之後可在此串接帳號 API。
// 頭像是數百 KB 的 data URL，與用品分開存，寫入失敗時不影響用品資料。
const saved = loadPersisted(STORE_KEYS.profile)
const state = reactive({
  name: typeof saved?.name === 'string' && saved.name.trim() ? saved.name : 'bubu1028',
  email: typeof saved?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(saved.email.trim()) ? saved.email.trim().toLowerCase() : 'bubu1028@gmail.com',
  avatar: typeof saved?.avatar === 'string' ? saved.avatar : '',
})
export const profile = readonly(state)

// 展示版登入完成後與現有個人檔案共用資料；不代表後端身分驗證。
export function completeDemoLogin({ email, name, avatar }) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('請輸入正確的 Email 格式。')
  updateProfile({ name, avatar })
  state.email = normalizedEmail
  persistProfile()
}

function persistProfile() {
  savePersisted(STORE_KEYS.profile, { name: state.name, email: state.email, avatar: state.avatar })
}

export function updateProfile({ name, avatar }) {
  const trimmedName = name.trim()
  if (!trimmedName || trimmedName.length > 30) {
    throw new Error('請輸入 1～30 個字的顯示名稱。')
  }
  state.name = trimmedName
  state.avatar = avatar
  persistProfile()
}
