<script setup>
// Figma Soft Date Picker Sheet（1204:10901）。minDate 以前、maxDate 以後的日期不可選
//（預計補貨日最早明天，001 D1-c；補貨日期最晚今天，specs/003 DET-12）。
import { computed, ref, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import { toDateString } from '../../models/item'
import monthPrevIcon from '../../assets/add-item/month-prev.svg'
import monthNextIcon from '../../assets/add-item/month-next.svg'

const props = defineProps({
  open: Boolean,
  modelValue: { type: String, default: null },
  minDate: { type: String, default: null },
  maxDate: { type: String, default: null },
  title: { type: String, default: '選擇預計補貨日' },
})
const emit = defineEmits(['update:modelValue', 'close'])

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const sheet = ref(null)
const selected = ref(null)
const viewYear = ref(0)
const viewMonth = ref(0) // 0-based
const today = ref(toDateString())

// 每次開啟都從目前的值（或最早可選日）開始。
watch(() => props.open, (open) => {
  if (!open) return
  today.value = toDateString()
  selected.value = props.modelValue
  const [y, m] = (props.modelValue ?? props.minDate ?? props.maxDate ?? today.value).split('-').map(Number)
  viewYear.value = y
  viewMonth.value = m - 1
}, { immediate: true })

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

function confirm(close) {
  if (!selected.value) return
  emit('update:modelValue', selected.value)
  close()
}
</script>

<template>
  <BottomSheet ref="sheet" :open="open" labelledby="date-sheet-title" @close="emit('close')">
    <template #default="{ close }">
      <div class="date-sheet">
        <h2 id="date-sheet-title">{{ title }}</h2>
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
                :class="{ 'day--today': cell.today, 'day--selected': cell.date === selected }"
                :disabled="cell.disabled"
                :aria-pressed="cell.date === selected"
                :aria-label="`${viewMonth + 1}月${cell.day}日${cell.today ? '（今天）' : ''}`"
                @click="selected = cell.date"
              >{{ cell.day }}</button>
            </span>
          </div>
        </div>
        <button type="button" class="btn btn-primary sheet-done" :disabled="!selected" @click="confirm(close)">完成</button>
      </div>
    </template>
  </BottomSheet>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.date-sheet { display: flex; flex-direction: column; gap: t.$space-12; }
h2 { margin: 0; font: t.$font-weight-bold 17px / normal t.$font-family; }
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
.sheet-done {
  width: 100%;
  min-height: t.$button-height;
  border-radius: t.$radius-pill;
  font: t.$font-weight-bold t.$font-size-button / normal t.$font-family;
  &:disabled { opacity: .5; }
}
button { cursor: pointer; }
button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
