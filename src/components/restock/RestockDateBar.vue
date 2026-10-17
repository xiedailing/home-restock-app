<script setup>
import { computed, ref } from 'vue'
import DatePickerSheet from '../add-item/DatePickerSheet.vue'
import { addDays } from '../../models/item'

// 補貨日期條（specs/009 FR-906）：左右箭頭＋中間日期；補貨日期最晚今天（specs/003 DET-12）。
// 格式「今天・M/D 週X」，非今天只顯示「M/D 週X」；點中間開日期選擇器。
const props = defineProps({
  modelValue: { type: String, required: true },
  today: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const pickerOpen = ref(false)

const label = computed(() => {
  const [year, month, day] = props.modelValue.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()]
  const text = `${month}/${day} 週${weekday}`
  return props.modelValue === props.today ? `今天・${text}` : text
})

const canGoNext = computed(() => props.modelValue < props.today)

function shift(days) {
  const next = addDays(props.modelValue, days)
  if (next > props.today) return
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="date-bar">
    <button type="button" class="date-arrow" aria-label="前一天" @click="shift(-1)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 4v16L5 12z" /></svg>
    </button>
    <button type="button" class="date-day" aria-haspopup="dialog" @click="pickerOpen = true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
      <span>{{ label }}</span>
    </button>
    <button type="button" class="date-arrow" aria-label="後一天" :disabled="!canGoNext" @click="shift(1)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 4v16l11-8z" /></svg>
    </button>
  </div>
  <DatePickerSheet
    :model-value="modelValue"
    :open="pickerOpen"
    :max-date="today"
    title="選擇補貨日期"
    @update:model-value="emit('update:modelValue', $event)"
    @close="pickerOpen = false"
  />
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.date-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 6px;
  border-radius: t.$radius-pill;
  background: t.$input-bg;
  box-shadow: t.$shadow-inset;
}

.date-arrow {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: t.$text-main;
  cursor: pointer;
  &:disabled { color: t.$text-disabled; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}

.date-day {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: t.$space-8;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: t.$radius-pill;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-medium t.$font-size-body / normal t.$font-family;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
</style>
