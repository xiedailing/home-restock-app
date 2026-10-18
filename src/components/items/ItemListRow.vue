<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { getStatusMarks } from '../../models/item'
import { getItemIconSrc } from '../../assets/household-icons-by-state/index.js'
import chevronIcon from '../../assets/settings/chevron.svg'
import StatusMarks from './StatusMarks.vue'

const props = defineProps({
  item: { type: Object, required: true },
  // 是否處於左滑展開狀態；由頁面統一管理，確保同時只有一列展開。
  revealed: { type: Boolean, default: false },
  // 選取模式（specs/013）：點列切換選取、不進詳情，左滑與長按停用。
  selecting: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
})

// reveal / close 只通知頁面更新狀態；delete 僅表示「點了刪除 action」，不刪資料；open 表示點列進入詳情。
// longpress 表示長按進入選取模式（FR-1301）；toggle 表示選取模式下點列切換選取。
const emit = defineEmits(['reveal', 'close', 'delete', 'open', 'longpress', 'toggle'])

// Figma Swipe Revealed：列向左位移 88px 露出刪除 action。
const ACTION_WIDTH = 88
const AXIS_LOCK_DISTANCE = 8 // 位移超過此距離才判斷水平／垂直
const LONG_PRESS_MS = 500 // 長按多久進入選取模式
const LONG_PRESS_SLOP = 8 // 長按期間位移超過此距離視為取消
const REVEAL_THRESHOLD = 24 // 從收合狀態左滑超過此距離即展開
const CLOSE_THRESHOLD = ACTION_WIDTH - REVEAL_THRESHOLD // 展開狀態右滑超過此距離即收回

const dragOffset = ref(null) // null = 非拖曳中，使用 revealed 決定位置
let gesture = null // { pointerId, startX, startY, base, axis: null | 'x' | 'y' }
let justDragged = false
let justLongPressed = false
let longPressTimer = null

// 狀態標記與圖示都由提醒狀態決定，不看購買清單；已在清單由標記表達（specs/010 FR-1001、FR-1005）。
const marks = computed(() => getStatusMarks(props.item.reminderStatus, props.item.inShoppingList))

const offset = computed(() => dragOffset.value ?? (props.revealed ? -ACTION_WIDTH : 0))

function cancelLongPress() {
  clearTimeout(longPressTimer)
  longPressTimer = null
}

function onPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (props.selecting) return
  justLongPressed = false
  cancelLongPress()
  // 展開狀態下不進入選取，先讓使用者收回刪除鈕。
  if (!props.revealed) {
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      gesture = null
      justLongPressed = true
      emit('longpress', props.item)
    }, LONG_PRESS_MS)
  }
  gesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    base: props.revealed ? -ACTION_WIDTH : 0,
    axis: null,
  }
}

function onPointerMove(event) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  const dx = event.clientX - gesture.startX
  const dy = event.clientY - gesture.startY
  if (Math.abs(dx) > LONG_PRESS_SLOP || Math.abs(dy) > LONG_PRESS_SLOP) cancelLongPress()
  if (gesture.axis === null) {
    if (Math.abs(dx) < AXIS_LOCK_DISTANCE && Math.abs(dy) < AXIS_LOCK_DISTANCE) return
    // 垂直意圖交還給瀏覽器捲動（CSS touch-action: pan-y），此列不處理。
    gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (gesture.axis === 'x') event.currentTarget.setPointerCapture(event.pointerId)
  }
  if (gesture.axis !== 'x') return
  // 只允許向左展開；範圍限制在 [-88, 0]。
  dragOffset.value = Math.min(0, Math.max(-ACTION_WIDTH, gesture.base + dx))
}

function endGesture(event, cancelled) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  cancelLongPress()
  const wasHorizontal = gesture.axis === 'x'
  gesture = null
  if (!wasHorizontal) return
  const finalOffset = dragOffset.value ?? 0
  dragOffset.value = null
  justDragged = true
  if (cancelled) return
  if (props.revealed) {
    if (finalOffset > -CLOSE_THRESHOLD) emit('close')
  } else if (finalOffset < -REVEAL_THRESHOLD) {
    emit('reveal')
  }
}

// 拖曳結束後瀏覽器仍可能補發 click，忽略一次；展開時點列其他位置只收回，收合時進入詳情。
function onContentClick() {
  if (justLongPressed) {
    justLongPressed = false
    return
  }
  if (props.selecting) {
    emit('toggle', props.item)
    return
  }
  if (justDragged) {
    justDragged = false
    return
  }
  if (props.revealed) emit('close')
  else emit('open', props.item)
}

onBeforeUnmount(cancelLongPress)
</script>

<template>
  <li class="item-row" :data-item-id="item.id">
    <button
      type="button"
      class="item-delete-action"
      :tabindex="revealed ? 0 : -1"
      :aria-hidden="!revealed"
      @click="emit('delete', item)"
    >刪除</button>
    <div
      class="item-row-content"
      :class="{ 'item-row-content--dragging': dragOffset !== null, 'item-row-content--selecting': selecting, 'item-row-content--selected': selecting && selected }"
      :style="{ transform: `translateX(${offset}px)` }"
      :role="selecting ? 'checkbox' : undefined"
      :aria-checked="selecting ? selected : undefined"
      :tabindex="selecting ? 0 : undefined"
      @keydown.enter.prevent="selecting && emit('toggle', item)"
      @keydown.space.prevent="selecting && emit('toggle', item)"
      @contextmenu.prevent
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endGesture($event, false)"
      @pointercancel="endGesture($event, true)"
      @click="onContentClick"
    >
      <span v-if="selecting" class="select-circle" :class="{ 'select-circle--on': selected }" aria-hidden="true">
        <i v-if="selected" class="fa-solid fa-check"></i>
      </span>
      <span class="item-icon-circle" aria-hidden="true">
        <img class="item-icon" :class="{ 'item-photo': item.iconPhoto }" :src="getItemIconSrc(item, item.reminderStatus)" alt="" draggable="false" />
      </span>
      <div class="item-body">
        <p class="item-name">{{ item.name }}</p>
        <p v-if="item.category" class="item-meta">
          <span class="item-category">{{ item.category }}</span>
        </p>
      </div>
      <div class="item-trailing">
        <StatusMarks :marks="marks" />
        <img v-if="!selecting" class="item-chevron" :src="chevronIcon" alt="" draggable="false" />
      </div>
    </div>
  </li>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.item-row {
  --icon-bg: #{t.$icon-circle-bg};
  position: relative;
  overflow: hidden;
  &:not(:last-child)::after { content: ''; position: absolute; inset: auto 0 0; z-index: 2; height: 1px; background: t.$border-color; pointer-events: none; }
}

.item-row-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 96px;
  padding: 12px 12px 12px 18px;
  background: t.$card-bg;
  // 垂直滑動交給瀏覽器捲動；水平手勢由 pointer events 處理。
  touch-action: pan-y;
  transition: transform .2s ease-out;
  // 長按不要選到文字或跳出系統選單（iOS Safari）。
  -webkit-touch-callout: none;
  user-select: none;
  &--dragging { transition: none; }
  &--selecting { gap: 12px; padding-left: 16px; cursor: pointer; &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; } }
  &--selected { background: #eff6ee; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
}

.item-delete-action {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 88px;
  padding: 0;
  border: 0;
  background: t.$danger;
  color: t.$text-inverse;
  font: t.$font-weight-medium 15px / normal t.$font-family;
  cursor: pointer;
}

.item-icon-circle {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: t.$radius-pill;
  background: var(--icon-bg);
  box-shadow: inset -2.308px -2.308px 4.615px rgba(255, 255, 255, .9), inset 2.308px 2.308px 4.615px rgba(184, 131, 90, .22);
}

// 選取圓圈（specs/013 FR-1302）：24px，未選為灰色邊框空圈，已選為綠色實心圈加白色勾勾。
.select-circle {
  flex: 0 0 24px;
  box-sizing: border-box;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 1.5px solid #b8b8b2;
  border-radius: 50%;
  background: t.$card-bg;
  color: t.$text-inverse;
  font-size: 12px;
  &--on { border-color: t.$primary-green; background: t.$primary-green; }
}

.item-icon { display: block; width: 48px; height: 48px; object-fit: contain; }
.item-body { flex: 1; min-width: 0; }

.item-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  margin: 0 0 5px;
  color: t.$text-main;
  font-size: 17px;
  font-weight: t.$font-weight-medium;
  line-height: 24px;
}

.item-meta { display: flex; min-width: 0; overflow: hidden; margin: 0; color: t.$text-sub; font-size: t.$font-size-body-sm; line-height: 18px; white-space: nowrap; }
.item-category { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.item-trailing { display: flex; align-items: center; gap: t.$space-8; flex-shrink: 0; }

.item-chevron { flex: 0 0 16px; width: 16px; height: 16px; }
</style>
