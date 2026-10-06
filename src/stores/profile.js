import { reactive, readonly } from 'vue'

// 兩個頁面共用個人資料；之後可在此串接帳號 API。
const state = reactive({ name: '123', email: '123@gmail.com', avatar: '' })
export const profile = readonly(state)

export function updateProfile({ name, avatar }) {
  const trimmedName = name.trim()
  if (!trimmedName || trimmedName.length > 30) {
    throw new Error('請輸入 1～30 個字的顯示名稱。')
  }
  state.name = trimmedName
  state.avatar = avatar
}
