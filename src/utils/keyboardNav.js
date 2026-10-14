// 焦點框只在鍵盤（Tab）操作時顯示：按 Tab 加上 keyboard-nav，任何滑鼠／觸控按下就移除。
// 搭配 assets/scss/_focus.scss。部分瀏覽器（如 Mac）對 :focus-visible 的判斷不一致，用這個 class 統一行為。
const CLASS_NAME = 'keyboard-nav'

export function setupKeyboardNav(root = document.documentElement) {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') root.classList.add(CLASS_NAME)
  }, true)
  window.addEventListener('pointerdown', () => root.classList.remove(CLASS_NAME), true)
}
