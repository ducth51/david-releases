<script setup>
import { onMounted, ref } from 'vue'
import { listDemos } from '../lib/data-source.js'

const emit = defineEmits(['use-text'])
const rows = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    rows.value = await listDemos()
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div
    class="mt-8 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden"
  >
    <div class="p-6">
      <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">Demo Samples</h2>

      <p v-if="loading" class="text-sm text-muted-foreground">Đang tải danh sách demo…</p>
      <p v-else-if="!rows.length" class="text-sm text-muted-foreground">
        Chưa có demo nào. Thêm cặp file <code>&lt;tên&gt;.txt</code> và <code>&lt;tên&gt;.wav</code> vào thư mục
        <code>server/demo/</code>.
      </p>

      <div v-else class="overflow-x-auto thin-scroll">
        <table class="w-full text-sm text-left">
          <thead class="text-xs uppercase text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="py-2 pr-4 font-medium">Text</th>
              <th class="py-2 pr-4 font-medium whitespace-nowrap">Speaker</th>
              <th class="py-2 font-medium">Sample</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.speaker"
              class="border-b border-gray-100 dark:border-gray-800 align-top"
            >
              <td
                class="py-3 pr-4 text-gray-700 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 min-w-[18rem]"
                title="Click to use this text"
                @click="emit('use-text', row)"
              >
                {{ row.text || '—' }}
              </td>
              <td class="py-3 pr-4 whitespace-nowrap text-gray-600 dark:text-gray-400">{{ row.speaker }}</td>
              <td class="py-3 min-w-[14rem]">
                <audio :src="row.wav" controls preload="none" class="w-full h-9">
                  Your browser does not support the audio element.
                </audio>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
