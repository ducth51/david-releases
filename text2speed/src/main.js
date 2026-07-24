import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import { logInfo, logError } from './lib/logger.js'
import './style.css'

logInfo('app', `Khởi động v${__APP_VERSION__}`, {
  version: __APP_VERSION__,
  buildTime: __BUILD_TIME__,
  origin: location.origin,
  modelBase: import.meta.env.VITE_MODEL_BASE_URL || '(dùng API cục bộ)',
  userAgent: navigator.userAgent,
  online: navigator.onLine,
  storageAvailable: typeof caches !== 'undefined',
})

window.addEventListener('error', (e) =>
  logError('window', 'Lỗi không bắt được', { message: e.message, filename: e.filename, lineno: e.lineno })
)
window.addEventListener('unhandledrejection', (e) =>
  logError('window', 'Promise bị từ chối', { reason: String(e.reason) })
)
window.addEventListener('offline', () => logError('mạng', 'Mất kết nối'))
window.addEventListener('online', () => logInfo('mạng', 'Có kết nối trở lại'))

createApp(App).use(router).mount('#app')
