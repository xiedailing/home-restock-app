<script setup>
import { ref } from 'vue'
import { SPACE_COLORS } from '../models/space'
const color = defineModel({ type: String, default: 'green' })
const dragging = ref(false)
let dragStartX = 0
let dragStartScroll = 0
let dragPointerId = null
let movedDuringDrag = false

// 手機保留原生滑動；電腦另外支援按住滑鼠左右拖曳。
function startColorDrag(event) {
  if (event.pointerType !== 'mouse' || event.button !== 0) return
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartScroll = event.currentTarget.scrollLeft
  movedDuringDrag = false
}

function moveColorDrag(event) {
  if (event.pointerId !== dragPointerId) return
  const distance = event.clientX - dragStartX
  if (!movedDuringDrag && Math.abs(distance) < 5) return
  movedDuringDrag = true
  dragging.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
  event.currentTarget.scrollLeft = dragStartScroll - distance
  event.preventDefault()
}

function endColorDrag(event) {
  if (event.pointerId !== dragPointerId) return
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
  dragPointerId = null
  dragging.value = false
}

function handleColorClick(event) {
  // 拖曳結束時不誤選顏色；鍵盤操作仍可正常選取。
  if (movedDuringDrag && event.detail > 0) {
    event.preventDefault()
    event.stopPropagation()
  }
}

</script>
<template>
<div class="color-picker">
          <div class="color-options" :class="{ dragging }"
            @pointerdown="startColorDrag" @pointermove="moveColorDrag"
            @pointerup="endColorDrag" @pointercancel="endColorDrag" @lostpointercapture="endColorDrag"
            @pointerleave="!dragging && endColorDrag($event)" @click.capture="handleColorClick">
            <label v-for="option in SPACE_COLORS" :key="option.id" class="color-option"
              :class="{ selected: color === option.id }"
              :style="{ '--color-light': option.light, '--color-dark': option.dark }">
              <input v-model="color" type="radio" name="space-color" :value="option.id" :aria-label="option.label" />
              <span class="color-swatch" aria-hidden="true" />
              <span v-if="color === option.id" class="color-check" aria-hidden="true">✓</span>
            </label>
          </div>
          <p class="color-hint">左右滑動選擇代表色</p>

</div>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.color-options {
  display: flex;
  width: 100%;
  min-width: 0;
  gap: 26px;
  // 滑到兩端時仍保留陰影空間，避免圓形按鈕的陰影被捲動容器裁切。
  padding: 8px 12px 12px 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  user-select: none;
  cursor: grab;
  &::-webkit-scrollbar { display: none; }
  &.dragging, &.dragging .color-option, &.dragging input { cursor: grabbing; }
}
.color-option {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  position: relative;
  padding: 4px;
  border-radius: 50%;
  background: t.$card-bg;
  box-shadow: t.$shadow-raised;
  cursor: pointer;
  input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  &.selected { outline: 2px solid t.$primary-green; outline-offset: -2px; box-shadow: t.$shadow-inset; }
  &:focus-within { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
.color-swatch { display: block; width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(to bottom, var(--color-light) 50%, var(--color-dark) 50%); pointer-events: none; }
.color-check { position: absolute; right: 1px; bottom: 1px; width: 16px; height: 16px; display: grid; place-items: center; border-radius: 50%; background: t.$primary-green; color: white; font: 700 10px / 1 sans-serif; pointer-events: none; }
.color-hint { margin: 8px 0 0; color: #8b8880; font-size: 11px; line-height: 16px; }

</style>
