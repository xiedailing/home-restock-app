// 僅管理可選單位，不更新 Catalog、空間用品或補貨紀錄。
import { ref, readonly } from 'vue'
import { defineStore } from 'pinia'
import { UNITS } from '../models/item'
import { loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist'
const normalized = value => typeof value === 'string' ? value.trim() : ''
const comparable = value => normalized(value).toLowerCase()
const valid = value => !!value && Array.from(value).length <= 4
export const useUnitOptionsStore = defineStore('unit-options', () => {
  const saved = loadPersisted(STORE_KEYS.unitOptions)
  const customUnits = ref([...new Set((Array.isArray(saved?.customUnits) ? saved.customUnits : [])
    .map(normalized).filter(value => valid(value) && !UNITS.includes(value)))])
  function commit(next) {
    if (!savePersisted(STORE_KEYS.unitOptions, { customUnits: next })) return { ok: false, message: '無法儲存自訂單位，請稍後再試。' }
    customUnits.value = next
    return { ok: true }
  }
  function isNameTaken(input) {
    const name = comparable(input)
    return !!name && [...UNITS, ...customUnits.value].some(value => comparable(value) === name)
  }
  function addUnit(input) {
    const value = normalized(input)
    if (!valid(value)) return { ok: false, message: '請輸入 1～4 個字的單位。' }
    if (isNameTaken(value)) return { ok: false, message: '此單位已經存在' }
    const result = commit([...customUnits.value, value])
    return result.ok ? { ok: true, value } : result
  }
  function removeUnit(input) {
    const value = normalized(input)
    if (!customUnits.value.includes(value)) return { ok: false, message: '找不到此自訂單位。' }
    const index = customUnits.value.indexOf(value)
    const result = commit(customUnits.value.filter(unit => unit !== value))
    if (!result.ok) return result
    let restored = false
    function undo() {
      if (restored) return { ok: false, message: '此單位已復原。' }
      if (isNameTaken(value)) return { ok: false, code: 'NAME_TAKEN', message: '已有相同名稱的單位，無法復原。' }
      const next = [...customUnits.value]
      next.splice(Math.min(index, next.length), 0, value)
      const result = commit(next)
      if (result.ok) restored = true
      return result
    }
    return { ok: true, undo }
  }
  return { customUnits: readonly(customUnits), isNameTaken, addUnit, removeUnit }
})
