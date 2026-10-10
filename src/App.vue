<!-- <script setup>
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <HelloWorld />
</template> -->

<!-- src/App.vue -->
<script setup>
import { useRoute, useRouter } from 'vue-router'
import { ref, watch } from 'vue'
import BottomNav from './components/BottomNav.vue'
import { useItemsStore } from './stores/items'

const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()
const pageTransition = ref('page-forward')
const animateSettingsPages = ref(false)
const animateItemsPages = ref(route.path === '/settings/items' || route.path.startsWith('/settings/items/'))
const isItemsPage = path => path === '/settings/items' || path.startsWith('/settings/items/')
const isSettingsPage = path => path === '/settings' || path.startsWith('/settings/')
watch(() => route.path, (to, from) => {
  animateSettingsPages.value = isSettingsPage(to) && isSettingsPage(from)
  animateItemsPages.value = isItemsPage(to) || isItemsPage(from)
  const toDepth = to.split('/').filter(Boolean).length
  const fromDepth = from.split('/').filter(Boolean).length
  const goingBack = toDepth < fromDepth
  pageTransition.value = goingBack ? 'page-back' : 'page-forward'
}, { flush: 'sync' })

// 在「我的用品」篩選某個空間時預帶該空間；其他頁面由新增頁預設為「個人」。
const handlePlusClick = () => {
  const spaceId = route.name === 'inventory' ? itemsStore.inventorySpaceId : null
  router.push({ name: 'add-item', query: spaceId ? { space: spaceId } : {} })
}
</script>

<template>
  <div class="app-container">
    <!-- 主內容呈現區 -->
    <main class="app-content" :class="{ 'without-nav': route.meta.hideBottomNav, 'items-page-transition': animateSettingsPages && animateItemsPages }">
      <RouterView v-slot="{ Component, route: pageRoute }">
        <Transition :name="pageTransition" :css="animateSettingsPages">
          <div :key="pageRoute.path" class="page-view">
            <component :is="Component" />
          </div>
        </Transition>
      </RouterView>
    </main>

    <!-- 共用底部導覽列 -->
    <BottomNav 
      v-if="!route.meta.hideBottomNav"
      @click-plus="handlePlusClick" 
    />
  </div>
</template>

<style scoped>
.app-container {
  padding: 0 16px 34px;
}

.app-content {
  /* 導覽列高 82px，加上內容與導覽列間距 24px。 */
  padding-bottom: 106px;
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
