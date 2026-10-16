<script setup>
// 下一階段才串接歷史判斷及 unitPeriodId：舊紀錄保留舊單位，
// 每次改單位（含改回舊名稱）皆建立新推算週期；新週期不足兩個不同日期不推算。
// 此元件只顯示提示，不修改紀錄、Catalog 或推算結果。
import { computed } from 'vue'
const props = defineProps({ oldUnit: { type: String, default: '' }, newUnit: { type: String, default: '' }, hasHistory: { type: Boolean, default: null } })
const changed = computed(() => props.oldUnit && props.newUnit.trim() && props.oldUnit !== props.newUnit.trim())
</script>
<template>
  <p v-if="changed && hasHistory === true" class="unit-hint">舊紀錄保留『{{ oldUnit }}』，改用『{{ newUnit.trim() }}』後重新推算補貨時間。</p>
  <p v-else-if="changed && hasHistory === null" class="unit-hint">歷史補貨紀錄判斷尚未串接；本次單位變更僅供預覽。</p>
</template>
<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
.unit-hint { margin: t.$space-8 0 t.$space-16; color: t.$text-sub; font: t.$font-weight-regular #{t.$font-size-caption} / 1.5 t.$font-family; }
</style>
