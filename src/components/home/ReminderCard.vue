<script setup>
// 首頁補貨提醒卡片（specs/004 FR-402～FR-404）。Figma：Suggestion Card / Homepage V2（687:5070）、Suggestion Popover（693:4712）。
// 狀態列顏色對應狀態、不用驚嘆號（HOME-10）；Popover 為【記錄補貨】【暫時不用補貨】（specs/005 FR-501）。
// 多選模式（FR-405，Figma 693:3838）：點卡片改為勾選，隱藏「⋯」與【加入清單】。
import { computed, onUnmounted, watch } from 'vue'
import { STATUS } from '../../models/item'
import { getItemIconSrc } from '../../assets/household-icons-by-state/index.js'
import moreButtonIcon from '../../assets/home/more-button.svg'

const props = defineProps({
  item: { type: Object, required: true }, // 含 status、daysLeft
  spaceName: { type: String, required: true },
  menuOpen: Boolean, // 由頁面管理，同時只開一個選單
  selecting: Boolean,
  selected: Boolean,
})
// open：進入用品詳情；toggle-menu / close-menu：「⋯」選單開關；restock／snooze：選單內【記錄補貨】【暫時不用補貨】；toggle-select：多選時勾選。
const emit = defineEmits(['open', 'add-to-list', 'toggle-menu', 'close-menu', 'restock', 'snooze', 'toggle-select'])

const isOverdue = computed(() => props.item.status === STATUS.OVERDUE)
// 沒有補貨紀錄時只顯示空間（HOME-04）。
const lastRestock = computed(() => {
  if (!props.item.lastRestockDate) return null
  const [, month, day] = props.item.lastRestockDate.split('-').map(Number)
  return `上次 ${month}/${day} 補`
})
// 剩 0 天不顯示「約 0 天後」（同 DET-10）。
const statusText = computed(() => {
  const { daysLeft } = props.item
  if (isOverdue.value) return `已超過預計補貨日 ${-daysLeft} 天`
  return daysLeft === 0 ? '今天是預計補貨日' : `約 ${daysLeft} 天後到預計補貨日`
})

// 選單開啟時按 Esc 關閉。
function onKeydown(event) {
  if (event.key === 'Escape') emit('close-menu')
}
watch(() => props.menuOpen, (open) => {
  if (open) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

function activate() {
  emit(props.selecting ? 'toggle-select' : 'open')
}

function chooseMenuOption(event) {
  emit('close-menu')
  emit(event)
}
</script>

<template>
  <article
    class="reminder-card"
    :class="[`reminder-card--${item.status}`, { 'reminder-card--menu-open': menuOpen, 'reminder-card--selected': selecting && selected }]"
    tabindex="0"
    :role="selecting ? 'checkbox' : undefined"
    :aria-checked="selecting ? selected : undefined"
    :aria-label="selecting ? `${item.name}，${statusText}` : `${item.name}，${statusText}，查看用品詳情`"
    @click="activate"
    @keydown.enter.self="activate"
    @keydown.space.self.prevent="selecting && emit('toggle-select')"
  >
    <div class="info-row">
      <span class="item-stamp" aria-hidden="true">
        <img :class="{ 'item-photo': item.iconPhoto }" :src="getItemIconSrc(item, item.status)" alt="" />
      </span>
      <div class="item-text">
        <h3 class="item-name">{{ item.name }}</h3>
        <p class="item-meta">
          <span class="meta-text">{{ spaceName }}</span>
          <template v-if="lastRestock">
            <span class="meta-separator">・</span>
            <span class="meta-text">{{ lastRestock }}</span>
          </template>
        </p>
      </div>
      <span v-if="selecting" class="select-box" :class="{ 'select-box--checked': selected }" aria-hidden="true">
        <svg v-if="selected" viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </span>
      <div v-else class="more-anchor">
        <button
          type="button"
          class="more-button"
          aria-label="更多操作"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click.stop="emit('toggle-menu')"
        >
          <img :src="moreButtonIcon" alt="" />
        </button>
        <template v-if="menuOpen">
          <div class="popover-backdrop" @click.stop="emit('close-menu')" />
          <div class="reminder-popover" role="menu" @click.stop>
            <button type="button" class="popover-option" role="menuitem" @click="chooseMenuOption('restock')">記錄補貨</button>
            <button type="button" class="popover-option" role="menuitem" @click="chooseMenuOption('snooze')">暫時不用補貨</button>
          </div>
        </template>
      </div>
    </div>

    <div class="status-bar">
      <svg class="status-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M10 6.5V10l2.5 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>{{ statusText }}</span>
    </div>

    <button v-if="!selecting" type="button" class="btn btn-primary add-button" @click.stop="emit('add-to-list')">
      <span class="plus-icon" aria-hidden="true" />加入清單
    </button>
  </article>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.reminder-card {
  --stamp-bg: #{t.$icon-circle-bg};
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  box-shadow: t.$shadow-card;
  color: t.$text-main;
  font-family: t.$font-family;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 3px; }
  // 多選勾選：綠色外框（Figma 693:3838）。
  &--selected { box-shadow: t.$shadow-card, inset 0 0 0 1.5px #9db59a; }
  // 選單要蓋過下方的卡片。
  &--menu-open { z-index: 20; }
}
.info-row { display: flex; align-items: center; gap: 14px; }
.item-stamp {
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 26px;
  background: var(--stamp-bg);
  box-shadow: inset -3px -3px 6px rgba(255, 255, 255, .9), inset 3px 3px 6px rgba(184, 131, 90, .22);
  img { display: block; width: 52px; height: 52px; object-fit: contain; }
}
.item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: t.$space-4; }
.item-name {
  margin: 0;
  overflow: hidden;
  color: #2b2a26;
  font: t.$font-weight-bold t.$font-size-card-title / normal t.$font-family;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-meta { display: flex; min-width: 0; margin: 0; color: #8b8880; font: t.$font-weight-regular t.$font-size-metadata / normal t.$font-family; white-space: nowrap; }
.meta-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.meta-separator { flex-shrink: 0; color: t.$text-sub; font-size: 14px; line-height: 18px; }

.more-anchor { position: relative; flex: 0 0 32px; width: 32px; height: 32px; }
// Figma Icon Button / More：32px 按鈕，SVG 含陰影範圍（46×47），左上各外擴 6px。
.more-button {
  position: relative;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: t.$radius-pill;
  background: transparent;
  cursor: pointer;
  img { position: absolute; top: -6px; left: -6px; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
// Figma Checkbox：32px；勾選後主綠底白勾。
.select-box {
  flex: 0 0 32px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1.5px solid #a9a59b;
  border-radius: 10px;
  background: t.$surface-bg;
  box-shadow: t.$shadow-raised;
  color: #fff;
  svg { width: 20px; height: 20px; }
  &--checked { border-color: t.$primary-green; background: t.$primary-green; }
}
.popover-backdrop { position: fixed; inset: 0; z-index: 1; cursor: default; }
// Figma Suggestion Popover：176 寬，右緣對齊「⋯」，緊接在按鈕下方。
.reminder-popover {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 2;
  width: 176px;
  padding: t.$space-8;
  border: 1px solid #edeae3;
  border-radius: t.$radius-popover;
  background: t.$card-bg;
  box-shadow: t.$shadow-floating;
  cursor: default;
}
.popover-option {
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  padding: 0 t.$space-12;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: #2b2a26;
  font: t.$font-weight-medium 14px / normal t.$font-family;
  text-align: left;
  cursor: pointer;
  &:hover { background: t.$input-bg; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; }
}

// 狀態列顏色同我的用品狀態 Badge（HOME-10）：該補貨了淡橘底橘字；補貨時間已過淡紅底紅字。
.status-bar {
  display: flex;
  align-items: center;
  gap: t.$space-8;
  padding: 11px t.$space-16 11px 14px;
  border-radius: 20px;
  background: #ffebd7;
  box-shadow: inset -1.5px -1.5px 3px rgba(255, 255, 255, .9), inset 1.5px 2px 3px rgba(217, 169, 138, .3);
  color: t.$accent-text;
  font: t.$font-weight-medium 14px / normal t.$font-family;
  .reminder-card--overdue & { background: #fde3df; color: t.$danger; font-weight: t.$font-weight-bold; }
}
.status-icon { flex: 0 0 20px; width: 20px; height: 20px; }

.add-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: t.$space-8;
  width: 100%;
  min-height: t.$button-height;
  font: t.$font-weight-bold t.$font-size-button / normal t.$font-family;
}
// 同用品詳情狀態卡的 Icon / Plus，Figma 為 16px。
.plus-icon {
  position: relative;
  width: 16px;
  height: 16px;
  &::before, &::after { content: ''; position: absolute; border-radius: 1px; background: currentColor; }
  &::before { inset: 43.75% 12.5%; }
  &::after { inset: 12.5% 43.75%; }
}
</style>
