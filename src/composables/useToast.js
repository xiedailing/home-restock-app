// 頁面層的單一 Toast：新的取代舊的，舊的不能再復原（specs/003 DET-07）。
import { onUnmounted, ref } from 'vue'
import { UNDO_DURATION_MS } from '../stores/items'

export function useToast({ duration = UNDO_DURATION_MS, pauseOnInteraction = true } = {}) {
  const toast = ref(null) // { message, undo, actionLabel }
  let timer = null
  let remaining = duration
  let startedAt = 0
  const pauses = new Set()
  function resume(reason) {
    pauses.delete(reason)
    if (pauses.size || !toast.value || timer !== null) return
    startedAt = Date.now()
    timer = setTimeout(hideToast, remaining)
  }
  function pause(reason) {
    pauses.add(reason)
    if (timer === null) return
    remaining = Math.max(0, remaining - (Date.now() - startedAt))
    clearTimeout(timer)
    timer = null
  }

  function hideToast() {
    clearTimeout(timer)
    timer = null
    pauses.clear()
    toast.value = null
  }

  // undo 為選填；有傳入時 Toast 顯示按鈕，文字預設「復原」，可改成「查看」等（specs/004 FR-403）。
  function showToast(message, undo = null, actionLabel = '復原', variant = 'success') {
    hideToast()
    remaining = duration
    toast.value = { message, undo, actionLabel, variant, pause: pauseOnInteraction ? pause : null, resume: pauseOnInteraction ? resume : null }
    resume()
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
