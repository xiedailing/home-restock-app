import { supportsScrollRestoration, pageScrollPositions, rememberPageScroll } from '../utils/pagePresentation'
import { createRouter, createWebHistory } from 'vue-router'

export const routes = [
  { path: '/notifications', name: 'notifications', component: () => import('../views/NotificationsView.vue'), meta: { title: '通知', hideBottomNav: true } },
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { title: '登入', hideBottomNav: true } },
  // 首頁已併入我的用品；保留 main 的新版導覽。
  { path: '/home', redirect: '/inventory' },
  {
    path: '/inventory',
    name: 'inventory',
    component: () => import('../views/InventoryView.vue'),
    meta: { title: '我的用品' },
  },
  {
    path: '/restock/new',
    name: 'restock-record',
    component: () => import('../views/RestockRecordView.vue'),
    meta: { title: '記錄補貨', hideBottomNav: true },
  },
  {
    path: '/items/new',
    name: 'add-item',
    component: () => import('../views/AddItemView.vue'),
    meta: { title: '新增用品', hideBottomNav: true },
  },
  {
    path: '/items/:id',
    name: 'item-detail',
    component: () => import('../views/ItemDetailView.vue'),
    meta: { title: '補貨明細', hideBottomNav: true },
  },
  {
    path: '/items/:id/records',
    name: 'item-records',
    component: () => import('../views/ItemRecordsView.vue'),
    meta: { title: '補貨紀錄', hideBottomNav: true },
  },
  {
    path: '/shopping',
    name: 'shopping',
    component: () => import('../views/ShoppingView.vue'),
    meta: { title: '購買清單' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { title: '設定' },
  },
  {
    path: '/settings/profile',
    name: 'edit-profile',
    component: () => import('../views/SettingsEditProfile.vue'),
    meta: { title: '編輯個人檔案', hideBottomNav: true },
  },
  {
    path: '/settings/spaces',
    name: 'spaces',
    component: () => import('../views/SettingsSpacesView.vue'),
    meta: { title: '空間管理', hideBottomNav: true },
  },
  {
    path: '/settings/spaces/new',
    name: 'add-space',
    component: () => import('../views/SettingsAddSpace.vue'),
    meta: { title: '新增空間', hideBottomNav: true },
  },
  {
    path: '/settings/spaces/:spaceId',
    name: 'edit-space',
    component: () => import('../views/SettingsEditSpace.vue'),
    meta: { title: '編輯空間', hideBottomNav: true },
  },
  { path: '/settings/items', name: 'item-management', component: () => import('../views/SettingsItemsView.vue'), meta: { title: '用品管理', hideBottomNav: true } },
  { path: '/settings/items/:category', name: 'item-category', component: () => import('../views/SettingsItemCategory.vue'), meta: { title: '分類用品', hideBottomNav: true } },
  { path: '/:pathMatch(.*)*', redirect: '/inventory' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  async scrollBehavior(to, from, savedPosition) {
    if (window.matchMedia('(min-width: 1024px)').matches && to.name === 'settings'
      && ['#reminder-title', '#spaces-title'].includes(to.hash)) {
      if (['item-management', 'item-category'].includes(from.name)) {
        // Wait for the actual page transition rather than measuring a moving heading.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const page = document.getElementById(to.hash.slice(1))?.closest('.page-view')
        const transitions = page?.getAnimations().filter(animation => animation.effect?.target === page) ?? []
        await Promise.allSettled(transitions.map(animation => animation.finished))
        // A newer navigation cancels this pending section scroll.
        if (router.currentRoute.value.fullPath !== to.fullPath) return false
      }
      return { el: to.hash, top: 24, behavior: from.path !== to.path || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }
    }
    if (window.matchMedia('(min-width: 1024px)').matches && to.name === 'item-management'
      && ['#system-categories-title', '#custom-categories-title'].includes(to.hash)) {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const page = document.getElementById(to.hash.slice(1))?.closest('.page-view')
      await Promise.allSettled((page?.getAnimations() ?? []).map(animation => animation.finished))
      if (router.currentRoute.value.fullPath !== to.fullPath) return false
      const behavior = from.path === to.path && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant'
      return to.hash === '#system-categories-title' ? { top: 0, behavior } : { el: to.hash, top: 24, behavior }
    }
    // ShoppingView owns notification expansion/scroll and consumes its one-shot query.
    if (to.name === 'shopping' && from.name === 'shopping'
      && (to.query.notificationItem || from.query.notificationItem)) return false
    // Desktop subpages scroll inside their drawer; keep the background viewport.
    const mainPages = ['inventory', 'shopping', 'settings', 'item-management', 'item-category']
    if (window.matchMedia('(min-width: 1024px)').matches
      && to.name && from.name && to.name !== 'login' && from.name !== 'login'
      && (!mainPages.includes(to.name) || !mainPages.includes(from.name))) return false

    if (supportsScrollRestoration(to.path) && supportsScrollRestoration(from.path)) {
      const target = savedPosition || { top: pageScrollPositions.get(to.path) || 0 }
      // Vue Router 已在 nextTick 後呼叫 scrollBehavior，直接恢復以免多繪製一幀錯誤位置。
      return { ...target, behavior: 'instant' }
    }
    return { top: 0 }
  },
})

router.beforeEach((to, from) => { rememberPageScroll(from.path, window.scrollY) })

router.afterEach((to, _from, failure) => {
  // 被取消的導覽（例如新增用品的放棄確認）不更新標題。
  if (failure) return
  document.title = `${to.meta.title ?? '我的用品'}｜補補`
})

export default router
