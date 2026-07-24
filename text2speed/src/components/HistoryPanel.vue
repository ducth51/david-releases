<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { listHistory, removeHistory, clearHistory } from '../lib/history.js'

defineEmits(['close'])

const items = ref([])
const urls = new Map()

function urlFor(item) {
  if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.audio))
  return urls.get(item.id)
}

async function refresh() {
  items.value = await listHistory()
}

async function remove(id) {
  await removeHistory(id)
  revoke(id)
  await refresh()
}

async function clearAll() {
  await clearHistory()
  urls.forEach((u) => URL.revokeObjectURL(u))
  urls.clear()
  await refresh()
}

function revoke(id) {
  const u = urls.get(id)
  if (u) URL.revokeObjectURL(u)
  urls.delete(id)
}

function download(item) {
  const a = document.createElement('a')
  a.href = urlFor(item)
  a.download = `${item.model || 'audio'}-${item.id.slice(0, 8)}.wav`
  a.click()
}

const formatTime = (ts) => new Date(ts).toLocaleString('vi-VN')

onMounted(refresh)
onBeforeUnmount(() => {
  urls.forEach((u) => URL.revokeObjectURL(u))
  urls.clear()
})
</script>

<template>
  <div class="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm" @click.self="$emit('close')">
    <aside class="w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">Lịch sử</h2>
        <div class="flex items-center gap-3">
          <button
            v-if="items.length"
            class="text-sm text-red-600 dark:text-red-400 hover:underline"
            @click="clearAll"
          >
            Xoá tất cả
          </button>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="$emit('close')">✕</button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto thin-scroll p-4 space-y-3">
        <p v-if="!items.length" class="text-sm text-muted-foreground text-center py-10">
          Chưa có bản ghi nào. Hãy tạo audio để lưu vào lịch sử.
        </p>

        <div
          v-for="item in items"
          :key="item.id"
          class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3"
        >
          <div class="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span class="font-medium text-gray-700 dark:text-gray-300">{{ item.model }}</span>
            <span>{{ formatTime(item.createdAt) }}</span>
          </div>
          <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-2">{{ item.text }}</p>
          <audio :src="urlFor(item)" controls class="w-full h-9"></audio>
          <div class="flex gap-2 mt-2">
            <button
              class="px-3 py-1 rounded-lg text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              @click="download(item)"
            >
              Tải về
            </button>
            <button
              class="px-3 py-1 rounded-lg text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              @click="remove(item.id)"
            >
              Xoá
            </button>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>
