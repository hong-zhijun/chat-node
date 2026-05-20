import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router.js'
import '@/assets/main.css'

// Theme init
const saved = localStorage.getItem('nodex-theme') || 'light'
if (saved === 'dark') document.documentElement.classList.add('dark')

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
