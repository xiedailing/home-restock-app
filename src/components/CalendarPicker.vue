<script setup>
// 月曆（Figma Soft Date Picker Sheet 1204:10901 的月曆本體）：月份切換＋日期格子。
// minDate 以前、maxDate 以後的日期不可選。點日期只 emit update:modelValue，確認與關閉由父層決定：
// DatePickerSheet 按「完成」才套用；補貨頁日期條的展開日曆點了就套用（specs/009 FR-906）。
// active：父層重新顯示時改成 true，月份會回到目前的值（Sheet 一直存在，只是開關）。
import { computed, ref, watch } from 'vue'
import { toDateString } from '../models/item'
import monthPrevIcon from '../assets/add-item/month-prev.svg'
import monthNextIcon from '../assets/add-item/month-next.svg'

const props = defineProps({
  modelValue: { type: String, default: null },
  minDate: { type: String, default: null },
  maxDate: { type: String, default: null },
  active: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue'])

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const root = ref(null)
const viewYear = ref(0)
const viewMonth = ref(0) // 0-based
const today = ref(toDateString())

// flush: 'post'：等父層同一輪更新 modelValue 之後再讀，月份才不會停在上一次的值。
watch(() => props.active, (active) => {
  if (!active) return
  today.value = toDateString()
  const [y, m] = (props.modelValue ?? props.minDate ?? props.maxDate ?? today.value).split('-').map(Number)
  viewYear.value = y
  viewMonth.value = m - 1
}, { immediate: true, flush: 'post' })

const monthLabel = computed(() => `${viewYear.value}年${viewMonth.value + 1}月`)
function monthIndex(date) {
  const [y, m] = date.split('-').map(Number)
  return y * 12 + m - 1
}
const viewMonthIndex = computed(() => viewYear.value * 12 + viewMonth.value)
const canGoPrev = computed(() => !props.minDate || viewMonthIndex.value > monthIndex(props.minDate))
const canGoNext = computed(() => !props.maxDate || viewMonthIndex.value < monthIndex(props.maxDate))

function shiftMonth(delta) {
  const index = viewYear.value * 12 + viewMonth.value + delta
  viewYear.value = Math.floor(index / 12)
  viewMonth.value = index % 12
}

// 依週切成列；月初前與月底後補空格。
const weeks = computed(() => {
  const firstWeekday = new Date(viewYear.value, viewMonth.value, 1).getDay()
  const dayCount = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const cells = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= dayCount; day += 1) {
    const date = toDateString(new Date(viewYear.value, viewMonth.value, day))
    const disabled = (props.minDate && date < props.minDate) || (props.maxDate && date > props.maxDate)
    cells.push({ day, date, disabled: !!disabled, today: date === today.value })
  }
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))
})

// 展開日曆時把焦點放在目前選的日期，鍵盤才能直接從那裡開始。
function focusSelected() {
  const target = root.value?.querySelector('.day--selected:not(:disabled)') ?? root.value?.querySelector('.day:not(:disabled)')
  target?.focus({ preventScroll: true })
}
defineExpose({ focusSelected })
</script>

<template>
  <div ref="root" class="calendar-picker">
    <div class="month-nav">
      <button type="button" class="month-button" aria-label="上個月" :disabled="!canGoPrev" @click="shiftMonth(-1)">
        <img :src="monthPrevIcon" alt="" />
      </button>
      <p aria-live="polite">{{ monthLabel }}</p>
      <button type="button" class="month-button" aria-label="下個月" :disabled="!canGoNext" @click="shiftMonth(1)">
        <img :src="monthNextIcon" alt="" />
      </button>
    </div>
    <div class="calendar" role="grid" :aria-label="monthLabel">
      <div class="week weekdays" role="row">
        <span v-for="weekday in WEEKDAYS" :key="weekday" role="columnheader">{{ weekday }}</span>
      </div>
      <div v-for="(week, index) in weeks" :key="index" class="week" role="row">
        <span v-for="(cell, cellIndex) in week" :key="cellIndex" class="day-cell" role="gridcell">
          <button
            v-if="cell"
            type="button"
            class="day"
            :class="{ 'day--today': cell.today, 'day--selected': cell.date === modelValue }"
            :disabled="cell.disabled"
            :aria-pressed="cell.date === modelValue"
            :aria-label="`${viewMonth + 1}月${cell.day}日${cell.today ? '（今天）' : ''}`"
            @click="emit('update:modelValue', cell.date)"
          >{{ cell.day }}</button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.calendar-picker { display: flex; flex-direction: column; gap: t.$space-12; }
.month-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  p { margin: 0; font: t.$font-weight-bold 15px / normal t.$font-family; }
}
.month-button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  img { display: block; }
  &:disabled { opacity: .3; cursor: default; }
}
.calendar { display: flex; flex-direction: column; gap: t.$space-4; }
.week { display: grid; grid-template-columns: repeat(7, 1fr); }
.weekdays span { text-align: center; color: t.$text-disabled; font: t.$font-weight-medium 12px / normal t.$font-family; }
.day-cell { height: 44px; display: flex; align-items: center; justify-content: center; }
.day {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1.5px solid transparent;
  border-radius: 22px;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-regular 15px / normal t.$font-family;
  &:disabled { color: #bebcb6; cursor: default; }
  &--today { border-color: #b8d1af; }
  &--selected {
    border-color: t.$primary-green;
    background: t.$primary-green;
    box-shadow: 2px 3px 6px rgba(42, 74, 39, .35);
    color: t.$text-inverse;
    font-weight: t.$font-weight-bold;
  }
}
button { cursor: pointer; }
button:disabled { cursor: default; }
button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
