// 頁面層的單一 Toast：新的取代舊的，舊的不能再復原（specs/003 DET-07）。
import { onUnmounted, ref } from 'vue'
import { UNDO_DURATION_MS } from '../stores/items'

export function useToast() {
  const toast = ref(null) // { message, undo, actionLabel, pause, resume }
  let timer = null
  let deadline = 0
  let remaining = 0

  function hideToast() {
    clearTimeout(timer)
    timer = null
    toast.value = null
  }

  // 觸碰、滑鼠停留或聚焦在 Toast 上時暫停倒數，離開後以剩餘時間繼續。
  function pauseToast() {
    if (!timer) return
    clearTimeout(timer)
    timer = null
    remaining = Math.max(deadline - Date.now(), 0)
  }
  function resumeToast() {
    if (timer || !toast.value) return
    deadline = Date.now() + remaining
    timer = setTimeout(hideToast, remaining)
  }

  // undo 為選填；有傳入時 Toast 顯示按鈕，文字預設「復原」，可改成「查看」等（specs/004 FR-403）。
  function showToast(message, undo = null, actionLabel = '復原') {
    clearTimeout(timer)
    toast.value = { message, undo, actionLabel, pause: pauseToast, resume: resumeToast }
    remaining = UNDO_DURATION_MS
    deadline = Date.now() + remaining
    timer = setTimeout(hideToast, remaining)
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
