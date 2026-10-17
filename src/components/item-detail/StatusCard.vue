<script setup>
// 補貨明細的提醒卡與主要操作（specs/011 FR-1104、FR-1105）。
// 設定頁風格的列表卡：第一列是補貨提醒開關，接著預計補貨日、上次補貨。狀態只由摘要卡的標記表達（specs/010），
// 這裡沒有狀態標題、圖示與副標題。
// 紀錄涵蓋不到兩個不同日期時推算不出預計補貨日：卡片仍在，但沒有開關列，預計補貨日顯示「再補貨 N 次後預估」（009 FR-913）。
import { computed } from 'vue'
import { STATUS, countRecordDates, daysUntil } from '../../models/item'
import { useItemsStore } from '../../stores/items'
import SwitchTrack from '../SwitchTrack.vue'

const props = defineProps({
  item: { type: Object, required: true },
  // 補貨提醒開關的顯示狀態（specs/003 FR-305）。
  switchOn: Boolean,
})
// toggle-reminder：點開關（關閉要確認、開啟直接重算，由頁面處理）；
// restock：記錄補貨；add-to-list：加入清單；view-list：已在清單時前往購買清單。
const emit = defineEmits(['restock', 'add-to-list', 'view-list', 'toggle-reminder'])
// 讀 store 的響應式「今天」，跨日後「（今天）」與顏色會自動更新（specs/003 KI-01）。
const store = useItemsStore()

// 還差幾個不同日期的紀錄才推算得出預計補貨日；0 ＝ 已經夠了。
const recordsNeeded = computed(() => Math.max(0, 2 - countRecordDates(props.item.restockRecords)))

const reminderStatus = computed(() => props.item.reminderStatus)
// 該補貨了（含補貨時間已過）時預計補貨日用暖橘色，同摘要卡 pill 字色；不用紅色（UT-36）。
const isDue = computed(() => reminderStatus.value === STATUS.OVERDUE || reminderStatus.value === STATUS.DUE_SOON)
const isDueToday = computed(() => !!props.item.nextRestockDate && daysUntil(props.item.nextRestockDate, store.today) === 0)

// 提醒關閉時不顯示預計補貨日（001 FR-005）。預計補貨日只顯示、不能修改（specs/009 FR-912）。
const showDate = computed(() => props.item.reminderEnabled && !!props.item.nextRestockDate)
const dateLabel = computed(() => (reminderStatus.value === STATUS.NOT_NEEDED ? '下次預計補貨日' : '預計補貨日'))
const formatDate = (date) => date?.replaceAll('-', '/') ?? ''
const dateText = computed(() => `${formatDate(props.item.nextRestockDate)}${isDueToday.value ? '（今天）' : ''}`)
</script>

<template>
  <div class="reminder-card">
    <!-- 整列都是開關：標籤與開關同屬一個按鈕，觸控區為整列（RST-07）。紀錄不足時沒有開關列。 -->
    <button v-if="recordsNeeded === 0" type="button" class="info-row info-row--button" role="switch" :aria-checked="switchOn" @click="emit('toggle-reminder')">
      <span class="info-label">補貨提醒</span>
      <SwitchTrack :checked="switchOn" />
    </button>
    <div v-if="recordsNeeded > 0" class="info-row">
      <span class="info-label">預計補貨日</span>
      <span class="info-value info-value--pending">再補貨 {{ recordsNeeded }} 次後預估</span>
    </div>
    <div v-else-if="showDate" class="info-row">
      <span class="info-label">{{ dateLabel }}</span>
      <strong class="info-value" :class="{ 'info-value--due': isDue }">{{ dateText }}</strong>
    </div>
    <!-- 只顯示；要修改請到補貨紀錄（specs/003 DET-13）。 -->
    <div class="info-row">
      <span class="info-label">上次補貨</span>
      <strong class="info-value" :class="{ 'info-value--empty': !item.lastRestockDate }">{{ item.lastRestockDate ? formatDate(item.lastRestockDate) : '尚無紀錄' }}</strong>
    </div>
  </div>

  <!-- 照 Figma Actions（902:7077）：次要在左（加入／查看清單，前面都有清單圖示，同底部導覽），主要在右（記錄補貨）。 -->
  <div class="status-actions">
    <button v-if="item.inShoppingList" type="button" class="action-secondary" @click="emit('view-list')">
      <i class="fa-solid fa-clipboard-list" aria-hidden="true"></i>查看清單
    </button>
    <button v-else type="button" class="action-secondary" @click="emit('add-to-list')">
      <i class="fa-solid fa-clipboard-list" aria-hidden="true"></i>加入清單
    </button>
    <button type="button" class="btn btn-primary action-primary" @click="emit('restock')">
      <span class="plus-icon" aria-hidden="true" />記錄補貨
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

// 設定頁風格的列表卡：沒有標題與圖示，列與列用分隔線區隔。
.reminder-card {
  padding: 0 t.$space-20;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  box-shadow: t.$shadow-card;
}
.info-row {
  width: 100%;
  min-height: 52px;
  padding: t.$space-8 0;
  display: flex;
  align-items: center;
  gap: t.$space-8;
  &--button {
    border: 0;
    background: transparent;
    text-align: left;
    border-radius: t.$radius-sm;
    font-family: t.$font-family;
    cursor: pointer;
    &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
  }
}
.reminder-card > .info-row + .info-row { border-top: 1px solid t.$border-color; }
// 標籤 16px、顏色同設定頁列標籤；數值 16px 粗體（UT-36：原本 14px 灰字不好讀）。
.info-label { flex: 1; color: t.$text-main; font: t.$font-weight-regular 16px / 24px t.$font-family; }
.info-value {
  color: t.$text-main;
  font: t.$font-weight-bold 16px / 24px t.$font-family;
  &--due { color: t.$accent-text; }
  &--empty { color: t.$text-sub; font-weight: t.$font-weight-regular; }
  &--pending { color: t.$text-sub; font-weight: t.$font-weight-regular; }
}

// 主要操作：兩顆等寬、高 48px（Figma Actions）。
.status-actions { display: flex; gap: t.$space-8; }
.action-secondary, .action-primary {
  flex: 1;
  min-height: t.$button-height;
  border: 0;
  border-radius: t.$radius-pill;
  font-family: t.$font-family;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
.action-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: t.$space-8;
  background: t.$primary-subtle;
  box-shadow: t.$shadow-raised;
  color: t.$dark-green;
  font: t.$font-weight-medium 15px / normal t.$font-family;
  i { font-size: 14px; }
}
.action-primary { font: t.$font-weight-bold t.$font-size-button / normal t.$font-family; }
// Figma Icon / Plus：12px，橫豎線各佔 25%～75%。
.plus-icon {
  position: relative;
  width: 12px;
  height: 12px;
  &::before, &::after { content: ''; position: absolute; border-radius: 1px; background: currentColor; }
  &::before { inset: 43.75% 12.5%; }
  &::after { inset: 12.5% 43.75%; }
}
</style>
