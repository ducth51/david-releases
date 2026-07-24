<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DemoSamples from '../components/DemoSamples.vue'
import { addHistory } from '../lib/history.js'
import { listModels } from '../lib/data-source.js'
import { ingest, logInfo, logError } from '../lib/logger.js'

const props = defineProps({ lang: { type: String, default: 'vi' } })

const text = ref('')
const models = ref([])
const selectedModel = ref('None')
const voices = ref([{ id: 0, name: 'Voice 1' }])
const selectedVoice = ref(0)
const speed = ref(1)

const status = ref('idle') // idle | loading | ready | generating | error
const progress = ref(0)
const errorMessage = ref('')
const audioUrl = ref('')
const copied = ref(false)

let worker = null

const wordCount = computed(() => (text.value.trim() ? text.value.trim().split(/\s+/).length : 0))
const charCount = computed(() => text.value.length)
const canGenerate = computed(() => status.value === 'ready' && text.value.trim().length > 0)

/* ------------------------- nạp danh sách model ------------------------- */

async function loadModels() {
  try {
    const list = await listModels(props.lang)
    models.value = list
    selectedModel.value = list[0] ?? 'None'
  } catch {
    models.value = []
    selectedModel.value = 'None'
  }
}

/* ------------------------------- worker -------------------------------- */

function disposeWorker() {
  worker?.terminate()
  worker = null
}

function initWorker(model) {
  disposeWorker()
  revokeAudio()
  if (!model || model === 'None') {
    status.value = 'idle'
    return
  }

  status.value = 'loading'
  progress.value = 0
  errorMessage.value = ''

  logInfo('tts', `Khởi tạo worker cho model "${model}"`, { lang: props.lang })
  worker = new Worker(new URL('../workers/tts-worker.js', import.meta.url), { type: 'module' })
  worker.addEventListener('message', onWorkerMessage)
  worker.addEventListener('error', (e) =>
    logError('tts', 'Worker sập', { message: e.message, filename: e.filename, lineno: e.lineno })
  )
  worker.postMessage({ type: 'init', model, lang: props.lang })
}

const streamedChunks = []

function onWorkerMessage(event) {
  const msg = event.data

  // Log phát từ trong Worker — nạp vào cùng store để tab Log thấy được
  if (msg.status === 'log') return ingest(msg.entry)

  switch (msg.status) {
    case 'progress':
      progress.value = msg.progress ?? 0
      break

    case 'ready':
      voices.value = msg.voices?.length ? msg.voices : [{ id: 0, name: 'Voice 1' }]
      selectedVoice.value = voices.value[0].id
      progress.value = 100
      status.value = 'ready'
      break

    case 'stream':
      streamedChunks.push(msg.chunk)
      break

    case 'preview':
      setAudio(msg.audio)
      break

    case 'complete':
      status.value = 'ready'
      if (msg.audio) {
        setAudio(msg.audio)
        addHistory({ text: text.value, model: selectedModel.value, audio: msg.audio, duration: msg.duration }).catch(
          () => {}
        )
      }
      break

    case 'chunk-error':
      errorMessage.value = `Bỏ qua một câu do lỗi: ${msg.data}`
      break

    case 'error':
      status.value = 'error'
      errorMessage.value = msg.data || 'Đã xảy ra lỗi không xác định'
      logError('tts', 'Worker báo lỗi', { message: msg.data, model: selectedModel.value })
      break
  }
}

/* -------------------------------- audio -------------------------------- */

function revokeAudio() {
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  audioUrl.value = ''
}

function setAudio(blob) {
  revokeAudio()
  audioUrl.value = URL.createObjectURL(blob)
}

function generate() {
  if (!canGenerate.value) return
  streamedChunks.length = 0
  revokeAudio()
  status.value = 'generating'
  errorMessage.value = ''
  worker.postMessage({ type: 'generate', text: text.value, voice: selectedVoice.value, speed: speed.value })
}

function downloadAudio() {
  if (!audioUrl.value) return
  const a = document.createElement('a')
  a.href = audioUrl.value
  a.download = `${selectedModel.value}-${Date.now()}.wav`
  a.click()
}

async function copyText() {
  if (!text.value) return
  try {
    await navigator.clipboard.writeText(text.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    copied.value = false
  }
}

function useDemo(row) {
  text.value = row.text
  if (models.value.includes(row.speaker)) selectedModel.value = row.speaker
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/* ------------------------------- vòng đời ------------------------------ */

watch(selectedModel, (model) => initWorker(model))
watch(
  () => props.lang,
  async () => {
    await loadModels()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  disposeWorker()
  revokeAudio()
})
</script>

<template>
  <main class="container mx-auto px-4 pt-6 pb-4 max-w-4xl">
    <div
      class="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden"
    >
      <div class="p-6 space-y-6">
        <!-- Ô nhập văn bản -->
        <div class="space-y-2">
          <div class="relative">
            <textarea
              v-model="text"
              rows="7"
              placeholder="Type or paste your text here..."
              class="w-full resize-y rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 px-4 py-3 pr-12 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 thin-scroll"
            ></textarea>
            <button
              type="button"
              aria-label="Copy text"
              title="Copy text"
              class="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              @click="copyText"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>

          <div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Words: <strong class="text-gray-700 dark:text-gray-300">{{ wordCount }}</strong></span>
            <span>Characters: <strong class="text-gray-700 dark:text-gray-300">{{ charCount }}</strong></span>
            <span v-if="copied" class="text-green-600 dark:text-green-400">Đã sao chép</span>
          </div>
        </div>

        <!-- Chọn model / giọng / tốc độ -->
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model:</label>
            <select
              v-model="selectedModel"
              class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="None">None</option>
              <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>

          <div v-if="voices.length > 1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Giọng:</label>
            <select
              v-model.number="selectedVoice"
              class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option v-for="v in voices" :key="v.id" :value="v.id">{{ v.name }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tốc độ: {{ speed.toFixed(2) }}×
            </label>
            <input v-model.number="speed" type="range" min="0.5" max="2" step="0.05" class="w-full accent-purple-600" />
          </div>
        </div>

        <!-- Trạng thái nạp model -->
        <div v-if="status === 'loading'" class="space-y-2">
          <div class="flex justify-between text-sm text-muted-foreground">
            <span>Loading model</span>
            <span>{{ progress }}%</span>
          </div>
          <div class="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div class="h-full bg-purple-600 transition-all duration-200" :style="{ width: progress + '%' }"></div>
          </div>
        </div>

        <p v-if="errorMessage" class="text-sm text-red-600 dark:text-red-400">
          {{ errorMessage }}
        </p>
        <p v-else-if="status === 'idle'" class="text-sm text-muted-foreground">
          Chọn một model để bắt đầu. Model sẽ được tải về và lưu cache trong trình duyệt.
        </p>

        <!-- Hành động -->
        <div class="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            :disabled="!canGenerate"
            class="flex-1 px-5 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            @click="generate"
          >
            <span v-if="status === 'generating'">Đang tạo…</span>
            <span v-else>Generate</span>
          </button>

          <button
            type="button"
            :disabled="!audioUrl"
            class="px-5 py-3 rounded-xl font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="downloadAudio"
          >
            Download Audio
          </button>
        </div>

        <audio v-if="audioUrl" :src="audioUrl" controls autoplay class="w-full"></audio>
      </div>
    </div>

    <DemoSamples v-if="lang === 'vi'" @use-text="useDemo" />
  </main>
</template>
