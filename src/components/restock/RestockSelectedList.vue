<script setup>
import QuantityStepper from './QuantityStepper.vue'

// 補貨頁的已選清單（specs/009 FR-905）：一列一個用品，各自調數量；沒選時顯示「請選擇用品」。
// 最多顯示 3 列，超過可捲動。
// entries：[{ id, name, unit, icon, quantity, lastDate }]；lastDate 為該空間已有的最新一筆補貨日（M/D），沒有就不顯示。
defineProps({ entries: { type: Array, required: true } })
const emit = defineEmits(['update:quantity', 'remove'])
</script>

<template>
  <ul class="selected-list" aria-label="已選用品">
    <li v-if="!entries.length" class="selected-empty">請選擇用品</li>
    <li v-for="entry in entries" :key="entry.id" class="selected-row">
      <span class="selected-pic" :class="{ 'selected-pic--photo': entry.isPhoto }" aria-hidden="true"><img :src="entry.icon" :class="{ 'selected-photo': entry.isPhoto }" alt="" /></span>
      <span class="selected-info">
        <span class="selected-name">{{ entry.name }}</span>
        <span v-if="entry.lastDate" class="selected-meta">上次補貨 {{ entry.lastDate }}</span>
      </span>
      <QuantityStepper
        :model-value="entry.quantity"
        :unit="entry.unit"
        :name="entry.name"
        @update:model-value="emit('update:quantity', entry.id, $event)"
      />
      <button type="button" class="selected-remove" :aria-label="`移除${entry.name}`" @click="emit('remove', entry.id)">✕</button>
    </li>
  </ul>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.selected-list {
  display: flex;
  flex-direction: column;
  min-height: 56px;
  max-height: 168px; // 3 列
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.selected-empty {
  flex: 1;
  display: flex;
  align-items: center;
  padding-left: t.$space-4;
  color: t.$text-disabled;
  font: t.$font-weight-medium t.$font-size-button / normal t.$font-family;
}

.selected-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  border-bottom: 1px solid t.$border-color;
  &:last-child { border-bottom: 0; }
}

.selected-pic {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: t.$icon-circle-bg;
  img { width: 28px; height: 28px; object-fit: contain; }
  .selected-photo { border-radius: 50%; object-fit: cover; }
}

.selected-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }

.selected-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: t.$font-weight-medium #{t.$font-size-body} / 1.4 t.$font-family;
}

.selected-meta { color: t.$text-sub; font-size: t.$font-size-caption; line-height: 1.2; }

.selected-remove {
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: t.$text-sub;
  font-size: 16px;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
</style>

<style scoped>
.selected-pic--photo { background: transparent; }
</style>
