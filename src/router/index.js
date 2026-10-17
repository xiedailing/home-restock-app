import { supportsScrollRestoration, pageScrollPositions, rememberPageScroll } from '../utils/pagePresentation'
import { createRouter, createWebHistory } from 'vue-router'

export const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { title: '登入', hideBottomNav: true } },
  // 首頁已併入我的用品（可用性測試 2026-10-15）；舊連結導向我的用品。
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
    meta: { title: '新增補貨紀錄', hideBottomNav: true },
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
    meta: { title: '用品詳情', hideBottomNav: true },
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
    meta: { title: '空間管理' },
  },
  {
    path: '/settings/spaces/new',
    name: 'add-space',
    component: () => import('../views/SettingsAddSpace.vue'),
    meta: { title: '新增空間' },
  },
  {
    path: '/settings/spaces/:spaceId',
    name: 'edit-space',
    component: () => import('../views/SettingsEditSpace.vue'),
    meta: { title: '編輯空間' },
  },
  { path: '/settings/items', name: 'item-management', component: () => import('../views/SettingsItemsView.vue'), meta: { title: '用品管理' } },
  { path: '/settings/items/:category', name: 'item-category', component: () => import('../views/SettingsItemCategory.vue'), meta: { title: '分類用品' } },
  { path: '/:pathMatch(.*)*', redirect: '/inventory' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
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
