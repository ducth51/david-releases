<script setup>
import AppHeader from './components/AppHeader.vue'
import ModeTabs from './components/ModeTabs.vue'
</script>

<template>
  <div
    class="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-100 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-800 transition-colors duration-300"
  >
    <AppHeader />
    <ModeTabs />
    <RouterView />
    <footer class="max-w-4xl mx-auto px-4 py-8 text-center text-xs text-muted-foreground">
      Mọi xử lý diễn ra ngay trên máy bạn — văn bản không được gửi lên máy chủ.
    </footer>
  </div>
</template>
