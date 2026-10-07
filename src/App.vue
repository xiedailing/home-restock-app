<!-- <script setup>
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <HelloWorld />
</template> -->

<!-- src/App.vue -->
<script setup>
import { useRoute } from 'vue-router'
import { ref, watch } from 'vue'
import BottomNav from './components/BottomNav.vue'

const route = useRoute()
const pageTransition = ref('page-forward')
const animateSettingsPages = ref(false)
const isSettingsPage = path => path === '/settings' || path.startsWith('/settings/')
watch(() => route.path, (to, from) => {
  animateSettingsPages.value = isSettingsPage(to) && isSettingsPage(from)
  const toDepth = to.split('/').filter(Boolean).length
  const fromDepth = from.split('/').filter(Boolean).length
  const goingBack = toDepth < fromDepth
  pageTransition.value = goingBack ? 'page-back' : 'page-forward'
}, { flush: 'sync' })

const handlePlusClick = () => {
  alert('點擊了中央新增按鈕！')
}
</script>

<template>
  <div class="app-container">
    <!-- 主內容呈現區 -->
    <main class="app-content" :class="{ 'without-nav': route.meta.hideBottomNav }">
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
  overflow-x: clip;
}
.page-view { grid-area: 1 / 1; min-width: 0; }

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
