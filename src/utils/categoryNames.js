import { limitSpaceName } from '../models/space.js'
export const normalizeCategoryName = value => typeof value === 'string' ? value.trim() : ''
export const categoryNameKey = value => normalizeCategoryName(value).toLowerCase()
export function validateCategoryName(value, existingNames) {
  const name = normalizeCategoryName(value)
  if (!name || limitSpaceName(name) !== name) return { ok: false, code: 'INVALID_INPUT', message: '請輸入最多 8 個中文字或 16 個英文字母的分類名稱。' }
  if (existingNames.some(existing => categoryNameKey(existing) === categoryNameKey(name))) {
    return { ok: false, code: 'NAME_TAKEN', message: '已有重複分類名稱' }
  }
  return { ok: true, name }
}
