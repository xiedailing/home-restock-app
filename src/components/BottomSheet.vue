<script setup>
// 共用 Bottom Sheet：拖曳把手、往下滑或點背景關閉；互動沿用 InviteMemberSheet。
// 父層以 open 控制顯示；關閉動畫結束後 emit('close')，由父層把 open 設回 false。
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({ open: Boolean, labelledby: String })
const emit = defineEmits(['close'])
const dialog = ref(null)
const offset = ref(0)
const closing = ref(false)
let closeTimer
let startY = null

watch(() => props.open, async (open) => {
  await nextTick()
  if (open) {
    clearTimeout(closeTimer)
    closing.value = false
    offset.value = 0
    if (!dialog.value?.open) dialog.value?.showModal()
  } else {
    dialog.value?.close()
  }
}, { immediate: true })

function close() {
  if (closing.value) return
  closing.value = true
  const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500
  closeTimer = setTimeout(() => emit('close'), delay)
}

function startDrag(event) {
  if (event.button !== 0) return
  startY = event.clientY
  event.currentTarget.setPointerCapture(event.pointerId)
}
function moveDrag(event) {
  if (startY !== null) offset.value = Math.max(0, event.clientY - startY)
}
function endDrag() {
  if (offset.value > 80) close()
  offset.value = 0
  startY = null
}

onBeforeUnmount(() => { clearTimeout(closeTimer); dialog.value?.close() })
defineExpose({ close })
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="bottom-sheet"
      :class="{ closing }"
      :style="{ '--drag-offset': `${offset}px` }"
      :aria-labelledby="labelledby"
      @cancel.prevent="close"
      @click="($event.target === dialog) && close()"
    >
      <div class="sheet-grab-area" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag">
        <span class="sheet-handle" />
      </div>
      <slot :close="close" />
    </dialog>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

// Figma Soft Date Picker Sheet（1204:10901）：上方圓角 28、底部預留 44px 安全空間。
.bottom-sheet {
  position: fixed;
  inset: auto 0 0;
  box-sizing: border-box;
  width: 100%;
  max-width: 390px;
  max-height: 90dvh;
  margin: 0 auto;
  padding: 0 20px max(44px, env(safe-area-inset-bottom));
  border: 0;
  border-radius: t.$radius-card t.$radius-card 0 0;
  background: t.$card-bg;
  color: t.$text-main;
  font-family: t.$font-family;
  text-align: left;
  box-shadow: 0 -6px 24px rgba(0, 0, 0, .12);
  transform: translateY(var(--drag-offset));
  &::backdrop { background: rgba(0, 0, 0, .35); }
  &[open] { animation: sheet-enter .5s ease; }
  &.closing { animation: sheet-exit .5s ease forwards; }
}
.sheet-grab-area { height: 27px; display: flex; align-items: center; justify-content: center; cursor: grab; touch-action: none; }
.sheet-handle { width: 40px; height: 5px; border-radius: 3px; background: t.$border-active; }
@keyframes sheet-enter { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes sheet-exit { from { transform: translateY(var(--drag-offset)); } to { transform: translateY(100%); } }
@media (prefers-reduced-motion: reduce) { .bottom-sheet[open], .bottom-sheet.closing { animation: none; } }
</style>
