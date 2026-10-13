// 空間邀請碼：三個英文字母、連字號、四個數字；不限制已知展示碼。
export function isValidInviteCode(value) {
  return /^[A-Z]{3}-\d{4}$/.test(String(value ?? '').trim().toUpperCase())
}
