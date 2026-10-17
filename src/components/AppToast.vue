<script setup>
// 深色底 Toast（同我的用品刪除 Toast）：淺綠勾勾，可附「復原」。
// 樣式同我的用品「已新增用品」Toast；搭配 composables/useToast 使用。
import { useBottomNavHidden } from '../composables/useBottomNav'
import toastCheck from '../assets/settings/toast-check-on-dark.svg'

// placement：預設在畫面下方；補貨頁的頁內提示放上方，才不會蓋住底部的「記錄」面板。
defineProps({
  toast: { type: Object, default: null },
  placement: { type: String, default: 'bottom' },
})
const emit = defineEmits(['undo'])
// 有 Bottom Nav 時改放在 Nav 上方（specs/004 HOME-07）。
const hideBottomNav = useBottomNavHidden()
</script>

<template>
  <Teleport to="body">
    <Transition name="app-toast">
      <div v-if="toast" :key="toast.message" class="app-toast" :class="{ 'app-toast--above-nav': !hideBottomNav && placement !== 'top', 'app-toast--top': placement === 'top' }" role="status" aria-live="polite" @pointerenter="toast?.pause?.()" @pointerleave="toast?.resume?.()" @focusin="toast?.pause?.()" @focusout="toast?.resume?.()">
        <slot name="icon"><img :src="toastCheck" alt="" /></slot>
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
  // Bottom Nav 頂端在 116px（bottom 34 + 高 82），再留 16px，同我的用品刪除 Toast。
  &--above-nav { bottom: t.$toast-bottom; }
  &--top { top: 80px; bottom: auto; }
}
.app-toast-message { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
