<script setup>
// 深色底 Toast（同我的用品刪除 Toast）：淺綠勾勾，可附「復原」。
// 樣式同我的用品「已新增用品」Toast；搭配 composables/useToast 使用。
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useBottomNavHidden } from '../composables/useBottomNav'
import toastCheck from '../assets/settings/toast-check-on-dark.svg'

// placement：預設在畫面下方；補貨頁的頁內提示放上方，才不會蓋住底部的「記錄」面板。
const props = defineProps({
  toast: { type: Object, default: null },
  placement: { type: String, default: 'bottom' },
  teleportDisabled: { type: Boolean, default: false },
})
const emit = defineEmits(['undo'])
// 有 Bottom Nav 時改放在 Nav 上方（specs/004 HOME-07）。
const hideBottomNav = useBottomNavHidden()
// A manual popover uses the browser's top layer, above modal drawers and Sheets.
// It does not move focus or dismiss on outside clicks; useToast still owns timing.
const toastElement = ref(null)
const toastTarget = ref('body')
let modalObserver
function updateToastTarget() {
  const focusedModal = document.activeElement?.closest('dialog[open]')
  const modals = [...document.querySelectorAll('dialog:modal')]
  const target = focusedModal ?? modals.at(-1) ?? 'body'
  if (toastTarget.value !== target) toastTarget.value = target
}
watch(() => props.toast, toast => {
  modalObserver?.disconnect()
  if (!toast || props.teleportDisabled) return
  updateToastTarget()
  // Follow modal closure, including delayed Sheet closing after a successful save.
  modalObserver = new MutationObserver(updateToastTarget)
  modalObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
}, { flush: 'post', immediate: true })
onBeforeUnmount(() => modalObserver?.disconnect())
const supportsPopover = typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function'
watch([() => props.toast, toastElement, toastTarget], async ([toast, element]) => {
  if (!toast || !element || !supportsPopover) return
  await nextTick()
  if (props.toast !== toast || toastElement.value !== element || !element.isConnected) return
  if (!element.matches(':popover-open')) element.showPopover()
}, { flush: 'post' })

</script>

<template>
  <Teleport :to="toastTarget" :disabled="teleportDisabled">
    <Transition name="app-toast">
      <div v-if="toast" ref="toastElement" :popover="supportsPopover ? 'manual' : undefined" :key="toast.message" class="app-toast" :class="{ 'app-toast--above-nav': !hideBottomNav && placement !== 'top', 'app-toast--top': placement === 'top', 'app-toast--error': toast.variant === 'error' }" role="status" aria-live="polite"
        @pointerenter="event => { if (event.pointerType === 'mouse') toast.pause?.('hover') }"
        @pointerleave="toast.resume?.('hover'); toast.resume?.('touch')"
        @pointerdown="toast.pause?.('touch')" @pointerup="toast.resume?.('touch')" @pointercancel="toast.resume?.('touch')"
        @focusin="toast.pause?.('focus')" @focusout="event => { if (!event.currentTarget.contains(event.relatedTarget)) toast.resume?.('focus') }">
        <slot name="icon"><i v-if="toast.variant === 'error'" class="fa-solid fa-circle-exclamation app-toast-error-icon" aria-hidden="true"></i><img v-else :src="toastCheck" alt="" /></slot>
        <span class="app-toast-message">{{ toast.message }}</span>
        <button v-if="toast.undo" type="button" class="app-toast-undo" @click="emit('undo')">{{ toast.actionLabel ?? '復原' }}</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

// 沒有 Bottom Nav 的頁面：底部手勢區 34px 上方再留 12px（Figma Draft C）。
.app-toast {
  position: fixed;
  margin: 0;
  border: 0;
  top: auto;
  right: auto;
  bottom: 46px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  box-sizing: border-box;
  // 寬度跟內容走（同我的用品 Toast），最寬 358px，窄螢幕兩側各留 16px。
  width: max-content;
  max-width: min(t.$toast-max-width, calc(100% - t.$toast-inset-inline * 2));
  min-height: t.$toast-min-height;
  padding: 8px 22px 8px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: t.$radius-pill;
  background: t.$toast-background;
  box-shadow: t.$toast-shadow;
  color: t.$toast-text;
  font: t.$font-weight-medium 14px t.$font-family;
  img { width: 22px; height: 22px; flex-shrink: 0; }
  // Bottom Nav 頂端在 102px（bottom 34 + 高 68），再留 16px（$toast-bottom），同我的用品刪除 Toast。
  &--above-nav { bottom: t.$toast-bottom; }
  &--top { top: 80px; bottom: auto; }
}
// 最多兩行：較長的提示（例如認領規則的說明）不要把後半句截掉；一行放得下時外觀不變。
.app-toast-error-icon { flex-shrink: 0; width: 22px; font-size: 22px; color: t.$toast-error-accent; }
.app-toast--error .app-toast-message { color: t.$toast-error-accent; }
.app-toast--error .app-toast-undo { color: t.$toast-error-accent; }
.app-toast-message {
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.app-toast-error-icon { flex-shrink: 0; width: 22px; font-size: 22px; color: t.$toast-error-accent; }
.app-toast--error .app-toast-undo { color: t.$toast-error-accent; }
.app-toast-undo {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: t.$toast-success-accent;
  font: t.$font-weight-bold 14px / 20px t.$font-family;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$toast-success-accent; outline-offset: 2px; border-radius: t.$radius-pill; }
}
.app-toast-enter-active, .app-toast-leave-active { transition: opacity .3s ease; }
.app-toast-enter-from, .app-toast-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .app-toast-enter-active, .app-toast-leave-active { transition: none; }
}
</style>
