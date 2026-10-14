// 預計補貨日的可選下限與快速選項（新增用品、設定補貨提醒共用）：最早明天；下週／兩週後／下個月。
import { computed } from 'vue'
import { addDays, addMonths } from '../models/item'

// today：'YYYY-MM-DD' 的 ref 或 computed。
export function useRestockDates(today) {
  const minDate = computed(() => addDays(today.value, 1))
  const quickDates = computed(() => [
    { label: '下週', date: addDays(today.value, 7) },
    { label: '兩週後', date: addDays(today.value, 14) },
    { label: '下個月', date: addMonths(today.value, 1) },
  ])
  return { minDate, quickDates }
}
