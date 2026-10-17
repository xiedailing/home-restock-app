<script setup>
import { useRoute, useRouter } from 'vue-router'
import { provide, ref, watch } from 'vue'
import BottomNav from './components/BottomNav.vue'
import AddSpaceSheet from './components/add-item/AddSpaceSheet.vue'
import AppToast from './components/AppToast.vue'
import { useToast } from './composables/useToast'
import { useBottomNavHidden } from './composables/useBottomNav'
import { supportsPagePresentation, leavingPageScroll } from './utils/pagePresentation'
import { useItemsStore } from './stores/items'
import { useSharedNotificationsStore } from './stores/sharedNotifications'

const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()
const notifications = useSharedNotificationsStore()
if (import.meta.env.DEV) notifications.seedPreviewHistory(itemsStore.spaces, itemsStore.items)
watch(() => itemsStore.itemsWithStatus, () => {
  try { notifications.publishRestockReminders() }
  catch (error) { console.error('[notifications] Reminder generation failed', error) }
}, { deep: true, immediate: true })
const { toast, showToast, runUndo } = useToast()
// 補貨頁記錄成功後會回到上一頁，Toast（含復原）要跟得過去，所以提供 App 層的 Toast。
provide('appToast', { showToast })
const hideBottomNav = useBottomNavHidden()
const pageTransition = ref('page-forward')
const animateSettingsPages = ref(false)
const animateItemsPages = ref(route.path === '/settings/items' || route.path.startsWith('/settings/items/'))
watch(() => route.path, (to, from) => {
  const navPaths = ['/inventory', '/shopping', '/settings']
  const switchingMainPages = navPaths.includes(to) && navPaths.includes(from)
  const detailId = from.match(/^\/items\/([^/]+)$/)?.[1]
  const returningAfterDeletion = to === '/inventory' && detailId && !itemsStore.getItem(decodeURIComponent(detailId))
  const detailToShopping = !!detailId && from !== '/items/new' && to === '/shopping'
  const avatarToProfile = to === '/settings/profile' && typeof route.query.returnTo === 'string'
  const animate = !switchingMainPages && !returningAfterDeletion && !detailToShopping && !avatarToProfile && supportsPagePresentation(to) && supportsPagePresentation(from)
  animateSettingsPages.value = animate
  animateItemsPages.value = animate
  const toDepth = to.split('/').filter(Boolean).length
  const fromDepth = from.split('/').filter(Boolean).length
  // 新增用品可從不同網址層級進入，不能用網址深度判斷前進／返回。
  const goingBack = to === '/items/new' ? false
    : from === '/items/new' ? true
    : navPaths.includes(to) && navPaths.includes(from)
      ? navPaths.indexOf(to) < navPaths.indexOf(from)
      : toDepth < fromDepth
  pageTransition.value = goingBack ? 'page-back' : 'page-forward'
}, { flush: 'sync' })

function freezeLeavingPage(element) {
  if (!animateSettingsPages.value) return
  element.style.position = 'fixed'
  element.style.top = `${-leavingPageScroll}px`
  element.style.left = '0'
  element.style.width = '100%'
  element.style.boxSizing = 'border-box'
  element.style.minHeight = `${window.innerHeight + leavingPageScroll}px`
  element.style.zIndex = '2'
}

function clearLeavingPage(element) {
  for (const key of ['position', 'top', 'left', 'width', 'boxSizing', 'minHeight', 'zIndex']) element.style[key] = ''
}

// 「＋」選單的「記錄補貨」。在「我的用品」篩選某個空間時預帶該空間；其他頁面由補貨頁預設為「個人」。
const handleAddRecord = () => {
  const spaceId = route.name === 'inventory' ? itemsStore.inventorySpaceId : null
  router.push({ name: 'restock-record', query: spaceId ? { space: spaceId } : {} })
}

// 新增空間：建立後切到新空間並回到我的用品。
const addSpaceOpen = ref(false)
function onSpaceCreated(space) {
  itemsStore.inventorySpaceId = space.id
  if (route.name !== 'inventory') router.push({ name: 'inventory' })
  showToast('已成功新增空間')
}
</script>

<template>
  <div class="app-container">
    <!-- 主內容呈現區 -->
    <main class="app-content" :class="{ 'without-nav': hideBottomNav, 'items-page-transition': animateSettingsPages && animateItemsPages }">
      <RouterView v-slot="{ Component, route: pageRoute }">
        <Transition :name="pageTransition" :css="animateSettingsPages" @before-leave="freezeLeavingPage" @after-leave="clearLeavingPage" @leave-cancelled="clearLeavingPage">
          <div :key="pageRoute.path" class="page-view">
            <component :is="Component" />
          </div>
        </Transition>
      </RouterView>
    </main>

    <!-- 共用底部導覽列 -->
    <BottomNav
      v-if="!hideBottomNav"
      @add-record="handleAddRecord"
      @add-space="addSpaceOpen = true"
    />
    <AddSpaceSheet :open="addSpaceOpen" @close="addSpaceOpen = false" @created="onSpaceCreated" />
    <AppToast :toast="toast" @undo="runUndo" />
  </div>
</template>

<style scoped>
.app-container {
  padding: 0 16px 34px;
  /* 購買清單的群組抽屜用負邊距讓卡片陰影不被裁（.group-drawer-content），會比視窗寬約 8px；
     手機 Safari 因此多出橫向捲動並縮放頁面，固定在底部的導覽列跟著跳動。
     只在這一層裁掉超出視窗的部分（clip 不產生捲動容器，sticky 照常），卡片陰影仍可以畫到視窗邊緣。 */
  overflow-x: clip;
}

.app-content {
  /* 導覽列高 68px（$bottom-nav-height），加上內容與導覽列間距 24px。 */
  padding-bottom: 92px;
  display: grid;
}
/* 只在切頁動畫期間裁切滑出畫面的頁面；靜止時不裁切，各頁卡片陰影才不會被切掉。 */
.app-content:has(> .page-forward-enter-active, > .page-forward-leave-active, > .page-back-enter-active, > .page-back-leave-active) {
  overflow-x: clip;
}
.page-view { grid-area: 1 / 1; min-width: 0; }

/* 用品管理的切頁包含左右留白，內容仍維持原本的寬度與位置。 */
.app-content.items-page-transition {
  margin-inline: -16px;
}
.items-page-transition > .page-view {
  padding-inline: 16px;
  background: var(--bs-body-bg);
}
.items-page-transition > .page-forward-enter-active,
.items-page-transition > .page-back-enter-active { position: relative; z-index: 1; }

.app-content.without-nav {
  padding-bottom: 0;
}
.page-forward-enter-active, .page-forward-leave-active,
.page-back-enter-active, .page-back-leave-active {
  transition: transform .5s ease;
}
.page-forward-enter-from, .page-back-leave-to { transform: translateX(100%); }
.page-forward-leave-to, .page-back-enter-from { transform: translateX(-100%); }
.page-forward-leave-active, .page-back-leave-active { pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .page-forward-enter-active, .page-forward-leave-active,
  .page-back-enter-active, .page-back-leave-active { transition: none; }
}
</style>
