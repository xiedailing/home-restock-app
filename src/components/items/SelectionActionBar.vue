<script setup>
// 「我的用品」選取模式的底部按鈕列（specs/013 FR-1302、FR-1303）：取代底部導覽，
// 左邊【取消】、右邊【加入購買清單】；已選 0 項時加入鈕停用。
defineProps({
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['cancel', 'add'])
</script>

<template>
  <div class="selection-bar-fade" aria-hidden="true" />
  <div class="selection-action-bar">
    <button type="button" class="selection-cancel" @click="emit('cancel')">取消</button>
    <button type="button" class="selection-add" :disabled="disabled" @click="emit('add')">
      <i class="fa-solid fa-clipboard-list" aria-hidden="true"></i>
      加入購買清單
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

// 底部漸層同 BottomNav：選取模式沒有導覽列，仍要讓按鈕浮在內容上方。
.selection-bar-fade {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 998;
  height: t.$bottom-nav-offset + t.$bottom-nav-height + 33px;
  pointer-events: none;
  background: linear-gradient(
    to top,
    rgba(140, 136, 127, 0.2) 0,
    rgba(140, 136, 127, 0.2) (t.$bottom-nav-offset + t.$bottom-nav-height * 0.5),
    rgba(140, 136, 127, 0.07) (t.$bottom-nav-offset + t.$bottom-nav-height),
    rgba(140, 136, 127, 0) (t.$bottom-nav-offset + t.$bottom-nav-height + 33px)
  );
}

// 358×68，兩顆按鈕高 56、間距 12，與導覽列同位置。
.selection-action-bar {
  position: fixed;
  box-sizing: border-box;
  inset-inline: 0;
  bottom: t.$bottom-nav-offset;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: t.$space-12;
  width: 100%;
  max-width: 390px;
  height: t.$bottom-nav-height;
  margin-inline: auto;
  padding-inline: t.$space-16;

  button {
    height: 56px;
    border-radius: t.$radius-pill;
    font: t.$font-weight-medium 17px / 20px t.$font-family;
    cursor: pointer;
    &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
  }
}

.selection-cancel {
  flex: 0 0 112px;
  border: 1px solid #d9d9d4;
  background: t.$card-bg;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .08);
  color: t.$text-main;
}

.selection-add {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: t.$space-8;
  min-width: 0;
  padding: 0;
  border: 0;
  background: t.$primary-green;
  box-shadow: 0 4px 12px rgba(63, 111, 59, .3);
  color: t.$text-inverse;
  font-weight: t.$font-weight-bold;
  i { font-size: 16px; }
  &:disabled { background: #dcdcd7; box-shadow: none; color: #9c9a94; cursor: not-allowed; }
}
</style>
