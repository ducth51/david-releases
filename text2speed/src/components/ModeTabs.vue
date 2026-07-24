<script setup>
import { onMounted, ref } from 'vue'
import { LANGUAGES, isStatic } from '../lib/data-source.js'

// Hiển thị ngay từ hằng số để thanh tab không nhảy layout
const languages = ref(LANGUAGES)

onMounted(async () => {
  if (isStatic) return // bản tĩnh không có back-end để hỏi
  try {
    const res = await fetch('/api/piper/languages')
    const data = await res.json()
    if (Array.isArray(data.languages) && data.languages.length) languages.value = data.languages
  } catch {
    /* giữ hằng số */
  }
})

const activeClass =
  'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium border-blue-200 dark:border-blue-800'
const idleClass =
  'bg-gray-100/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700'
</script>

<template>
  <div class="bg-white/50 dark:bg-gray-900/50 border-b border-gray-200/50 dark:border-gray-700/50">
    <div class="max-w-4xl mx-auto px-4 py-2">
      <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
        Chế độ / Mode
      </p>
      <nav class="flex flex-wrap items-center gap-2 text-sm" role="tablist" aria-label="Chọn chế độ TTS hoặc ASR">
        <RouterLink
          v-for="lang in languages"
          :key="lang.code"
          :to="lang.route"
          role="tab"
          class="px-3 py-2 rounded-lg transition-colors border border-transparent"
          :class="$route.path === lang.route ? activeClass : idleClass"
        >
          {{ lang.label }}
          <span class="font-medium text-gray-500 dark:text-gray-400">TTS</span>
        </RouterLink>

        <RouterLink
          to="/asr"
          role="tab"
          class="px-3 py-2 rounded-lg transition-colors border border-transparent"
          :class="$route.path === '/asr' ? activeClass : idleClass"
        >
          Nhận dạng giọng nói
          <span class="font-medium text-gray-500 dark:text-gray-400">ASR</span>
        </RouterLink>

        <RouterLink
          to="/log"
          role="tab"
          class="px-3 py-2 rounded-lg transition-colors border border-transparent"
          :class="$route.path === '/log' ? activeClass : idleClass"
        >
          Log
          <span class="font-medium text-gray-500 dark:text-gray-400">DEBUG</span>
        </RouterLink>
      </nav>
    </div>
  </div>
</template>
