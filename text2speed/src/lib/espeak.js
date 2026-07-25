/**
 * Chuyển văn bản → IPA bằng eSpeak NG biên dịch sang WebAssembly.
 *
 * Gói `phonemizer` phổ biến chỉ nhúng dữ liệu tiếng Anh nên không đọc được
 * tiếng Việt; bản `espeak-ng` này kèm đủ bộ dữ liệu mọi ngôn ngữ.
 *
 * Module espeak là loại "chạy main rồi thoát" nên mỗi lần gọi phải tạo
 * instance mới. Phần đắt nhất là biên dịch WASM (~18 MB) — ta biên dịch một
 * lần rồi tái sử dụng WebAssembly.Module cho mọi lần gọi sau.
 */
import createEspeakModule from 'espeak-ng'
import bundledWasmUrl from 'espeak-ng/dist/espeak-ng.wasm?url'

// Bản deploy tĩnh trỏ ra CDN để không nhét 18 MB vào gói build;
// không đặt biến thì dùng file Vite tự đóng gói (chạy được offline).
const wasmUrl = import.meta.env.VITE_ESPEAK_WASM_URL || bundledWasmUrl

let compiledPromise = null

function getCompiledModule() {
  compiledPromise ??= fetch(wasmUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`Không tải được espeak-ng.wasm (HTTP ${res.status})`)
      return WebAssembly.compileStreaming(res.clone()).catch(async () =>
        WebAssembly.compile(await res.arrayBuffer())
      )
    })
    .catch((err) => {
      compiledPromise = null
      throw err
    })
  return compiledPromise
}

/** Nạp sẵn WASM để lần phát âm đầu tiên không bị khựng. */
export function warmUpEspeak() {
  return getCompiledModule().then(
    () => true,
    () => false
  )
}

/**
 * @param {string} text  câu cần chuyển
 * @param {string} voice mã giọng espeak, ví dụ 'vi', 'en-us', 'id', 'ms'
 * @returns {Promise<string>} chuỗi IPA
 */
export async function phonemize(text, voice = 'en-us') {
  if (!text?.trim()) return ''

  const wasmModule = await getCompiledModule()
  const lines = []

  await createEspeakModule({
    arguments: ['-v', voice, '-q', '--ipa', '--', text],
    print: (line) => lines.push(line),
    printErr: () => {},
    instantiateWasm(imports, onSuccess) {
      WebAssembly.instantiate(wasmModule, imports).then((instance) => onSuccess(instance, wasmModule))
      return {}
    },
  })

  const clauses = lines
    .map((line) => line.replace(/\([a-z-]{2,7}\)/g, '').trim()) // bỏ dấu hiệu chuyển ngôn ngữ, ví dụ (en)
    .filter(Boolean)

  // eSpeak tách câu thành nhiều dòng ngay tại mỗi dấu câu nhưng không trả lại
  // dấu đó — Piper cần dấu câu để biết chỗ ngắt nhịp/lên xuống giọng, thiếu
  // dấu giữa câu (không chỉ cuối câu) khiến model đọc dính câu, ngắt nhịp và
  // cao độ bất thường. Ghép lại đúng dấu theo thứ tự xuất hiện trong text gốc.
  const puncts = text.match(/[.!?,;:]+/g) || []
  let ipa = ''
  for (let i = 0; i < clauses.length; i++) {
    ipa += (ipa ? ' ' : '') + clauses[i] + (puncts[i] || '')
  }

  return ipa.replace(/\s+/g, ' ').trim()
}

/** Mã giọng espeak tương ứng với từng chế độ của app. */
export const ESPEAK_VOICE_BY_LANG = {
  vi: 'vi',
  en: 'en-us',
  id: 'id',
  ms: 'ms',
}
