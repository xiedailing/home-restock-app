<script setup>
// Figma：Soft Bottom Navigation V2（2702:21272）。膠囊內 3 項，右側外置綠色「＋」；「＋」展開新增選單。
// UT-37：膠囊縮矮（82→68px）、「＋」鈕拿掉白圈（綠圓 56px）、選單加遮罩與圖示、改名「記錄補貨」。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import plusIcon from '../assets/nav/plus.svg'
import BrandLogo from './BrandLogo.vue'
import { useItemsStore } from '../stores/items'
import { DEFAULT_SPACE_ID } from '../models/item'
import { getSpaceColor } from '../models/space'
import { SYSTEM_CATEGORIES } from '../models/itemCategories'
import desktopDotActive from '../assets/nav/desktop/dot-active.svg'

const props = defineProps({ navigationRoute: { type: Object, default: null } })
const currentRoute = useRoute()
const route = computed(() => props.navigationRoute ?? currentRoute)
const itemsStore = useItemsStore()
const managementSection = computed(() => {
  if (route.value.name === 'item-category') {
    return SYSTEM_CATEGORIES.includes(String(route.value.params.category)) ? 'system' : 'custom'
  }
  if (route.value.name !== 'item-management') return null
  if (route.value.hash === '#system-categories-title') return 'system'
  if (route.value.hash === '#custom-categories-title') return 'custom'
  return null
})
const isCurrent = name => name === 'settings' ? route.value.path.startsWith('/settings') : route.value.name === name

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
  <!-- 底部漸層（UT-37）：螢幕最下面由下往上淡出的淺暖灰，卡片內容不會在導覽列後面與縫隙清楚露出，膠囊才浮得起來。不攔截點擊。 -->
  <div class="bottom-nav-fade" aria-hidden="true" />
  <!-- 遮罩：把背景壓暗，選單才不會跟同色的卡片融在一起；導覽列（z-index 1000）留在遮罩上方。點遮罩由 dismiss 關閉。 -->
  <div v-if="menuOpen" class="plus-scrim" aria-hidden="true" />
  <nav class="bottom-nav-wrapper" aria-label="主要導覽">
    <div class="desktop-brand"><div class="desktop-brand-title"><BrandLogo /><strong>補補</strong></div><span>日常用品，補得剛剛好</span></div>
    <div class="bottom-nav">
      <div class="nav-pill">
        <div v-for="item in navItems" :key="item.name" class="nav-group">
          <RouterLink class="nav-btn" :class="{ active: isCurrent(item.name) }" :to="item.name === 'shopping' ? { name: 'shopping', query: { tab: 'personal' } } : { name: item.name }" exact-active-class="active">
            <i :class="item.icon" class="nav-icon" aria-hidden="true"></i>
            <img class="desktop-nav-dot" :src="desktopDotActive" alt="" />
            <span class="nav-text">{{ item.label }}</span>
            <i v-if="item.name === 'inventory' || item.name === 'shopping' || item.name === 'settings'" class="fa-solid fa-chevron-down desktop-subnav-arrow" :class="{ expanded: isCurrent(item.name) }" aria-hidden="true"></i>
          </RouterLink>
          <Transition name="shopping-subnav">
            <div v-if="item.name === 'inventory' && route.name === 'inventory'" class="desktop-shopping-nav" aria-label="用品空間">
              <button v-for="space in itemsStore.spaces" :key="space.id" type="button" :class="{ active: (itemsStore.inventorySpaceId ?? DEFAULT_SPACE_ID) === space.id }" :aria-pressed="(itemsStore.inventorySpaceId ?? DEFAULT_SPACE_ID) === space.id" @click="itemsStore.inventorySpaceId = space.id"><span class="desktop-space-dot" :style="{ backgroundColor: getSpaceColor(space.color).dark }" aria-hidden="true" /><span class="desktop-subnav-label">{{ space.name }}</span><svg class="desktop-subnav-check" viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
            </div>
          </Transition>
          <Transition name="shopping-subnav">
          <div v-if="item.name === 'shopping' && route.name === 'shopping'" class="desktop-shopping-nav" aria-label="購買清單分類">
            <RouterLink :to="{ name: 'shopping', query: { tab: 'personal' } }" :class="{ active: route.name === 'shopping' && route.query.tab !== 'shared' }" :aria-current="route.name === 'shopping' && route.query.tab !== 'shared' ? 'page' : undefined"><span class="desktop-subnav-label">我的清單</span><svg class="desktop-subnav-check" viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></RouterLink>
            <RouterLink :to="{ name: 'shopping', query: { tab: 'shared' } }" :class="{ active: route.name === 'shopping' && route.query.tab === 'shared' }" :aria-current="route.name === 'shopping' && route.query.tab === 'shared' ? 'page' : undefined"><span class="desktop-subnav-label">共享清單</span><svg class="desktop-subnav-check" viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></RouterLink>
          </div>
          </Transition>
          <Transition name="shopping-subnav">
            <div v-if="item.name === 'settings' && isCurrent('settings')" class="desktop-shopping-nav" aria-label="設定子頁">
              <RouterLink :to="{ name: 'settings', hash: '#reminder-title' }" :class="{ active: route.name === 'settings' && route.hash === '#reminder-title' }" :aria-current="route.name === 'settings' && route.hash === '#reminder-title' ? 'location' : undefined"><span class="desktop-subnav-label">提醒設定</span></RouterLink>
              <RouterLink :to="{ name: 'settings', hash: '#spaces-title' }" :class="{ active: route.name === 'settings' && route.hash === '#spaces-title' }" :aria-current="route.name === 'settings' && route.hash === '#spaces-title' ? 'location' : undefined"><span class="desktop-subnav-label">空間管理</span></RouterLink>
              <RouterLink :to="{ name: 'item-management' }" :class="{ active: currentRoute.path === '/settings/items' || currentRoute.path.startsWith('/settings/items/') }" :aria-current="currentRoute.path === '/settings/items' || currentRoute.path.startsWith('/settings/items/') ? 'page' : undefined"><span class="desktop-subnav-label">用品管理</span></RouterLink>
              <Transition name="shopping-subnav">
                <div v-if="route.name === 'item-management' || route.name === 'item-category'" class="desktop-management-subnav" aria-label="用品管理分類">
                  <RouterLink :to="{ name: 'item-management', hash: '#system-categories-title' }" :class="{ active: managementSection === 'system' }"><span class="desktop-subnav-label">系統分類</span></RouterLink>
                  <RouterLink :to="{ name: 'item-management', hash: '#custom-categories-title' }" :class="{ active: managementSection === 'custom' }"><span class="desktop-subnav-label">自訂分類</span></RouterLink>
                </div>
              </Transition>
            </div>
          </Transition>
        </div>
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

// 底部漸層：高 ＝ 導覽列頂端（留白＋膠囊高）再往上 33px。顏色是淺暖灰（同 App 其他陰影 140,136,127），
// 最深 20%（膠囊中段以下固定）、膠囊頂端約 7%、頂端 0；照參考圖（Instagram 導覽列）量到的形狀，
// 強度依不透明膠囊校準（實測暗帶亮度約 224、與膠囊反差約 27，參考圖約 52）。z-index 低於遮罩（999）與導覽列（1000）。
// 寬度不限 390px：桌機寬螢幕時延伸到整個視窗，不會在欄位兩側留下色差。
.bottom-nav-fade {
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

.desktop-brand, .desktop-nav-dot, .desktop-shopping-nav, .desktop-subnav-arrow { display: none; }
.nav-group { display: flex; flex: 1; min-width: 0; }

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
  @media (min-width: 1024px) and (hover: hover) and (pointer: fine) { &:hover { background: t.$input-bg; } }
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
