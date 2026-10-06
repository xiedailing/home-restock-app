<script setup>
defineProps({ checked: Boolean, disabled: Boolean })
</script>

<template>
  <span class="switch-track" :class="{ checked, disabled }" aria-hidden="true"><span class="switch-thumb" /></span>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.switch-track {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: t.$switch-width;
  height: t.$switch-height;
  padding: t.$switch-padding;
  border-radius: t.$switch-radius;
  background: t.$switch-bg-off;
  box-shadow: t.$switch-track-shadow-off;
  &.checked {
    background: t.$switch-bg-on;
    box-shadow: t.$switch-track-shadow-on;
  }
  &.disabled {
    background: t.$switch-bg-off;
    box-shadow: t.$switch-track-shadow-off;
    opacity: .65;
  }
}
.switch-thumb {
  flex: 0 0 t.$switch-thumb-size;
  width: t.$switch-thumb-size;
  height: t.$switch-thumb-size;
  border-radius: t.$switch-radius;
  background: t.$switch-thumb-bg;
  box-shadow: t.$switch-thumb-shadow-off;
  .checked & {
    transform: translateX(t.$switch-width - t.$switch-padding * 2 - t.$switch-thumb-size);
    box-shadow: t.$switch-thumb-shadow-on;
  }
}
</style>
