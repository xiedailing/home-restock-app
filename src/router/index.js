import { createRouter, createWebHistory } from 'vue-router'

export const routes = [
  { path: '/', redirect: '/home' },
  {
    path: '/home',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: '首頁' },
  },
  {
    path: '/inventory',
    name: 'inventory',
    component: () => import('../views/InventoryView.vue'),
    meta: { title: '我的用品' },
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
    meta: { title: '個人檔案設定', hideBottomNav: true },
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
  { path: '/:pathMatch(.*)*', redirect: '/home' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to, _from, failure) => {
  // 被取消的導覽（例如新增用品的放棄確認）不更新標題。
  if (failure) return
  document.title = `${to.meta.title ?? '首頁'}｜補補`
})

export default router
