/**
 * Lớp phân giải nguồn dữ liệu — nơi duy nhất biết model và demo nằm ở đâu.
 *
 *   Không đặt VITE_MODEL_BASE_URL → gọi API của server Express (chế độ dev).
 *   Có đặt                        → đọc manifest tĩnh + tải model từ host ngoài
 *                                   (bản deploy tĩnh, không cần server).
 */
const REMOTE_BASE = (import.meta.env.VITE_MODEL_BASE_URL || '').replace(/\/$/, '')

/** true khi app chạy ở chế độ tĩnh, không có back-end. */
export const isStatic = Boolean(REMOTE_BASE)

/** Các chế độ trên thanh tab. Cố định nên không cần gọi mạng ở bản tĩnh. */
export const LANGUAGES = [
  { code: 'en', label: 'English', route: '/en', type: 'i18n' },
  { code: 'id', label: 'Indonesia', route: '/id', type: 'i18n' },
  { code: 'ms', label: 'Malaysia', route: '/ms', type: 'i18n' },
  { code: 'vi', label: 'Tiếng Việt', route: '/', type: 'vietnamese' },
]

let manifestPromise = null

function loadManifest() {
  manifestPromise ??= fetch('/models.json')
    .then((res) => {
      if (!res.ok) throw new Error(`Không đọc được models.json (HTTP ${res.status})`)
      return res.json()
    })
    .catch((err) => {
      manifestPromise = null
      throw err
    })
  return manifestPromise
}

/** Đường dẫn API cục bộ: tiếng Việt ở gốc, ngôn ngữ khác trong thư mục con. */
const localModelBase = (lang) => (lang === 'vi' ? '/api/model/' : `/api/model/${lang}/`)

/** @returns {Promise<string[]>} tên các model dùng được cho ngôn ngữ này */
export async function listModels(lang) {
  if (!isStatic) {
    const endpoint = lang === 'vi' ? '/api/models' : `/api/piper/${lang}/models`
    const res = await fetch(endpoint)
    const { models = [] } = await res.json()
    return models
  }
  const manifest = await loadManifest()
  return (manifest.languages?.[lang] ?? []).map((voice) => voice.name)
}

/** @returns {Promise<{model: string, config: string}>} URL file .onnx và .onnx.json */
export async function resolveModelUrls(lang, name) {
  if (!isStatic) {
    const base = localModelBase(lang) + encodeURIComponent(name)
    return { model: `${base}.onnx`, config: `${base}.onnx.json` }
  }

  const manifest = await loadManifest()
  const voice = (manifest.languages?.[lang] ?? []).find((v) => v.name === name)
  if (!voice) throw new Error(`Không tìm thấy model "${name}" cho ngôn ngữ "${lang}"`)

  const base = `${manifest.base || REMOTE_BASE}/${voice.path}`
  return { model: `${base}.onnx`, config: `${base}.onnx.json` }
}

/** @returns {Promise<Array<{speaker: string, text: string, wav: string}>>} */
export async function listDemos() {
  const listUrl = isStatic ? '/demo/demo.json' : '/api/demo/list'
  const fileUrl = (name) =>
    isStatic ? `/demo/${encodeURIComponent(name)}` : `/api/demo/file/${encodeURIComponent(name)}`

  const res = await fetch(listUrl)
  if (!res.ok) return []
  const { demos = [] } = await res.json()

  return Promise.all(
    demos.map(async (demo) => {
      let text = ''
      try {
        const r = await fetch(fileUrl(`${demo.speaker}.txt`))
        if (r.ok) text = (await r.text()).trim()
      } catch {
        /* thiếu text thì vẫn hiện được audio */
      }
      return { speaker: demo.speaker, text, wav: fileUrl(`${demo.speaker}.wav`) }
    })
  )
}
