<script setup>
// Figma Soft Date Picker Sheet（1204:10901）。minDate 以前、maxDate 以後的日期不可選
//（預計補貨日最早明天，001 D1-c；補貨日期最晚今天，specs/003 DET-12）。月曆本體見 CalendarPicker。
import { ref, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import CalendarPicker from '../CalendarPicker.vue'

const props = defineProps({
  open: Boolean,
  modelValue: { type: String, default: null },
  minDate: { type: String, default: null },
  maxDate: { type: String, default: null },
  title: { type: String, default: '選擇預計補貨日' },
})
const emit = defineEmits(['update:modelValue', 'close'])

const sheet = ref(null)
const selected = ref(null)

// 每次開啟都從目前的值開始。
watch(() => props.open, (open) => {
  if (open) selected.value = props.modelValue
}, { immediate: true })

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
        <CalendarPicker v-model="selected" :min-date="minDate" :max-date="maxDate" :active="open" />
        <button type="button" class="btn btn-primary sheet-done" :disabled="!selected" @click="confirm(close)">完成</button>
      </div>
    </template>
  </BottomSheet>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.date-sheet { display: flex; flex-direction: column; gap: t.$space-12; }
h2 { margin: 0; font: t.$font-weight-bold 17px / normal t.$font-family; }
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
