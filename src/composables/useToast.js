// 頁面層的單一 Toast：新的取代舊的，舊的不能再復原（specs/003 DET-07）。
import { onUnmounted, ref } from 'vue'
import { UNDO_DURATION_MS } from '../stores/items'

export function useToast() {
  const toast = ref(null) // { message, undo }
  let timer = null

  function hideToast() {
    clearTimeout(timer)
    timer = null
    toast.value = null
  }

  // undo 為選填；有傳入時 Toast 顯示「復原」。
  function showToast(message, undo = null) {
    clearTimeout(timer)
    toast.value = { message, undo }
    timer = setTimeout(hideToast, UNDO_DURATION_MS)
  }

  function runUndo() {
    const undo = toast.value?.undo
    hideToast()
    undo?.()
  }

  // 離開頁面即失效。
  onUnmounted(hideToast)

  return { toast, showToast, hideToast, runUndo }
}
