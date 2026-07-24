<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const models = ref([])
const selectedModel = ref('onnx-community/whisper-small')
const status = ref('idle') // idle | loading | ready | working | error
const progress = ref(0)
const errorMessage = ref('')
const transcript = ref('')
const chunks = ref([])
const recording = ref(false)
const audioUrl = ref('')

let worker = null
let recorder = null
let recordedParts = []

function ensureWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../workers/asr-worker.js', import.meta.url), { type: 'module' })
  worker.addEventListener('message', ({ data }) => {
    switch (data.status) {
      case 'progress':
        progress.value = data.progress
        break
      case 'ready':
        status.value = 'ready'
        break
      case 'complete':
        transcript.value = data.text?.trim() || ''
        chunks.value = data.chunks || []
        status.value = 'ready'
        break
      case 'error':
        errorMessage.value = data.data
        status.value = 'error'
        break
    }
  })
  return worker
}

/** Giải mã file audio về Float32 mono 16 kHz — định dạng Whisper yêu cầu. */
async function decodeToPcm(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
  const pcm =
    buffer.numberOfChannels > 1
      ? mixToMono(buffer)
      : buffer.getChannelData(0)
  await ctx.close()
  return pcm
}

function mixToMono(buffer) {
  const left = buffer.getChannelData(0)
  const right = buffer.getChannelData(1)
  const out = new Float32Array(left.length)
  for (let i = 0; i < left.length; i++) out[i] = (left[i] + right[i]) / 2
  return out
}

async function transcribe(blob) {
  status.value = 'working'
  errorMessage.value = ''
  transcript.value = ''
  chunks.value = []
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  audioUrl.value = URL.createObjectURL(blob)

  try {
    const pcm = await decodeToPcm(blob)
    ensureWorker().postMessage({ type: 'transcribe', model: selectedModel.value, audio: pcm, language: 'vietnamese' })
  } catch (err) {
    status.value = 'error'
    errorMessage.value = err?.message || String(err)
  }
}

function onFile(event) {
  const file = event.target.files?.[0]
  if (file) transcribe(file)
}

async function toggleRecording() {
  if (recording.value) {
    recorder?.stop()
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recorder = new MediaRecorder(stream)
    recordedParts = []
    recorder.ondataavailable = (e) => e.data.size && recordedParts.push(e.data)
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      recording.value = false
      if (recordedParts.length) transcribe(new Blob(recordedParts, { type: recorder.mimeType }))
    }
    recorder.start()
    recording.value = true
  } catch (err) {
    errorMessage.value = 'Không truy cập được micro: ' + (err?.message || err)
    status.value = 'error'
  }
}

async function copyTranscript() {
  if (transcript.value) await navigator.clipboard.writeText(transcript.value).catch(() => {})
}

const formatTs = (t) => {
  if (t == null) return '--:--'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

onMounted(async () => {
  try {
    const res = await fetch('/api/asr/models')
    const { models: list = [] } = await res.json()
    models.value = list
    if (list.length) selectedModel.value = list[0]
  } catch {
    models.value = []
  }
})

onBeforeUnmount(() => {
  worker?.terminate()
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
})
</script>

<template>
  <main class="container mx-auto px-4 pt-6 pb-4 max-w-4xl">
    <div
      class="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden"
    >
      <div class="p-6 space-y-6">
        <div>
          <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">Nhận dạng giọng nói</h2>
          <p class="text-sm text-muted-foreground mt-1">
            Ghi âm hoặc tải file lên — âm thanh được xử lý ngay trên máy bạn.
          </p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model:</label>
          <select
            v-model="selectedModel"
            class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
            <option v-if="!models.length" value="onnx-community/whisper-small">onnx-community/whisper-small</option>
            <option v-if="!models.length" value="onnx-community/whisper-base">onnx-community/whisper-base</option>
          </select>
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            class="flex-1 px-5 py-3 rounded-xl font-medium text-white shadow-lg transition-all"
            :class="recording ? 'bg-red-600 hover:bg-red-700' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'"
            @click="toggleRecording"
          >
            {{ recording ? 'Dừng ghi âm' : 'Ghi âm' }}
          </button>

          <label
            class="px-5 py-3 rounded-xl font-medium text-center cursor-pointer bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Tải file lên
            <input type="file" accept="audio/*" class="hidden" @change="onFile" />
          </label>
        </div>

        <div v-if="progress > 0 && progress < 100 && status !== 'ready'" class="space-y-2">
          <div class="flex justify-between text-sm text-muted-foreground">
            <span>Đang tải model</span><span>{{ progress }}%</span>
          </div>
          <div class="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div class="h-full bg-purple-600 transition-all" :style="{ width: progress + '%' }"></div>
          </div>
        </div>

        <p v-if="status === 'working'" class="text-sm text-muted-foreground">Đang nhận dạng…</p>
        <p v-if="status === 'error'" class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>

        <audio v-if="audioUrl" :src="audioUrl" controls class="w-full"></audio>

        <div v-if="transcript" class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-medium text-gray-800 dark:text-gray-200">Kết quả</h3>
            <button class="text-sm text-blue-600 dark:text-blue-400 hover:underline" @click="copyTranscript">
              Sao chép
            </button>
          </div>
          <p class="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-4 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {{ transcript }}
          </p>

          <div v-if="chunks.length" class="text-sm space-y-1 max-h-64 overflow-y-auto thin-scroll">
            <div v-for="(c, i) in chunks" :key="i" class="flex gap-3">
              <span class="font-mono text-xs text-muted-foreground pt-0.5 shrink-0">
                {{ formatTs(c.timestamp?.[0]) }}
              </span>
              <span class="text-gray-700 dark:text-gray-300">{{ c.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
