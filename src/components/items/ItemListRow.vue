<script setup>
import { computed, ref } from 'vue'
import { STATUS_LABELS } from '../../models/item'
import { getItemIcon } from '../../assets/household-icons-by-state/index.js'
import chevronIcon from '../../assets/settings/chevron.svg'

const props = defineProps({
  item: { type: Object, required: true },
  spaces: { type: Array, required: true },
  // 是否處於左滑展開狀態；由頁面統一管理，確保同時只有一列展開。
  revealed: { type: Boolean, default: false },
})

// reveal / close 只通知頁面更新狀態；delete 僅表示「點了刪除 action」，不刪資料；open 表示點列進入詳情。
const emit = defineEmits(['reveal', 'close', 'delete', 'open'])

const spaceName = computed(() =>
  props.spaces.find((space) => space.id === props.item.spaceId)?.name ?? '未指定空間',
)

// Figma Swipe Revealed：列向左位移 88px 露出刪除 action。
const ACTION_WIDTH = 88
const AXIS_LOCK_DISTANCE = 8 // 位移超過此距離才判斷水平／垂直
const REVEAL_THRESHOLD = 24 // 從收合狀態左滑超過此距離即展開
const CLOSE_THRESHOLD = ACTION_WIDTH - REVEAL_THRESHOLD // 展開狀態右滑超過此距離即收回

const dragOffset = ref(null) // null = 非拖曳中，使用 revealed 決定位置
let gesture = null // { pointerId, startX, startY, base, axis: null | 'x' | 'y' }
let justDragged = false

const offset = computed(() => dragOffset.value ?? (props.revealed ? -ACTION_WIDTH : 0))

function onPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
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
  if (justDragged) {
    justDragged = false
    return
  }
  if (props.revealed) emit('close')
  else emit('open', props.item)
}
</script>

<template>
  <li class="item-row" :class="`item-row--${item.status}`" :data-item-id="item.id">
    <button
      type="button"
      class="item-delete-action"
      :tabindex="revealed ? 0 : -1"
      :aria-hidden="!revealed"
      @click="emit('delete', item)"
    >刪除</button>
    <div
      class="item-row-content"
      :class="{ 'item-row-content--dragging': dragOffset !== null }"
      :style="{ transform: `translateX(${offset}px)` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endGesture($event, false)"
      @pointercancel="endGesture($event, true)"
      @click="onContentClick"
    >
      <span class="item-icon-circle" aria-hidden="true">
        <img class="item-icon" :src="getItemIcon(item.iconKey, item.status)" alt="" />
      </span>
      <div class="item-body">
        <p class="item-name">{{ item.name }}</p>
        <p class="item-meta">
          <span class="item-space">{{ spaceName }}</span>
          <template v-if="item.category">
            <span class="meta-separator">・</span>
            <span class="item-category">{{ item.category }}</span>
          </template>
        </p>
      </div>
      <div class="item-trailing">
        <span class="status-badge">{{ STATUS_LABELS[item.status] ?? '狀態未知' }}</span>
        <img class="item-chevron" :src="chevronIcon" alt="" />
      </div>
    </div>
  </li>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.item-row {
  --badge-bg: #{t.$success-subtle};
  --badge-text: #{t.$success};
  --icon-bg: #{t.$success-subtle};
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
  &--dragging { transition: none; }
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

.item-row--overdue { --badge-bg: #fde3df; --badge-text: #{t.$danger}; --icon-bg: #f6c4bc; }
.item-row--dueSoon { --badge-bg: #ffebd7; --badge-text: #{t.$accent-text}; --icon-bg: #ffdec0; }
.item-row--inShoppingList { --badge-bg: #{t.$primary-subtle}; --badge-text: #{t.$primary-green}; --icon-bg: #{t.$primary-subtle}; }
.item-row--reminderOff { --badge-bg: #f5f5f6; --badge-text: #{t.$text-body}; --icon-bg: #f5f5f6; }

.item-icon-circle {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: t.$radius-pill;
  background: var(--icon-bg);
  box-shadow: inset -2.308px -2.308px 4.615px rgba(255, 255, 255, .9), inset 2.308px 2.308px 4.615px rgba(184, 131, 90, .22);
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
.item-space { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.meta-separator { flex-shrink: 0; }
.item-category { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.item-trailing { display: flex; align-items: center; gap: t.$space-8; flex-shrink: 0; }

.status-badge {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: t.$radius-pill;
  background: var(--badge-bg);
  color: var(--badge-text);
  font-size: t.$font-size-caption;
  font-weight: t.$font-weight-medium;
  line-height: 18px;
  white-space: nowrap;
}

.item-chevron { flex: 0 0 16px; width: 16px; height: 16px; }
</style>
