<script setup>
// 用品詳情狀態卡（specs/003 FR-302）。Figma：Draft A／B、948:7773、966:8254。
// 視覺只分兩種提醒狀態（001 D6）：該補貨了白底＋暖橘外框；補貨時間已過淡暖橘底＋明顯徽章。不用紅色與驚嘆號。
import { computed } from 'vue'
import { STATUS, daysUntil, toDateString } from '../../models/item'

const props = defineProps({
  item: { type: Object, required: true }, // 含 status
})
const emit = defineEmits(['restock', 'add-to-list', 'view-list', 'enable-reminder'])

const COPY = {
  [STATUS.NOT_NEEDED]: { title: '目前不用補貨', description: '我們會在下次接近補貨日時提醒你。', icon: 'check' },
  [STATUS.DUE_SOON]: { title: '該補貨了', description: '這項用品已進入提醒時間。', icon: 'clock' },
  [STATUS.OVERDUE]: { title: '補貨時間已過', description: '這項用品已超過原本的補貨時間，可以加入清單或記錄已補貨。', icon: 'clock' },
  [STATUS.IN_SHOPPING_LIST]: { title: '已加入購買清單', description: '這項用品已在購買清單中，補貨完成後可以記錄補貨。', icon: 'check' },
  [STATUS.REMINDER_OFF]: { title: '補貨提醒未開啟', description: '開啟後，系統會在接近需要補貨時提醒你。', icon: 'clock' },
}

const copy = computed(() => COPY[props.item.status] ?? COPY[STATUS.REMINDER_OFF])
const daysLeft = computed(() => (props.item.nextRestockDate ? daysUntil(props.item.nextRestockDate, toDateString()) : null))
const formattedDate = computed(() => props.item.nextRestockDate?.replaceAll('-', '/') ?? '')

// 計數至少兩位數；超過 99 天顯示實際位數（specs/003 DET-16）。
const counter = computed(() => {
  if (props.item.status === STATUS.DUE_SOON && daysLeft.value > 0) return { label: '距離下一次補貨還有', days: daysLeft.value }
  if (props.item.status === STATUS.OVERDUE) return { label: '預計補貨日已過', days: -daysLeft.value }
  return null
})
const digits = computed(() => (counter.value ? String(counter.value.days).padStart(2, '0').split('') : []))
// 剩 0 天不顯示「00 天」（specs/003 DET-10）。
const isDueToday = computed(() => props.item.status === STATUS.DUE_SOON && daysLeft.value === 0)
// 購買清單中且提醒關閉時，不顯示預計補貨日。
const showDate = computed(() => props.item.reminderEnabled && !!props.item.nextRestockDate && props.item.status !== STATUS.REMINDER_OFF)
</script>

<template>
  <section class="status-card" :class="`status-card--${item.status}`" aria-labelledby="status-card-title">
    <div class="status-header">
      <span class="status-icon" aria-hidden="true">
        <svg v-if="copy.icon === 'check'" viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <svg v-else viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10 6.5V10l2.5 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </span>
      <div class="status-text">
        <h2 id="status-card-title">{{ copy.title }}</h2>
        <p>{{ copy.description }}</p>
      </div>
    </div>

    <div v-if="counter || isDueToday" class="info-panel">
      <div v-if="counter" class="counter-row">
        <span class="counter-label">{{ counter.label }}</span>
        <span class="counter-digits" :aria-label="`${counter.days} 天`">
          <span v-for="(digit, index) in digits" :key="index" class="digit" aria-hidden="true">{{ digit }}</span>
        </span>
        <span class="counter-unit" aria-hidden="true">天</span>
      </div>
      <p v-else class="due-today">今天是預計補貨日</p>
      <span class="panel-divider" />
      <div class="date-row">
        <span>預計補貨日</span>
        <strong>{{ formattedDate }}</strong>
      </div>
    </div>
    <div v-else-if="showDate" class="info-panel">
      <div class="date-row">
        <span>{{ item.status === STATUS.NOT_NEEDED ? '下次預計補貨日' : '預計補貨日' }}</span>
        <strong>{{ formattedDate }}</strong>
      </div>
    </div>

    <div class="status-actions">
      <button v-if="item.status === STATUS.REMINDER_OFF" type="button" class="btn btn-primary action-primary" @click="emit('enable-reminder')">開啟補貨提醒</button>
      <template v-else>
        <button type="button" class="action-secondary" @click="emit('restock')">已補貨</button>
        <button v-if="item.status === STATUS.IN_SHOPPING_LIST" type="button" class="btn btn-primary action-primary" @click="emit('view-list')">查看清單</button>
        <button v-else type="button" class="btn btn-primary action-primary" @click="emit('add-to-list')">
          <span class="plus-icon" aria-hidden="true" />加入清單
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.status-card {
  --icon-bg: #{t.$success-subtle};
  --icon-color: #{t.$primary-green};
  padding: t.$space-20;
  display: flex;
  flex-direction: column;
  gap: t.$space-16;
  border: 1.5px solid transparent;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  box-shadow: t.$shadow-card;
  &--dueSoon { --icon-bg: #ffebd7; --icon-color: #{t.$accent-orange}; border-color: #f7c48f; }
  &--overdue { --icon-bg: #ffdec0; --icon-color: #{t.$accent-text}; border-color: #f7c48f; background: t.$accent-soft; }
  &--inShoppingList { --icon-bg: #{t.$primary-subtle}; border-color: #b8d1af; }
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
  box-shadow: inset -2px -2px 4px rgba(255, 255, 255, .8), inset 2px 2px 4px rgba(184, 131, 90, .18);
  svg { width: 20px; height: 20px; }
}
.status-text {
  flex: 1;
  min-width: 0;
  p { margin: t.$space-4 0 0; color: t.$text-body; font: t.$font-weight-regular 14px / 22px t.$font-family; }
}
h2 { margin: 0; font: t.$font-weight-bold 20px / 28px t.$font-family; }
.info-panel {
  padding: t.$space-12 t.$space-16;
  display: flex;
  flex-direction: column;
  gap: t.$space-12;
  border-radius: t.$radius-popover;
  background: t.$card-bg;
  box-shadow: t.$shadow-raised;
}
.counter-row { display: flex; align-items: center; gap: t.$space-8; }
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
  color: t.$accent-text;
  font: t.$font-weight-bold 32px / 1 t.$font-family;
}
.counter-unit { color: t.$accent-text; font: t.$font-weight-bold 15px / normal t.$font-family; }
.due-today { margin: 0; color: t.$accent-text; font: t.$font-weight-bold 16px / 24px t.$font-family; }
.panel-divider { height: 1px; background: t.$border-color; }
.date-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: t.$space-12;
  span { color: t.$text-body; font: t.$font-weight-regular 13px / 20px t.$font-family; }
  strong { color: t.$text-main; font: t.$font-weight-bold 14px / 20px t.$font-family; }
}
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
.status-card--reminderOff .action-primary { flex: 1; }
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
