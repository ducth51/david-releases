/**
 * Web Worker chạy suy luận Piper/VITS bằng onnxruntime-web.
 *
 * Giao thức message:
 *   → { type: 'init', model, lang }
 *   → { type: 'generate', text, voice, speed }
 *   → { type: 'preview', text, voice, speed }
 *   ← { status: 'progress' | 'ready' | 'stream' | 'complete' | 'preview' | 'error' }
 */
import * as ort from 'onnxruntime-web'
import { phonemize, warmUpEspeak } from '../lib/espeak.js'
import { cachedFetch } from '../lib/model-cache.js'
import { resolveModelUrls } from '../lib/data-source.js'
import { logInfo, logError } from '../lib/logger.js'
import { normalizeVietnamese, chunkText, cleanText } from '../lib/vietnamese.js'
import { RawAudio, concatAudio } from '../lib/audio.js'

// Không đặt biến → Vite tự phân giải .wasm/.mjs của onnxruntime-web (node_modules
// lúc dev, /assets sau khi build). Có đặt → tải từ CDN, giữ gói build nhẹ.
// Phiên bản trong URL phải khớp onnxruntime-web trong package.json.
if (import.meta.env.VITE_ORT_TTS_WASM_BASE) {
  ort.env.wasm.wasmPaths = import.meta.env.VITE_ORT_TTS_WASM_BASE
}
ort.env.logLevel = 'error'

const BOS = '^'
const EOS = '$'
const PAD = '_'

let tts = null

class PiperTts {
  constructor(config, session) {
    this.config = config
    this.session = session
  }

  static async from_pretrained(modelUrl, configUrl, onProgress) {
    const [modelRes, configRes] = await Promise.all([
      cachedFetch(modelUrl, onProgress),
      cachedFetch(configUrl),
    ])
    const [modelBuf, config] = await Promise.all([modelRes.arrayBuffer(), configRes.json()])
    const session = await ort.InferenceSession.create(modelBuf, {
      executionProviders: [{ name: 'wasm' }],
      graphOptimizationLevel: 'all',
    })
    return new PiperTts(config, session)
  }

  get sampleRate() {
    return this.config?.audio?.sample_rate ?? 22050
  }

  /** Danh sách speaker của model đa giọng. */
  getSpeakers() {
    if (!this.config || (this.config.num_speakers ?? 1) <= 1) {
      return [{ id: 0, name: 'Voice 1' }]
    }
    const map = this.config.speaker_id_map || {}
    return Object.entries(map)
      .sort((a, b) => a[1] - b[1])
      .map(([originalId, id]) => ({ id, name: `Voice ${id + 1}`, originalId }))
  }

  async textToPhonemes(text) {
    // Model kiểu "text": nạp thẳng ký tự, không cần espeak
    if (this.config.phoneme_type === 'text') {
      return [Array.from(text.normalize('NFD'))]
    }
    const voice = this.config.espeak?.voice || 'en-us'
    let ipa = await phonemize(text, voice)
    if (!ipa) return []

    // eSpeak bỏ dấu câu, nhưng Piper dùng chúng để ngắt nhịp — trả lại dấu cuối câu.
    const finalPunct = text.trim().match(/[.!?,;:]$/)?.[0]
    if (finalPunct && !ipa.endsWith(finalPunct)) ipa += finalPunct

    return [Array.from(ipa.normalize('NFD'))]
  }

  phonemesToIds(sentences) {
    const map = this.config?.phoneme_id_map
    if (!map) throw new Error('Model thiếu phoneme_id_map')

    const ids = []
    for (const phonemes of sentences) {
      ids.push(...map[BOS], ...map[PAD])
      for (const p of phonemes) {
        if (p in map) ids.push(...map[p], ...map[PAD])
      }
      ids.push(...map[EOS])
    }
    return ids
  }

  async synthesize(sentence, { speakerId = 0, lengthScale = 1, noiseScale = 0.667, noiseWScale = 0.8 } = {}) {
    const phonemes = await this.textToPhonemes(sentence)
    const ids = this.phonemesToIds(phonemes)
    if (!ids.length) return null

    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([noiseScale, lengthScale, noiseWScale]), [3]),
    }
    if ((this.config.num_speakers ?? 1) > 1) {
      feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(speakerId)]), [1])
    }

    const { output } = await this.session.run(feeds)
    return new RawAudio(new Float32Array(output.data), this.sampleRate)
  }

  /** Sinh audio theo từng câu, yield ngay khi có kết quả. */
  async *stream(text, options = {}) {
    const isVietnamese = (this.config.espeak?.voice || '').startsWith('vi')
    const prepared = isVietnamese
      ? normalizeVietnamese(cleanText(text)).toLowerCase()
      : cleanText(text)

    for (const sentence of chunkText(prepared)) {
      try {
        const audio = await this.synthesize(sentence, options)
        if (audio) yield { text: sentence, audio }
      } catch (err) {
        // Một câu hỏng không nên làm hỏng cả bản ghi — báo lên UI rồi đọc tiếp
        self.postMessage({
          status: 'chunk-error',
          text: sentence,
          data: err?.message || String(err),
        })
      }
    }
  }
}

/* ------------------------------------------------------------------ */

async function init(model, lang) {
  try {
    logInfo('tts-worker', `Nạp model "${model}" (${lang || 'vi'})`)
    const urls = await resolveModelUrls(lang || 'vi', model)
    logInfo('tts-worker', 'URL đã phân giải', urls)
    tts = await PiperTts.from_pretrained(
      urls.model,
      urls.config,
      (loaded, total) => {
        self.postMessage({ status: 'progress', loaded, total, progress: Math.round((loaded / total) * 100) })
      }
    )
    // Nạp sẵn eSpeak song song để lần Generate đầu không phải chờ biên dịch WASM
    warmUpEspeak().then((ok) =>
      ok ? logInfo('espeak', 'Đã nạp xong WASM') : logError('espeak', 'Nạp WASM thất bại')
    )
    const voices = tts.getSpeakers()
    logInfo('tts-worker', `Model sẵn sàng — ${voices.length} giọng, ${tts.sampleRate} Hz`)
    self.postMessage({ status: 'ready', voices, sampleRate: tts.sampleRate })
  } catch (err) {
    logError('tts-worker', 'Nạp model thất bại', { error: String(err), stack: err?.stack })
    self.postMessage({ status: 'error', data: err?.message || String(err) })
  }
}

self.addEventListener('error', (e) =>
  logError('tts-worker', 'Lỗi không bắt được', { message: e.message, filename: e.filename, lineno: e.lineno })
)
self.addEventListener('unhandledrejection', (e) =>
  logError('tts-worker', 'Promise bị từ chối', { reason: String(e.reason) })
)

self.addEventListener('message', async (event) => {
  const { type, text, voice, speed, model, lang } = event.data || {}

  if (type === 'init') return init(model, lang)

  if (!tts) {
    return self.postMessage({ status: 'error', data: 'Model chưa được nạp' })
  }

  const options = {
    speakerId: typeof voice === 'number' ? voice : parseInt(voice) || 0,
    lengthScale: 1 / (speed || 1),
  }

  if (type === 'preview') {
    try {
      for await (const { audio } of tts.stream(text, options)) {
        self.postMessage({ status: 'preview', audio: audio.toBlob() })
        break
      }
    } catch (err) {
      self.postMessage({ status: 'error', data: err?.message || String(err) })
    }
    return
  }

  if (type === 'generate') {
    const collected = []
    try {
      for await (const { text: sentence, audio } of tts.stream(text, options)) {
        self.postMessage({ status: 'stream', chunk: { audio: audio.toBlob(), text: sentence } })
        collected.push(audio)
      }
    } catch (err) {
      return self.postMessage({ status: 'error', data: err?.message || String(err) })
    }

    const merged = concatAudio(collected)
    self.postMessage({
      status: 'complete',
      audio: merged?.toBlob(),
      duration: merged ? merged.length / merged.sampling_rate : 0,
    })
  }
})
