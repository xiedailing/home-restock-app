<script setup>
// Figma 設定補貨提醒 Sheet（1204:11069）與 Draft D 編輯下次預計補貨日。
// mode="setup"：庫存量＋預計補貨日，日期不預填（001 FR-005）。
// mode="date"：只有預計補貨日，預設帶入目前日期；早於明天時不預選（specs/003 DET-01）。
import { computed, ref, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import DatePickerSheet from '../add-item/DatePickerSheet.vue'
import { addDays, addMonths, toDateString } from '../../models/item'
import pillCheck from '../../assets/add-item/pill-check.svg'
import calendarIcon from '../../assets/add-item/calendar.svg'
import dateChevron from '../../assets/add-item/date-chevron.svg'

const props = defineProps({
  open: Boolean,
  mode: { type: String, default: 'setup' }, // 'setup' | 'date'
  unit: { type: String, default: '' },
  initialDate: { type: String, default: null },
})
const emit = defineEmits(['done', 'close'])

const quantity = ref(1)
const date = ref(null)
const datePickerOpen = ref(false)
const today = ref(toDateString())
const minDate = computed(() => addDays(today.value, 1))
const quickDates = computed(() => [
  { label: '下週', date: addDays(today.value, 7) },
  { label: '兩週後', date: addDays(today.value, 14) },
  { label: '下個月', date: addMonths(today.value, 1) },
])
const formattedDate = computed(() => date.value?.replaceAll('-', '/') ?? '')

// 每次開啟都重新帶入，不保留上次未完成的輸入。
watch(() => props.open, (open) => {
  if (!open) return
  today.value = toDateString()
  quantity.value = 1
  date.value = props.mode === 'date' && props.initialDate >= minDate.value ? props.initialDate : null
})

function done(close) {
  if (!date.value) return
  emit('done', { quantity: quantity.value, nextRestockDate: date.value })
  close()
}
</script>

<template>
  <BottomSheet :open="open" labelledby="reminder-sheet-title" @close="emit('close')">
    <template #default="{ close }">
      <div class="reminder-sheet">
        <div class="sheet-heading">
          <h2 id="reminder-sheet-title">{{ mode === 'setup' ? '設定補貨提醒' : '編輯下次預計補貨日' }}</h2>
          <p>{{ mode === 'setup' ? '系統會在接近需要補貨時提醒你。' : '只改日期，系統會依原本的補貨資料重新換算。' }}</p>
        </div>

        <div v-if="mode === 'setup'" class="question-group">
          <p id="sheet-quantity-label" class="question">家裡目前有多少？</p>
          <div class="stepper" role="group" aria-labelledby="sheet-quantity-label">
            <button type="button" class="stepper-button" aria-label="減少數量" :disabled="quantity <= 1" @click="quantity -= 1">
              <span class="stepper-h" />
            </button>
            <p class="stepper-value" aria-live="polite"><strong>{{ quantity }}</strong><span v-if="unit">{{ unit }}</span></p>
            <button type="button" class="stepper-button" aria-label="增加數量" @click="quantity += 1">
              <span class="stepper-h" /><span class="stepper-v" />
            </button>
          </div>
        </div>

        <div class="question-group">
          <div class="question-text">
            <p class="question">下一次預計什麼時候補貨？ <span class="required">*</span></p>
            <p class="question-helper">不需要很精準，只是先幫你把補貨需求留下來。</p>
          </div>
          <div class="date-well">
            <div class="pills" role="group" aria-label="快速選擇預計補貨日">
              <button
                v-for="option in quickDates"
                :key="option.label"
                type="button"
                class="pill"
                :class="{ 'pill--selected': date === option.date }"
                :aria-pressed="date === option.date"
                @click="date = option.date"
              ><img v-if="date === option.date" :src="pillCheck" alt="" />{{ option.label }}</button>
            </div>
            <div class="date-row">
              <span id="sheet-date-label" class="date-label">預計補貨日</span>
              <button type="button" class="date-pill" aria-labelledby="sheet-date-label" @click="datePickerOpen = true">
                <img :src="calendarIcon" alt="" />
                <span :class="{ 'date-placeholder': !date }">{{ formattedDate || '選擇日期' }}</span>
                <img :src="dateChevron" alt="" />
              </button>
            </div>
          </div>
        </div>

        <button type="button" class="btn btn-primary sheet-done" :disabled="!date" @click="done(close)">完成</button>
      </div>
      <DatePickerSheet v-model="date" :open="datePickerOpen" :min-date="minDate" @close="datePickerOpen = false" />
    </template>
  </BottomSheet>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
@use './sheet' as sheet;

$caption-color: #8b8880;

.reminder-sheet { display: flex; flex-direction: column; gap: 18px; }
.question-group { display: flex; flex-direction: column; gap: 10px; }
.question-text { display: flex; flex-direction: column; gap: 2px; }
.question { margin: 0; font: t.$font-weight-bold 15px / normal t.$font-family; }
.question-helper { margin: 0; color: $caption-color; font: t.$font-weight-regular 12px / normal t.$font-family; }
.required { color: t.$accent-text; }
.pills { display: flex; flex-wrap: wrap; gap: t.$space-8; }
.pill {
  display: inline-flex;
  align-items: center;
  gap: t.$space-4;
  padding: 6px 12px;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$card-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-body;
  font: t.$font-weight-regular 13px / 18px t.$font-family;
  white-space: nowrap;
  img { display: block; }
  &--selected {
    padding-left: 10px;
    background: t.$active-green;
    box-shadow: t.$shadow-inset;
    color: t.$primary-green;
    font-weight: t.$font-weight-medium;
  }
}
.date-well {
  padding: t.$space-12;
  display: flex;
  flex-direction: column;
  gap: t.$space-4;
  border-radius: t.$radius-popover;
  background: t.$input-bg;
  box-shadow: t.$shadow-inset;
}
.date-row { padding: t.$space-8 t.$space-16; display: flex; align-items: center; gap: t.$space-12; }
.date-label { flex: 1; color: t.$text-body; font: t.$font-weight-regular 14px / 20px t.$font-family; }
.date-pill {
  height: 36px;
  padding: 0 t.$space-12 0 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: t.$radius-input;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-main;
  font: t.$font-weight-medium 14px / 20px t.$font-family;
  white-space: nowrap;
  img { display: block; }
}
.date-placeholder { color: t.$text-disabled; font-weight: t.$font-weight-regular; }
</style>
