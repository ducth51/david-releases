/**
 * Bộ ghi log dùng chung cho cả luồng chính lẫn Web Worker.
 *
 * Trong Worker không truy cập được store của trang, nên log được gửi về bằng
 * postMessage rồi luồng chính nạp lại vào đúng store — nhờ vậy tab Log thấy
 * được cả hai phía với cùng một dòng thời gian.
 */
const MAX_ENTRIES = 1000
const BOOT = Date.now()

const IN_WORKER =
  typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope

const entries = []
const listeners = new Set()
let seq = 0

function notify() {
  for (const fn of listeners) fn(entries)
}

/** Rút gọn dữ liệu kèm theo để không làm phình bộ nhớ hay vỡ JSON. */
function sanitize(data) {
  if (data === undefined) return undefined
  try {
    return JSON.parse(
      JSON.stringify(data, (_key, value) => {
        if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
        if (value instanceof Headers) return Object.fromEntries(value.entries())
        if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '…'
        return value
      })
    )
  } catch {
    return { unserializable: String(data) }
  }
}

/** Nạp một bản ghi đã có sẵn (dùng cho log chuyển về từ Worker). */
export function ingest(entry) {
  entries.push({ ...entry, id: ++seq })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  notify()
}

export function log(level, source, message, data) {
  const entry = {
    at: Date.now(),
    since: Date.now() - BOOT,
    level,
    source,
    message,
    data: sanitize(data),
  }

  if (IN_WORKER) {
    self.postMessage({ status: 'log', entry })
    return
  }
  ingest(entry)
}

export const logInfo = (source, message, data) => log('info', source, message, data)
export const logWarn = (source, message, data) => log('warn', source, message, data)
export const logError = (source, message, data) => log('error', source, message, data)

export function subscribe(fn) {
  listeners.add(fn)
  fn(entries)
  return () => listeners.delete(fn)
}

export function getEntries() {
  return entries
}

export function clearEntries() {
  entries.length = 0
  notify()
}

/** Kết xuất dạng văn bản để dán vào báo cáo lỗi. */
export function toText() {
  return entries
    .map((e) => {
      const time = new Date(e.at).toISOString().slice(11, 23)
      const head = `[${time}] [+${String(e.since).padStart(6)}ms] ${e.level.toUpperCase().padEnd(5)} ${e.source} — ${e.message}`
      return e.data === undefined ? head : `${head}\n    ${JSON.stringify(e.data)}`
    })
    .join('\n')
}

/** fetch có ghi log: URL, phương thức, mã trạng thái, dung lượng, thời gian. */
export async function loggedFetch(source, url, init, note) {
  const started = performance.now()
  const range = init?.headers?.Range || init?.headers?.range
  try {
    const res = await fetch(url, init)
    const ms = Math.round(performance.now() - started)
    log(res.ok || res.status === 206 ? 'info' : 'error', source, `${res.status} ${note || url}`, {
      url: String(url),
      status: res.status,
      ms,
      range,
      contentLength: res.headers.get('content-length'),
      contentRange: res.headers.get('content-range'),
      contentType: res.headers.get('content-type'),
      cfRay: res.headers.get('cf-ray'),
      upstreamStatus: res.headers.get('x-upstream-status'),
    })
    return res
  } catch (err) {
    const ms = Math.round(performance.now() - started)
    logError(source, `THẤT BẠI ${note || url}`, {
      url: String(url),
      ms,
      range,
      error: String(err),
      name: err?.name,
    })
    throw err
  }
}
