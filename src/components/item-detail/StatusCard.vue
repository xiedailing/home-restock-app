<script setup>
// 用品詳情「補貨提醒」區（specs/003 FR-302）：提醒狀態、倒數、預計補貨日、上次補貨、提醒開關，加上下方的主要操作。
// 提醒區跟著「提醒設定」走，不看購買清單（getReminderStatus）；主要顯示狀態 Badge 在頁面上方（getStatus，RST-07）。
// 視覺只分兩種提醒狀態（001 D6）：該補貨了圖示暖橘；補貨時間已過圖示與倒數紅色。不用驚嘆號、不用外框。
import { computed } from 'vue'
import { STATUS, daysUntil, getReminderStatus, isSnoozed } from '../../models/item'
import { useItemsStore } from '../../stores/items'
import SwitchTrack from '../SwitchTrack.vue'
import selectorChevron from '../../assets/add-item/selector-chevron.svg'

const props = defineProps({
  item: { type: Object, required: true },
  // 補貨提醒開關的顯示狀態；設定 Sheet 開啟期間先呈現開啟，由頁面決定（specs/003 FR-305）。
  switchOn: Boolean,
})
// toggle-reminder：點開關（關閉要確認、開啟開設定 Sheet，由頁面處理）；edit-date：點預計補貨日列；
// restock：記錄補貨；add-to-list：加入清單；view-list：已在清單時前往購買清單。
const emit = defineEmits(['restock', 'add-to-list', 'view-list', 'toggle-reminder', 'edit-date'])
// 讀 store 的響應式「今天」，跨日後剩餘天數與延後提示會自動更新（specs/003 KI-01）。
const store = useItemsStore()

const reminderStatus = computed(() => getReminderStatus(props.item, store.today, store.remindWithinDays))

const COPY = {
  [STATUS.NOT_NEEDED]: { title: '尚未到補貨時間', description: '接近下次補貨日時，我們會提醒你。', icon: 'check' },
  [STATUS.DUE_SOON]: { title: '該補貨了', description: '這項用品已進入提醒時間。', icon: 'clock' },
  [STATUS.OVERDUE]: { title: '補貨時間已過', description: '這項用品已超過原本的補貨時間，可以加入清單或記錄補貨。', icon: 'clock' },
  [STATUS.REMINDER_OFF]: { title: '補貨提醒未開啟', description: '開啟提醒後，系統會在接近補貨日時通知你。', icon: 'clock' },
}

// 已在購買清單時，說明改為提醒補貨完成後記錄，不再建議「加入清單」（RST-08）。
const IN_LIST_DESCRIPTIONS = {
  [STATUS.NOT_NEEDED]: '已加入購買清單，補貨完成後可記錄補貨。',
  [STATUS.REMINDER_OFF]: '已加入購買清單，補貨完成後可記錄補貨。',
  [STATUS.OVERDUE]: '這項用品已超過原本的補貨時間，補貨完成後可以記錄補貨。',
}
const copy = computed(() => {
  const entry = COPY[reminderStatus.value] ?? COPY[STATUS.REMINDER_OFF]
  const inListDescription = props.item.inShoppingList && IN_LIST_DESCRIPTIONS[reminderStatus.value]
  return inListDescription ? { ...entry, description: inListDescription } : entry
})
const daysLeft = computed(() => (props.item.nextRestockDate ? daysUntil(props.item.nextRestockDate, store.today) : null))

// 計數至少兩位數；超過 99 天顯示實際位數（specs/003 DET-16）。
const counter = computed(() => {
  if (reminderStatus.value === STATUS.DUE_SOON && daysLeft.value > 0) return { label: '距離下一次補貨還有', days: daysLeft.value }
  if (reminderStatus.value === STATUS.OVERDUE) return { label: '預計補貨日已過', days: -daysLeft.value }
  return null
})
const digits = computed(() => (counter.value ? String(counter.value.days).padStart(2, '0').split('') : []))
// 剩 0 天不顯示「00 天」（specs/003 DET-10）。
const isDueToday = computed(() => reminderStatus.value === STATUS.DUE_SOON && daysLeft.value === 0)
// 「暫時不用補貨」延後中：只提示，不改變狀態（specs/005 SNZ-03）。
const snoozeText = computed(() => {
  if (!isSnoozed(props.item, store.today)) return ''
  const [, month, day] = props.item.snoozedUntil.split('-').map(Number)
  return `已延後提醒至 ${month}/${day}`
})
// 提醒關閉時沒有預計補貨日可顯示或編輯（001 FR-005）。
const showDate = computed(() => props.item.reminderEnabled && !!props.item.nextRestockDate)
const dateLabel = computed(() => (reminderStatus.value === STATUS.NOT_NEEDED ? '下次預計補貨日' : '預計補貨日'))
const formatDate = (date) => date?.replaceAll('-', '/') ?? ''
</script>

<template>
  <section class="reminder-section" aria-labelledby="reminder-section-title">
    <h2 id="reminder-section-title" class="reminder-heading">補貨提醒</h2>
    <div class="status-card" :class="`status-card--${reminderStatus}`">
      <div class="status-header">
        <span class="status-icon" aria-hidden="true">
          <svg v-if="copy.icon === 'check'" viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <svg v-else viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10 6.5V10l2.5 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
        <div class="status-text">
          <h3>{{ copy.title }}</h3>
          <p>{{ copy.description }}</p>
          <p v-if="snoozeText" class="snooze-note">{{ snoozeText }}</p>
        </div>
      </div>

      <div class="status-body">
        <template v-if="counter || isDueToday">
          <div v-if="counter" class="counter-row">
            <span class="counter-label">{{ counter.label }}</span>
            <span class="counter-digits" :aria-label="`${counter.days} 天`">
              <span v-for="(digit, index) in digits" :key="index" class="digit" aria-hidden="true">{{ digit }}</span>
            </span>
            <span class="counter-unit" aria-hidden="true">天</span>
          </div>
          <p v-else class="due-today">今天是預計補貨日</p>
        </template>
        <ul class="info-rows">
          <li v-if="showDate">
            <button type="button" class="info-row info-row--button" @click="emit('edit-date')">
              <span class="info-label">{{ dateLabel }}</span>
              <strong class="info-value">{{ formatDate(item.nextRestockDate) }}</strong>
              <img :src="selectorChevron" alt="" />
            </button>
          </li>
          <!-- 只顯示；要修改請到補貨紀錄（specs/003 DET-13）。 -->
          <li class="info-row">
            <span class="info-label">上次補貨</span>
            <span class="info-value" :class="{ 'info-value--empty': !item.lastRestockDate }">{{ item.lastRestockDate ? formatDate(item.lastRestockDate) : '尚無紀錄' }}</span>
          </li>
          <!-- 整列都是開關：標籤與開關同屬一個按鈕，觸控區為整列。 -->
          <li>
            <button type="button" class="info-row info-row--button" role="switch" :aria-checked="switchOn" @click="emit('toggle-reminder')">
              <span class="info-label">補貨提醒</span>
              <SwitchTrack :checked="switchOn" />
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>

  <div class="status-actions">
    <button type="button" class="action-secondary" @click="emit('restock')">記錄補貨</button>
    <button v-if="item.inShoppingList" type="button" class="btn btn-primary action-primary" @click="emit('view-list')">查看清單</button>
    <button v-else type="button" class="btn btn-primary action-primary" @click="emit('add-to-list')">
      <span class="plus-icon" aria-hidden="true" />加入清單
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.reminder-section { display: flex; flex-direction: column; gap: t.$space-8; }
.reminder-heading { margin: 0; padding: 0 t.$space-4; font: t.$font-weight-bold 16px / 22px t.$font-family; }

.status-card {
  --icon-bg: #{t.$success-subtle};
  --icon-color: #{t.$primary-green};
  --counter-color: #{t.$accent-text};
  padding: t.$space-20;
  display: flex;
  flex-direction: column;
  gap: t.$space-12;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  box-shadow: t.$shadow-card;
  &--dueSoon { --icon-bg: #ffebd7; --icon-color: #{t.$accent-orange}; }
  &--overdue { --icon-bg: #fde3df; --icon-color: #{t.$danger}; --counter-color: #{t.$danger}; }
  &--reminderOff { --icon-bg: #f0eee8; --icon-color: #{t.$text-sub}; }
}
.status-header { display: flex; align-items: flex-start; gap: t.$space-12; }
.status-icon {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--icon-bg);
  color: var(--icon-color);
  svg { width: 20px; height: 20px; }
}
.status-text {
  flex: 1;
  min-width: 0;
  p { margin: t.$space-4 0 0; color: t.$text-body; font: t.$font-weight-regular 14px / 22px t.$font-family; }
}
h3 { margin: 0; font: t.$font-weight-bold 20px / 28px t.$font-family; }
.status-text .snooze-note { color: t.$text-sub; font-weight: t.$font-weight-medium; }

// 資訊區：沒有內層卡片與陰影，用分隔線區隔。
.status-body { border-top: 1px solid t.$border-color; padding-top: t.$space-8; }
.counter-row { display: flex; align-items: center; gap: t.$space-8; padding: t.$space-8 0 t.$space-12; border-bottom: 1px solid t.$border-color; }
.counter-label { flex: 1; min-width: 0; color: t.$text-main; font: t.$font-weight-medium 14px / 20px t.$font-family; }
.counter-digits { display: flex; gap: 6px; }
.digit {
  width: 44px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: t.$radius-md;
  background: t.$input-bg;
  box-shadow: t.$shadow-inset;
  color: var(--counter-color);
  font: t.$font-weight-bold 32px / 1 t.$font-family;
}
.counter-unit { color: var(--counter-color); font: t.$font-weight-bold 15px / normal t.$font-family; }
.due-today { margin: 0; padding: t.$space-8 0 t.$space-12; border-bottom: 1px solid t.$border-color; color: t.$accent-text; font: t.$font-weight-bold 16px / 24px t.$font-family; }

.info-rows { margin: 0; padding: 0; list-style: none; }
.info-rows > li + li { border-top: 1px solid t.$border-color; }
.info-row {
  width: 100%;
  min-height: 48px;
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
  img { flex-shrink: 0; }
}
.info-label { flex: 1; color: t.$text-body; font: t.$font-weight-regular 14px / 20px t.$font-family; }
.info-value { color: t.$text-main; font: t.$font-weight-bold 14px / 20px t.$font-family; &--empty { color: t.$text-sub; font-weight: t.$font-weight-regular; } }

// 主要操作：兩顆按鈕同高，次要操作視覺較輕。
.status-actions { display: flex; gap: t.$space-8; }
.action-secondary, .action-primary {
  min-height: t.$button-height-compact;
  border: 0;
  border-radius: t.$radius-pill;
  font-family: t.$font-family;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
.action-secondary {
  flex: 1;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-button-secondary;
  font: t.$font-weight-medium 15px / normal t.$font-family;
}
.action-primary { flex: 1.6; font: t.$font-weight-bold t.$font-size-button / normal t.$font-family; }
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
