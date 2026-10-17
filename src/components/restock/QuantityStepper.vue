<script setup>
// 數量步進器「−／數字＋單位／＋」，1～99（specs/009 FR-905）。
const props = defineProps({
  modelValue: { type: Number, required: true },
  unit: { type: String, default: '' },
  // 輔助技術用：「減少 衛生紙 數量」。
  name: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const MIN = 1
const MAX = 99
</script>

<template>
  <div class="stepper" role="group" :aria-label="`${name}數量`">
    <button
      type="button"
      class="stepper-button"
      :aria-label="`減少${name}數量`"
      :disabled="modelValue <= MIN"
      @click="emit('update:modelValue', modelValue - 1)"
    >−</button>
    <output class="stepper-value" aria-live="polite"><strong>{{ modelValue }}</strong><span v-if="unit">{{ unit }}</span></output>
    <button
      type="button"
      class="stepper-button"
      :aria-label="`增加${name}數量`"
      :disabled="modelValue >= MAX"
      @click="emit('update:modelValue', modelValue + 1)"
    >＋</button>
  </div>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.stepper { flex: none; display: flex; align-items: center; gap: t.$space-4; }

.stepper-button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: t.$surface-bg;
  box-shadow: t.$shadow-raised;
  color: t.$dark-green;
  font: t.$font-weight-regular 18px / 1 t.$font-family;
  cursor: pointer;

  &:disabled { background: t.$input-bg; box-shadow: none; color: t.$text-disabled; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}

.stepper-value {
  min-width: 50px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 3px;
  strong { font: t.$font-weight-bold 20px / 1 t.$font-family; font-variant-numeric: tabular-nums; }
  span { color: t.$text-body; font-size: t.$font-size-metadata; }
}
</style>
