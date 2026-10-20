<script setup>
import { loadRouteLocation, useRoute, useRouter } from 'vue-router'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import BottomNav from './components/BottomNav.vue'
import DesktopWallpaper from './components/DesktopWallpaper.vue'
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
// Desktop subpages keep the originating main page behind a native modal drawer.
const desktopMedia = window.matchMedia('(min-width: 1024px)')
const isDesktop = ref(desktopMedia.matches)
const desktopRoots = ['inventory', 'shopping', 'settings', 'item-management', 'item-category']
const isDrawerRoute = page => page.name && !desktopRoots.includes(page.name) && page.name !== 'login'
const rootFor = page => page.path.startsWith('/settings') ? '/settings'
  : page.name === 'notifications' ? '/shopping' : '/inventory'
const desktopBackground = shallowRef(desktopRoots.includes(route.name) ? { ...route } : router.resolve(rootFor(route)))
const drawerOpen = computed(() => isDesktop.value && isDrawerRoute(route))
const drawer = ref(null)
const mainViewRoute = computed(() => drawerOpen.value ? desktopBackground.value : route)
watch(() => drawerOpen.value && desktopBackground.value.fullPath, async path => {
  if (!path) return
  const resolved = await loadRouteLocation(router.resolve(path))
  if (desktopBackground.value.fullPath === path) desktopBackground.value = { ...resolved }
}, { immediate: true })
watch(() => route.fullPath, (_to, from) => {
  if (desktopRoots.includes(route.name)) desktopBackground.value = { ...route }
  if (isDesktop.value && isDrawerRoute(route) && from && desktopRoots.includes(router.resolve(from).name)) {
    desktopBackground.value = router.resolve(from)
  }
}, { flush: 'sync' })
watch(drawerOpen, async () => {
  if (!drawerOpen.value) {
    drawer.value?.close()
    return
  }
  await nextTick()
  // Read the latest route state after rendering; a queued open must not reopen
  // an empty dialog after navigation has already returned to a main page.
  if (drawerOpen.value && drawer.value?.isConnected && !drawer.value.open) drawer.value.showModal()
  else if (!drawerOpen.value && drawer.value?.open) drawer.value.close()
}, { immediate: true, flush: 'sync' })
function onDrawerBackdropClick(event) {
  if (event.target !== drawer.value || !drawerOpen.value) return
  const bounds = drawer.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDesktopDrawer()
}
let drawerClosing = false
async function closeDesktopDrawer() {
  if (!drawerOpen.value || drawerClosing) return
  drawerClosing = true
  const sourcePath = route.fullPath
  const targetPath = desktopBackground.value.fullPath
  try {
    if (drawer.value?.open && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await drawer.value.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
        { duration: 250, easing: 'ease-in', fill: 'none' }).finished
    }
    if (route.fullPath === sourcePath) await router.push(targetPath)
  } finally { drawerClosing = false }
}
function updateDesktopMedia() { isDesktop.value = desktopMedia.matches }
onMounted(() => desktopMedia.addEventListener('change', updateDesktopMedia))
onBeforeUnmount(() => desktopMedia.removeEventListener('change', updateDesktopMedia))

const pageTransition = ref('page-forward')
const animateSettingsPages = ref(false)
const animateItemsPages = ref(route.path === '/settings/items' || route.path.startsWith('/settings/items/'))
watch(() => route.path, (to, from) => {
  const navPaths = ['/inventory', '/shopping', '/settings']
  const mainPageFor = path => path === '/settings' || path.startsWith('/settings/') ? '/settings'
    : path === '/shopping' ? '/shopping'
    : path === '/inventory' || path.startsWith('/items/') || path.startsWith('/restock/') ? '/inventory' : null
  const switchingMainPages = (navPaths.includes(to) && navPaths.includes(from))
    || (isDesktop.value && navPaths.includes(to) && mainPageFor(from) && mainPageFor(to) !== mainPageFor(from))
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
  if (!animateSettingsPages.value || drawerOpen.value) return
  const bounds = element.getBoundingClientRect()
  element.style.position = isDesktop.value ? 'absolute' : 'fixed'
  element.style.top = `${-leavingPageScroll}px`
  element.style.left = isDesktop.value ? '0px' : `${bounds.left}px`
  element.style.width = isDesktop.value ? '100%' : `${bounds.width}px`
  element.style.boxSizing = 'border-box'
  element.style.minHeight = `${window.innerHeight + leavingPageScroll}px`
  element.style.zIndex = '2'
}

// Align the incoming settings section before it becomes visible. After the
// horizontal transition, router scrolling takes over at the same visual position.
function alignEnteringSection(element) {
  if (!isDesktop.value || route.name !== 'settings'
    || !['#reminder-title', '#spaces-title'].includes(route.hash)) return
  const heading = element.querySelector(route.hash)
  if (!heading) return
  const target = heading.getBoundingClientRect().top + window.scrollY - 24
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  element.style.position = 'relative'
  element.style.top = `${window.scrollY - Math.min(Math.max(0, target), maxScroll)}px`
}
function clearEnteringSection(element) {
  element.style.top = ''
  element.style.position = ''
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
    <DesktopWallpaper v-if="!hideBottomNav || drawerOpen" />
    <!-- 主內容呈現區 -->
    <main class="app-content" :class="{ 'without-nav': hideBottomNav, 'items-page-transition': animateSettingsPages && animateItemsPages && !drawerOpen }">
      <RouterView :route="mainViewRoute" v-slot="{ Component, route: pageRoute }">
        <Transition :name="pageTransition" :css="animateSettingsPages && !drawerOpen" @enter="alignEnteringSection" @after-enter="clearEnteringSection" @enter-cancelled="clearEnteringSection" @before-leave="freezeLeavingPage" @after-leave="clearLeavingPage" @leave-cancelled="clearLeavingPage">
          <div :key="pageRoute.path" class="page-view">
            <component :is="Component" />
          </div>
        </Transition>
      </RouterView>
    </main>

    <Teleport to="body">
      <dialog ref="drawer" class="desktop-page-drawer" aria-label="詳細內容" @cancel.prevent="closeDesktopDrawer" @click="onDrawerBackdropClick">
        <template v-if="drawerOpen">
          <RouterView v-slot="{ Component, route: drawerRoute }">
            <component :is="Component" :key="drawerRoute.path" />
          </RouterView>
        </template>
      </dialog>
    </Teleport>

    <!-- 共用底部導覽列 -->
    <BottomNav
      :navigation-route="mainViewRoute"
      v-if="!hideBottomNav || drawerOpen"
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
