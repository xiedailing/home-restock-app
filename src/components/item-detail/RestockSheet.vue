<script setup>
// Figma 記錄補貨 Sheet（959:7879）；傳入 record 時為編輯補貨紀錄 Sheet（1246:13995）。
// 補貨日期最晚今天（specs/003 DET-12）；數量最小 1。
import { computed, ref, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import DatePickerSheet from '../add-item/DatePickerSheet.vue'
import { toDateString } from '../../models/item'
import selectorChevron from '../../assets/add-item/selector-chevron.svg'

const props = defineProps({
  open: Boolean,
  unit: { type: String, default: '' },
  reminderEnabled: Boolean,
  record: { type: Object, default: null }, // 編輯時傳入的紀錄
})
// confirm：({ date, quantity })；delete：刪除此筆紀錄（不另跳確認，Toast 可復原）。
const emit = defineEmits(['confirm', 'delete', 'close'])

const today = ref(toDateString())
const date = ref(today.value)
const quantity = ref(1)
const datePickerOpen = ref(false)
const editing = computed(() => !!props.record)

const formattedDate = computed(() => {
  const formatted = date.value.replaceAll('-', '/')
  return date.value === today.value ? `今天・${formatted}` : formatted
})
const description = computed(() => {
  if (!props.reminderEnabled) return editing.value ? '修改後會更新這筆補貨紀錄。' : '確認後會新增一筆補貨紀錄。'
  return editing.value ? '修改後會重新計算下次補貨提醒時間。' : '確認後會更新下次補貨提醒時間。'
})

watch(() => props.open, (open) => {
  if (!open) return
  today.value = toDateString()
  date.value = props.record?.date ?? today.value
  quantity.value = props.record?.quantity ?? 1
})

function confirm(close) {
  emit('confirm', { date: date.value, quantity: quantity.value })
  close()
}

function remove(close) {
  emit('delete')
  close()
}
</script>

<template>
  <BottomSheet :open="open" labelledby="restock-sheet-title" @close="emit('close')">
    <template #default="{ close }">
      <div class="restock-sheet">
        <div class="sheet-heading">
          <h2 id="restock-sheet-title">{{ editing ? '編輯補貨紀錄' : '記錄補貨' }}</h2>
          <p>{{ description }}</p>
        </div>

        <div class="restock-fields">
          <button type="button" class="field-row" @click="datePickerOpen = true">
            <span class="field-label">補貨日期</span>
            <span class="field-value">{{ formattedDate }}</span>
            <img :src="selectorChevron" alt="" />
          </button>
          <div class="field-row">
            <span id="restock-quantity-label" class="field-label">補貨數量</span>
            <div class="compact-stepper" role="group" aria-labelledby="restock-quantity-label">
              <button type="button" class="stepper-button" aria-label="減少數量" :disabled="quantity <= 1" @click="quantity -= 1">
                <span class="stepper-h" />
              </button>
              <p class="stepper-value" aria-live="polite"><strong>{{ quantity }}</strong><span v-if="unit">{{ unit }}</span></p>
              <button type="button" class="stepper-button" aria-label="增加數量" @click="quantity += 1">
                <span class="stepper-h" /><span class="stepper-v" />
              </button>
            </div>
          </div>
        </div>

        <div class="sheet-actions">
          <button type="button" class="btn btn-primary sheet-done" @click="confirm(close)">{{ editing ? '儲存變更' : '確認補貨' }}</button>
          <button v-if="editing" type="button" class="delete-record" @click="remove(close)">刪除此筆紀錄</button>
        </div>
      </div>
      <DatePickerSheet v-model="date" :open="datePickerOpen" :max-date="today" title="選擇補貨日期" @close="datePickerOpen = false" />
    </template>
  </BottomSheet>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
@use './sheet' as sheet;

.restock-sheet { display: flex; flex-direction: column; gap: 18px; }
.restock-fields {
  border-radius: t.$radius-popover;
  background: t.$input-bg;
  box-shadow: t.$shadow-inset;
  > * + * { border-top: 1px solid t.$border-color; }
}
.field-row {
  width: 100%;
  min-height: 60px;
  padding: t.$space-8 t.$space-16 t.$space-8 20px;
  display: flex;
  align-items: center;
  gap: t.$space-8;
  border: 0;
  background: transparent;
  text-align: left;
  img { flex-shrink: 0; }
}
.field-label { flex: 1; color: t.$text-body; font: t.$font-weight-regular 15px / normal t.$font-family; }
.field-value { color: t.$text-main; font: t.$font-weight-medium 15px / normal t.$font-family; }
.compact-stepper { display: flex; align-items: center; gap: t.$space-12; }
.compact-stepper .stepper-value strong { font-size: 22px; }
.sheet-actions { display: flex; flex-direction: column; gap: t.$space-8; }
// Figma：危險色文字按鈕。
.delete-record {
  min-height: t.$button-height-compact;
  border: 0;
  background: transparent;
  color: t.$danger;
  font: t.$font-weight-bold 15px / normal t.$font-family;
}
</style>
