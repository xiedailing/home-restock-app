<script setup>
// Figma：Soft Bottom Navigation V2（2702:21272）。膠囊內 3 項，右側外置綠色「＋」；「＋」展開新增選單。
// UT-37：膠囊縮矮（82→68px）、「＋」鈕拿掉白圈（綠圓 56px）、選單加遮罩與圖示、改名「記錄補貨」。
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import plusIcon from '../assets/nav/plus.svg'

const route = useRoute()

const emit = defineEmits(['add-record', 'add-space'])

const navItems = [
  { name: 'inventory', label: '我的用品', icon: 'fa-solid fa-box-open' },
  { name: 'shopping', label: '購買清單', icon: 'fa-solid fa-clipboard-list' },
  { name: 'settings', label: '設定', icon: 'fa-solid fa-gear' },
]

// 「＋」選單：只有記錄補貨、新增空間（可用性測試 2026-10-15；UT-37 改名）。
const menuOpen = ref(false)
const root = ref(null)
const trigger = ref(null)
const menu = ref(null)

async function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value) return
  await nextTick()
  menu.value?.querySelector('button')?.focus({ preventScroll: true })
}

function choose(event) {
  menuOpen.value = false
  emit(event)
}
function dismiss(event) {
  if (menuOpen.value && !root.value?.contains(event.target)) menuOpen.value = false
}
function onKeydown(event) {
  if (event.key === 'Escape' && menuOpen.value) {
    menuOpen.value = false
    trigger.value?.focus({ preventScroll: true })
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', dismiss)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismiss)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
  <!-- 遮罩：把背景壓暗，選單才不會跟同色的卡片融在一起；導覽列（z-index 1000）留在遮罩上方。點遮罩由 dismiss 關閉。 -->
  <div v-if="menuOpen" class="plus-scrim" aria-hidden="true" />
  <nav class="bottom-nav-wrapper" aria-label="主要導覽">
    <div class="bottom-nav">
      <div class="nav-pill">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          class="nav-btn"
          :class="{ active: item.name === 'settings' && route.path.startsWith('/settings/') }"
          :to="{ name: item.name }"
          exact-active-class="active"
        >
          <i :class="item.icon" class="nav-icon" aria-hidden="true"></i>
          <span class="nav-text">{{ item.label }}</span>
        </RouterLink>
      </div>

      <div ref="root" class="plus-slot">
        <div v-if="menuOpen" ref="menu" class="plus-menu" role="menu" aria-label="新增">
          <!-- 「記錄補貨」的圖示同用品詳情的主要按鈕（＋）；「新增空間」用資料夾＋，空間不一定是多人共享，不用人像。 -->
          <button type="button" class="plus-menu-option" role="menuitem" @click="choose('add-record')">
            <span class="plus-menu-icon" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>記錄補貨
          </button>
          <button type="button" class="plus-menu-option" role="menuitem" @click="choose('add-space')">
            <span class="plus-menu-icon" aria-hidden="true"><i class="fa-solid fa-folder-plus"></i></span>新增空間
          </button>
        </div>
        <button
          ref="trigger"
          type="button"
          class="plus-btn"
          aria-label="新增"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="toggleMenu"
        >
          <img :src="plusIcon" alt="" />
        </button>
      </div>
    </div>
  </nav>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.bottom-nav-wrapper {
  // 移到 body 下，固定於視窗，避免祖先容器 transform 影響定位。
  position: fixed;
  box-sizing: border-box;
  inset-inline: 0;
  bottom: t.$bottom-nav-offset;
  z-index: 1000;
  width: 100%;
  max-width: 390px;
  margin-inline: auto;
  padding-inline: t.$space-16;
}

// 358×68：膠囊在左、外置「＋」（56px）在右，垂直置中，間距 12。
.bottom-nav {
  display: flex;
  align-items: center;
  gap: t.$space-12;
  height: t.$bottom-nav-height;
}

.nav-pill {
  display: flex;
  flex: 1;
  align-items: center;
  gap: t.$space-4;
  min-width: 0;
  height: t.$bottom-nav-height;
  box-sizing: border-box;
  padding: 7px t.$space-8;
  border: 1px solid t.$border-color;
  border-radius: 38px;
  background-color: t.$card-bg;
  box-shadow: t.$shadow-floating;
}

.nav-btn {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: t.$space-4;
  min-width: 0;
  height: 52px;
  border-radius: 18px;
  color: t.$text-sub;
  font-size: 11px;
  line-height: normal;
  text-decoration: none;
  transition: background-color 0.2s, color 0.2s, border-radius 0.2s;

  &.active {
    gap: 2px;
    border-radius: 38px;
    color: t.$primary-green;
    background-color: t.$active-green;
    box-shadow: inset -1px -1px 4px rgba(255, 255, 255, 0.85), inset 1px 2px 5px rgba(138, 158, 136, 0.1);
    font-weight: t.$font-weight-medium;
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

.plus-slot {
  position: relative;
  flex-shrink: 0;
}

.plus-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  padding: 0;
  // 拿掉白圈（UT-37）：深綠圓與米色背景、白色卡片的對比已夠，加遮罩後白圈反而像一圈亮環。
  border: 0;
  border-radius: 28px;
  background-color: t.$primary-green;
  box-shadow: 0 6px 13px rgba(75, 94, 72, 0.28);
  cursor: pointer;
  transition: transform 0.2s;

  img { display: block; width: 22px; height: 22px; }

  &:active {
    transform: scale(0.95);
  }
}

// 遮罩：固定整個視窗，z-index 低於導覽列（1000），導覽列留在遮罩上方。
.plus-scrim {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(29, 29, 31, 0.32);
}

// 展開在「＋」上方，右緣對齊。
.plus-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + t.$space-12);
  width: 220px;
  box-sizing: border-box;
  padding: t.$space-8;
  border: 1px solid t.$border-color;
  border-radius: t.$radius-popover;
  background: t.$card-bg;
  box-shadow: 0 8px 24px rgba(29, 29, 31, 0.18);
}

.plus-menu-option {
  display: flex;
  align-items: center;
  gap: t.$space-12;
  width: 100%;
  height: 52px;
  padding: 0 10px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-medium 16px / normal t.$font-family;
  text-align: left;
  cursor: pointer;
  &:hover { background: t.$input-bg; }
}

// 圓形圖示：淡綠底、綠色圖示。
.plus-menu-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: t.$primary-subtle;
  color: t.$primary-green;
  font-size: 15px;
}

.nav-btn:focus-visible,
.plus-btn:focus-visible,
.plus-menu-option:focus-visible {
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
