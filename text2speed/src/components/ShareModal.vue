<script setup>
import { ref } from 'vue'

defineEmits(['close'])

const url = window.location.origin + window.location.pathname
const copied = ref(false)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    copied.value = false
  }
}

async function nativeShare() {
  if (!navigator.share) return copyLink()
  try {
    await navigator.share({ title: 'Text To Speed', text: 'Chuyển văn bản thành giọng nói ngay trong trình duyệt', url })
  } catch {
    /* người dùng huỷ */
  }
}

const targets = [
  { label: 'Facebook', href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { label: 'X', href: (u) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}` },
  { label: 'Telegram', href: (u) => `https://t.me/share/url?url=${encodeURIComponent(u)}` },
  { label: 'Email', href: (u) => `mailto:?subject=Text%20To%20Speed&body=${encodeURIComponent(u)}` },
]
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
    @click.self="$emit('close')"
  >
    <div class="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 p-6">
      <div class="flex items-start justify-between mb-4">
        <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">Chia sẻ Text To Speed</h2>
        <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="$emit('close')">✕</button>
      </div>

      <div class="flex gap-2 mb-4">
        <input
          :value="url"
          readonly
          class="flex-1 px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
        />
        <button
          class="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          @click="copyLink"
        >
          {{ copied ? 'Đã chép' : 'Sao chép' }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <a
          v-for="t in targets"
          :key="t.label"
          :href="t.href(url)"
          target="_blank"
          rel="noopener noreferrer"
          class="px-3 py-2 rounded-lg text-sm text-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          {{ t.label }}
        </a>
      </div>

      <button
        v-if="'share' in navigator"
        class="mt-3 w-full px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        @click="nativeShare"
      >
        Chia sẻ bằng ứng dụng khác…
      </button>
    </div>
  </div>
</template>
