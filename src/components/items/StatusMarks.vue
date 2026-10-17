<script setup>
// 狀態標記（specs/010 FR-1002）：「我的用品」列表與用品詳情摘要卡共用。
// marks 來自 getStatusMarks：pill 只顯示最重要的一個狀態；圓形清單標記只在「該補貨了＋已在清單」時出現。
import { STATUS, STATUS_LABELS } from '../../models/item'

defineProps({
  marks: { type: Object, required: true },
})
</script>

<template>
  <span v-if="marks.pill || marks.showListMark" class="status-marks">
    <span v-if="marks.showListMark" class="list-mark" role="img" aria-label="已在購買清單">
      <i class="fa-solid fa-clipboard-list" aria-hidden="true"></i>
    </span>
    <span v-if="marks.pill" class="status-pill" :class="{ 'status-pill--list': marks.pill === STATUS.IN_SHOPPING_LIST }">
      <i v-if="marks.pill === STATUS.IN_SHOPPING_LIST" class="fa-solid fa-clipboard-list" aria-hidden="true"></i>
      {{ STATUS_LABELS[marks.pill] }}
    </span>
  </span>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.status-marks { display: inline-flex; align-items: center; flex-shrink: 0; gap: 6px; }

// 圖示與底部導覽「購買清單」同一個（fa-clipboard-list）。圓圈與 pill 等高（24px）。
.list-mark {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: t.$primary-subtle;
  color: t.$primary-green;
  font-size: 12px;
}

// 該補貨了（overdue 與 dueSoon 同標籤、同顏色）。
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: t.$radius-pill;
  background: #ffebd7;
  color: t.$accent-text;
  font-size: t.$font-size-caption;
  font-weight: t.$font-weight-medium;
  line-height: 18px;
  white-space: nowrap;
  i { font-size: 11px; }
  &--list { background: t.$primary-subtle; color: t.$primary-green; }
}
</style>
