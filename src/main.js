import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import './assets/scss/main.scss'
import { setupKeyboardNav } from './utils/keyboardNav'
import { allowsNotificationDemo } from './utils/notificationDemoMode.js'
import { holdPresentationAccess } from './utils/presentationAccess.js'
import { recoverPresentationTransaction } from './utils/presentationTransaction.js'

async function boot() {
  if (new URLSearchParams(location.search).get('demoSetup') === '1') {
    if (!allowsNotificationDemo(location.origin)) throw new Error('此網址不允許初始化展示資料。')
    const { default: Setup } = await import('./components/PresentationSetup.vue')
    createApp(Setup).mount('#app')
    return
  }
  await holdPresentationAccess(async () => {
    // 等候重置獨占鎖釋放後才讀取／復原；復原也不能與其他啟動分頁交錯。
    if (allowsNotificationDemo(location.origin) && navigator.locks?.request) {
      await navigator.locks.request('bubu-presentation-recovery', () => recoverPresentationTransaction(localStorage))
    } else {
      let journal
      try { journal = localStorage.getItem('home-restock:v1:presentation-transaction') } catch { /* 維持既有無儲存空間降級 */ }
      if (journal) recoverPresentationTransaction(localStorage)
    }
    const [{ default: App }, { default: router }] = await Promise.all([import('./App.vue'), import('./router')])
    setupKeyboardNav()
    createApp(App).use(createPinia()).use(router).mount('#app')
  })
}
boot().catch(error => {
  document.getElementById('app').textContent = `無法載入補補：${error.message}。請恢復儲存空間後重新整理。`
})
