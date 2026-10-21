// 路由與頁面隱藏規則僅適用小尺寸排版；桌面保留側邊導覽。
import { computed, onScopeDispose, ref } from 'vue'
import { useRoute } from 'vue-router'

export const bottomNavHiddenByPage = ref(false)

export function useBottomNavHidden() {
  const route = useRoute()
  const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 1024px)') : null
  const isDesktop = ref(media?.matches ?? false)
  const update = event => { isDesktop.value = event.matches }
  media?.addEventListener('change', update)
  onScopeDispose(() => media?.removeEventListener('change', update))
  // 登入頁不屬於登入後的產品導覽，各尺寸均保持隱藏。
  return computed(() => route.name === 'login'
    || (!isDesktop.value && (!!route.meta.hideBottomNav || bottomNavHiddenByPage.value)))
}
