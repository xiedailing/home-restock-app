<script setup>
// 補貨紀錄列表（specs/003 FR-307）：用品詳情區塊與完整列表頁共用。
// 點一筆開「編輯補貨紀錄」Sheet；儲存或刪除後 emit edited，由頁面顯示可復原的 Toast。
// 最近一次開啟提醒顯示為「開始追蹤」起點：依日期排入列表、不可點，不算補貨紀錄（specs/003 DET-21）。
import { computed, ref } from 'vue'
import { sortRecordsNewestFirst } from '../../models/item'
import { useItemsStore } from '../../stores/items'
import RestockSheet from './RestockSheet.vue'

const props = defineProps({
  item: { type: Object, required: true },
  limit: { type: Number, default: null }, // 最多顯示幾筆補貨紀錄；null ＝ 全部
})
// edited：({ message, snapshot })；snapshot 為修改前的整筆用品，供「復原」還原。
const emit = defineEmits(['edited'])
const itemsStore = useItemsStore()

// 起點排在同一天的補貨紀錄下方；超出 limit 的部分（含較早的起點）不顯示。
const entries = computed(() => {
  const { reminderEnabledDate: date, reminderEnabledQuantity: quantity } = props.item
  const start = date && quantity ? { start: true, date, quantity } : null
  const result = []
  let recordCount = 0
  for (const record of sortRecordsNewestFirst(props.item.restockRecords)) {
    if (props.limit !== null && recordCount >= props.limit) return result
    if (start && start.date > record.date && !result.includes(start)) result.push(start)
    result.push(record)
    recordCount += 1
  }
  if (start && !result.includes(start)) result.push(start)
  return result
})
const editingRecord = ref(null)
const sheetOpen = ref(false)

function openRecord(record) {
  editingRecord.value = record
  sheetOpen.value = true
}

function edit(message, change) {
  const snapshot = itemsStore.snapshotItem(props.item.id)
  change()
  emit('edited', { message, snapshot })
}

function save({ date, quantity }) {
  const record = editingRecord.value
  if (record.date === date && record.quantity === quantity) return
  edit('已更新補貨紀錄', () => itemsStore.updateRestockRecord(props.item.id, record.id, { date, quantity }))
}

function remove() {
  edit('已刪除補貨紀錄', () => itemsStore.removeRestockRecord(props.item.id, editingRecord.value.id))
}
</script>

<template>
  <div class="record-card">
    <ul v-if="entries.length" class="record-list">
      <li v-for="entry in entries" :key="entry.start ? 'start' : entry.id">
        <div v-if="entry.start" class="record-row record-row--start">
          <span class="record-dot record-dot--start" aria-hidden="true" />
          <span class="record-date">{{ entry.date.replaceAll('-', '/') }}</span>
          <span class="record-quantity">開始追蹤・家裡有 {{ entry.quantity }} {{ item.unit }}</span>
        </div>
        <button v-else type="button" class="record-row" @click="openRecord(entry)">
          <span class="record-dot" aria-hidden="true" />
          <span class="record-date">{{ entry.date.replaceAll('-', '/') }}</span>
          <span class="record-quantity">補貨 {{ entry.quantity }} {{ item.unit }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="record-empty">還沒有補貨紀錄</p>

    <RestockSheet
      :open="sheetOpen"
      :unit="item.unit"
      :reminder-enabled="item.reminderEnabled"
      :record="editingRecord"
      @confirm="save"
      @delete="remove"
      @close="sheetOpen = false; editingRecord = null"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.record-card {
  padding: t.$space-4 0;
  border-radius: t.$space-24;
  background: t.$card-bg;
  box-shadow: t.$shadow-card;
  overflow: hidden;
}
.record-list { margin: 0; padding: 0; list-style: none; }
.record-list li + li { position: relative; }
.record-list li + li::before {
  content: '';
  position: absolute;
  inset: 0 t.$space-16 auto;
  height: 1px;
  background: t.$border-color;
}
.record-row {
  width: 100%;
  min-height: 48px;
  padding: t.$space-12 t.$space-16;
  display: flex;
  align-items: center;
  gap: t.$space-12;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-family: t.$font-family;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; }
}
.record-dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: t.$border-active;
  // 起點：空心圓，與補貨紀錄區分。
  &--start { box-sizing: border-box; border: 1.5px solid t.$text-disabled; background: transparent; }
}
.record-row--start {
  cursor: default;
  .record-date, .record-quantity { color: t.$text-sub; }
  .record-date { font-weight: t.$font-weight-regular; }
}
.record-date { flex: 1; color: t.$text-main; font: t.$font-weight-medium 15px / normal t.$font-family; }
.record-quantity { color: t.$text-body; font: t.$font-weight-regular 14px / normal t.$font-family; }
.record-empty { margin: 0; padding: t.$space-16; color: t.$text-disabled; font: t.$font-weight-regular 14px / 20px t.$font-family; }
</style>
