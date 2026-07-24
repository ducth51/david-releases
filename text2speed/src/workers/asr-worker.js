/**
 * Web Worker nhận dạng giọng nói (Whisper) chạy hoàn toàn trong trình duyệt
 * bằng transformers.js. Model được lấy từ /api/model/asr/<tên-model>/.
 */
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = true
env.allowRemoteModels = true // fallback về Hugging Face nếu chưa có model cục bộ
env.localModelPath = '/api/model/asr/'

// Bản onnxruntime đi kèm transformers.js có file .wasm 26.8 MB — vượt giới hạn
// 25 MiB/file của Cloudflare Pages. Trỏ ra CDN đúng phiên bản mà transformers.js
// ghim (lệch phiên bản giữa .js và .wasm sẽ gây lỗi khởi tạo).
if (import.meta.env.VITE_ORT_WASM_BASE) {
  env.backends.onnx.wasm.wasmPaths = import.meta.env.VITE_ORT_WASM_BASE
}

let transcriber = null
let loadedModel = null

async function load(model) {
  if (transcriber && loadedModel === model) return transcriber
  transcriber = await pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p) => {
      if (p.status === 'progress') {
        self.postMessage({ status: 'progress', progress: Math.round(p.progress ?? 0), file: p.file })
      }
    },
  })
  loadedModel = model
  return transcriber
}

self.addEventListener('message', async (event) => {
  const { type, model, audio, language } = event.data || {}
  try {
    if (type === 'init') {
      await load(model)
      return self.postMessage({ status: 'ready' })
    }

    if (type === 'transcribe') {
      const asr = await load(model)
      const result = await asr(audio, {
        language: language || 'vietnamese',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
      })
      self.postMessage({ status: 'complete', text: result.text, chunks: result.chunks || [] })
    }
  } catch (err) {
    self.postMessage({ status: 'error', data: err?.message || String(err) })
  }
})
