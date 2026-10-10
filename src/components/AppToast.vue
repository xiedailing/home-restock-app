<script setup>
// Figma Toast / 已更新用品名稱（966:8254）：淺色底、綠色勾勾，可附「復原」。
// 樣式同我的用品「已新增用品」Toast；搭配 composables/useToast 使用。
import toastCheck from '../assets/settings/toast-check.svg'

defineProps({ toast: { type: Object, default: null } })
const emit = defineEmits(['undo'])
</script>

<template>
  <Teleport to="body">
    <Transition name="app-toast">
      <div v-if="toast" :key="toast.message" class="app-toast" role="status" aria-live="polite">
        <img :src="toastCheck" alt="" />
        <span class="app-toast-message">{{ toast.message }}</span>
        <button v-if="toast.undo" type="button" class="app-toast-undo" @click="emit('undo')">復原</button>
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
  width: min(t.$toast-max-width, calc(100% - t.$toast-inset-inline * 2));
  min-height: t.$toast-min-height;
  padding: 8px 22px 8px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #d4cbbe;
  border-radius: t.$radius-pill;
  background: t.$card-bg;
  box-shadow: 0 -2px 8px rgba(255, 255, 255, .8), 0 8px 24px rgba(140, 136, 127, .36), 0 2px 6px rgba(107, 102, 92, .2);
  color: t.$text-main;
  font: t.$font-weight-medium 14px t.$font-family;
  img { width: 22px; height: 22px; flex-shrink: 0; }
}
.app-toast-message { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-toast-undo {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: t.$primary-green;
  font: t.$font-weight-bold 14px / 20px t.$font-family;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; border-radius: t.$radius-pill; }
}
.app-toast-enter-active, .app-toast-leave-active { transition: opacity .3s ease; }
.app-toast-enter-from, .app-toast-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .app-toast-enter-active, .app-toast-leave-active { transition: none; }
}
</style>
