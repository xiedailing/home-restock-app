import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import './assets/scss/main.scss'
import { setupKeyboardNav } from './utils/keyboardNav'

setupKeyboardNav()
createApp(App).use(createPinia()).use(router).mount('#app')
