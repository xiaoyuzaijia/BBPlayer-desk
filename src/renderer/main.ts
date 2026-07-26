// 字体
import '@fontsource-variable/roboto-flex'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/700.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'

import App from './App.vue'
import router from './router'
import { queryClient } from './lib/queryClient'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(VueQueryPlugin, { queryClient })
app.mount('#app')
