import { createRouter, createWebHistory } from 'vue-router'
import TtsView from './views/TtsView.vue'
import AsrView from './views/AsrView.vue'

const routes = [
  { path: '/', name: 'vi', component: TtsView, props: { lang: 'vi' } },
  { path: '/en', name: 'en', component: TtsView, props: { lang: 'en' } },
  { path: '/id', name: 'id', component: TtsView, props: { lang: 'id' } },
  { path: '/ms', name: 'ms', component: TtsView, props: { lang: 'ms' } },
  { path: '/asr', name: 'asr', component: AsrView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export default createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
