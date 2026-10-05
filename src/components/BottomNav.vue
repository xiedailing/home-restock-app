<script setup>
import { RouterLink } from 'vue-router'

const emit = defineEmits(['click-plus'])

// 四個頁面共用同一份導覽設定；中央新增按鈕放在第二個項目之後。
const navItems = [
  { name: 'home', label: '首頁', icon: 'fa-solid fa-house' },
  { name: 'inventory', label: '我的用品', icon: 'fa-solid fa-box-open ' },
  { name: 'shopping', label: '購買清單', icon: 'fa-solid fa-clipboard-list' },
  { name: 'settings', label: '設定', icon: 'fa-solid fa-gear' },
]
</script>

<template>
  <nav class="bottom-nav-wrapper" aria-label="主要導覽">
    <div class="bottom-nav">
      <template v-for="(item, index) in navItems" :key="item.name">
        <RouterLink
          class="nav-btn"
          :to="{ name: item.name }"
          exact-active-class="active"
        >
          <i :class="item.icon" class="nav-icon" aria-hidden="true"></i>
          <span class="nav-text">{{ item.label }}</span>
        </RouterLink>

        <div v-if="index === 1" class="plus-slot">
          <button
            type="button"
            class="plus-btn"
            aria-label="新增用品"
            @click="emit('click-plus')"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </template>
    </div>
  </nav>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.bottom-nav-wrapper {
  position: fixed;
  inset-inline: 0;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 1000;
  width: 100%;
  max-width: 390px;
  margin-inline: auto;
  padding-inline: t.$space-16;
}

.bottom-nav {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: center;
  height: 82px;
  padding: t.$space-8;
  border-radius: t.$radius-nav;
  background-color: t.$card-bg;
  box-shadow: t.$shadow-floating;
}

.nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: t.$space-4;
  min-width: 0;
  min-height: 56px;
  border-radius: t.$radius-popover;
  color: t.$text-sub;
  font-size: 11px;
  line-height: 1.4;
  text-decoration: none;
  transition: background-color 0.2s, color 0.2s;

  &.active {
    color: t.$primary-green;
    background-color: t.$active-green;
    font-weight: t.$font-weight-bold;
  }
}

.nav-text {
  white-space: nowrap;
}

.nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 16px;
}

svg {
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.plus-slot {
  display: flex;
  justify-content: center;
  align-self: center;
}

.plus-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  margin-top: 0;
  padding: 0;
  border: 3px solid t.$card-bg;
  border-radius: 50%;
  color: t.$text-inverse;
  background-color: t.$primary-green;
  box-shadow: t.$shadow-primary;
  cursor: pointer;
  transition: transform 0.2s, background-color 0.2s;

  svg {
    width: 24px;
    height: 24px;
    stroke-width: 2;
  }

  &:active {
    transform: scale(0.95);
  }
}

.nav-btn:focus-visible,
.plus-btn:focus-visible {
  outline: 2px solid t.$primary-green;
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .nav-btn,
  .plus-btn {
    transition: none;
  }
}
</style>
