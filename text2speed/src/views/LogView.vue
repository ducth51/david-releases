<script setup>
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { subscribe, clearEntries, toText, logInfo } from '../lib/logger.js'

const all = shallowRef([])
const levelFilter = ref('all')
const query = ref('')
const copied = ref(false)
const expanded = ref(new Set())

const unsubscribe = subscribe((entries) => {
  all.value = entries.slice()
})
onBeforeUnmount(unsubscribe)

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return all.value.filter((e) => {
    if (levelFilter.value !== 'all' && e.level !== levelFilter.value) return false
    if (!q) return true
    return (
      e.message.toLowerCase().includes(q) ||
      e.source.toLowerCase().includes(q) ||
      JSON.stringify(e.data ?? '').toLowerCase().includes(q)
    )
  })
})

const counts = computed(() => ({
  all: all.value.length,
  info: all.value.filter((e) => e.level === 'info').length,
  warn: all.value.filter((e) => e.level === 'warn').length,
  error: all.value.filter((e) => e.level === 'error').length,
}))

function toggle(id) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}

async function copyAll() {
  try {
    await navigator.clipboard.writeText(toText())
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch {
    copied.value = false
  }
}

function download() {
  const blob = new Blob([toText()], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `text-to-speed-log-${Date.now()}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Tự chạy lại đúng chuỗi thao tác tải model để lỗi hiện ra trong log. */
async function runDiagnostics() {
  const { listModels, resolveModelUrls } = await import('../lib/data-source.js')
  logInfo('chẩn đoán', 'Bắt đầu kiểm tra tất cả model tiếng Việt')

  const models = await listModels('vi')
  logInfo('chẩn đoán', `Tìm thấy ${models.length} model`, { models })

  for (const name of models) {
    const urls = await resolveModelUrls('vi', name)
    const { loggedFetch } = await import('../lib/logger.js')
    try {
      const probe = await loggedFetch('chẩn đoán', urls.model, { headers: { Range: 'bytes=0-0' } }, `dò kích thước ${name}`)
      await probe.arrayBuffer()
    } catch {
      /* đã ghi log */
    }
  }
  logInfo('chẩn đoán', 'Xong. Bấm Generate để ghi tiếp log lúc tải thật.')
}

const levelStyle = {
  info: 'text-gray-600 dark:text-gray-300',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
}
const rowStyle = {
  info: '',
  warn: 'bg-amber-50/60 dark:bg-amber-900/10',
  error: 'bg-red-50/60 dark:bg-red-900/10',
}
</script>

<template>
  <main class="container mx-auto px-4 pt-6 pb-4 max-w-4xl">
    <div
      class="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden"
    >
      <div class="p-6 space-y-4">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">Log</h2>
            <p class="text-sm text-muted-foreground mt-1">
              Toàn bộ hoạt động của ứng dụng, gồm cả bên trong Web Worker.
            </p>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button
              class="px-3 py-1.5 rounded-lg text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              @click="runDiagnostics"
            >
              Chạy chẩn đoán
            </button>
            <button
              class="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              @click="copyAll"
            >
              {{ copied ? 'Đã chép' : 'Sao chép' }}
            </button>
            <button
              class="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              @click="download"
            >
              Tải .txt
            </button>
            <button
              class="px-3 py-1.5 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              @click="clearEntries"
            >
              Xoá
            </button>
          </div>
        </div>

        <div class="flex gap-2 flex-wrap items-center">
          <button
            v-for="lv in ['all', 'info', 'warn', 'error']"
            :key="lv"
            class="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
            :class="
              levelFilter === lv
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            "
            @click="levelFilter = lv"
          >
            {{ lv }} ({{ counts[lv] }})
          </button>
          <input
            v-model="query"
            placeholder="Lọc theo từ khoá…"
            class="flex-1 min-w-[10rem] px-3 py-1.5 rounded-lg text-sm bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <p v-if="!rows.length" class="text-sm text-muted-foreground py-6 text-center">
          Chưa có bản ghi nào khớp. Bấm <strong>Chạy chẩn đoán</strong>, hoặc sang tab TTS bấm Generate rồi quay lại đây.
        </p>

        <div v-else class="max-h-[32rem] overflow-y-auto thin-scroll rounded-xl border border-gray-200 dark:border-gray-700">
          <table class="w-full text-xs font-mono">
            <tbody>
              <tr
                v-for="e in rows"
                :key="e.id"
                class="border-b border-gray-100 dark:border-gray-800 last:border-0 align-top cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                :class="rowStyle[e.level]"
                @click="e.data !== undefined && toggle(e.id)"
              >
                <td class="py-1.5 px-2 whitespace-nowrap text-gray-400 dark:text-gray-500">
                  +{{ e.since }}ms
                </td>
                <td class="py-1.5 px-2 whitespace-nowrap" :class="levelStyle[e.level]">{{ e.source }}</td>
                <td class="py-1.5 px-2 w-full" :class="levelStyle[e.level]">
                  {{ e.message }}
                  <span v-if="e.data !== undefined && !expanded.has(e.id)" class="text-gray-400">▸</span>
                  <pre
                    v-if="expanded.has(e.id)"
                    class="mt-1 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-x-auto whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300"
                    >{{ JSON.stringify(e.data, null, 2) }}</pre
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="text-xs text-muted-foreground">
          Bấm vào dòng có dấu ▸ để xem chi tiết. Gặp lỗi thì bấm <strong>Sao chép</strong> rồi gửi lại toàn bộ.
        </p>
      </div>
    </div>
  </main>
</template>
