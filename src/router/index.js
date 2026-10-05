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
  { path: '/:pathMatch(.*)*', redirect: '/home' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? '首頁'}｜補補`
})

export default router
