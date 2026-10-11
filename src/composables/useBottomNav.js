// 頁面暫時隱藏 Bottom Nav（如首頁多選，specs/004 FR-405）；路由 meta.hideBottomNav 仍為固定設定。
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

export const bottomNavHiddenByPage = ref(false)

export function useBottomNavHidden() {
  const route = useRoute()
  return computed(() => !!route.meta.hideBottomNav || bottomNavHiddenByPage.value)
}
