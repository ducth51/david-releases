/**
 * Tải file model và lưu vào Cache Storage để lần sau mở app không phải tải lại.
 *
 * File lớn được tải thành nhiều lát bằng HTTP Range thay vì một luồng liền
 * mạch. Lý do: luồng dài qua Cloudflare Workers hay đứt giữa chừng với file
 * vài chục MB (đo được: 28 MB qua, 63 MB chết ở 14–40%, điểm chết thay đổi
 * theo từng lần). Mỗi lát là một request ngắn, hỏng lát nào thì thử lại đúng
 * lát đó thay vì mất toàn bộ tiến trình.
 */
import { logInfo, logWarn, logError, loggedFetch } from './logger.js'

const CACHE_NAME = 'nghitts-models-v1'
const CHUNK_THRESHOLD = 16 * 1024 * 1024 // dưới ngưỡng này thì tải một mạch
const CHUNK_SIZE = 8 * 1024 * 1024
const MAX_RETRY = 3

async function openCache() {
  try {
    return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null
  } catch {
    return null
  }
}

/** Hỏi dung lượng thật qua một Range request tí hon. */
async function probeSize(url) {
  try {
    const res = await loggedFetch('cache', url, { headers: { Range: 'bytes=0-0' } }, 'dò kích thước')
    if (res.status !== 206) {
      logWarn('cache', 'Máy chủ không hỗ trợ Range, sẽ tải một mạch', { status: res.status })
      return null
    }
    await res.arrayBuffer()
    const match = res.headers.get('Content-Range')?.match(/\/(\d+)$/)
    const size = match ? Number(match[1]) : null
    logInfo('cache', `Kích thước ${size} byte`, { url: String(url), size })
    return size
  } catch (err) {
    logError('cache', 'Dò kích thước thất bại', { error: String(err) })
    return null
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchRange(url, start, end) {
  let lastError
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await loggedFetch(
        'cache',
        url,
        { headers: { Range: `bytes=${start}-${end}` } },
        `lát ${start}-${end} (lần ${attempt})`
      )
      if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      if (attempt > 1) logInfo('cache', `Lát ${start}-${end} thành công ở lần thử ${attempt}`)
      return buf
    } catch (err) {
      lastError = err
      logWarn('cache', `Lát ${start}-${end} hỏng ở lần ${attempt}/${MAX_RETRY}`, { error: String(err) })
      if (attempt < MAX_RETRY) await sleep(attempt * 500) // lùi dần rồi thử lại
    }
  }
  throw new Error(`Tải lát ${start}-${end} thất bại: ${lastError?.message || lastError}`)
}

async function fetchInChunks(url, total, onProgress) {
  const count = Math.ceil(total / CHUNK_SIZE)
  logInfo('cache', `Tải theo ${count} lát, mỗi lát ${CHUNK_SIZE / 1024 / 1024} MB`, { total, count })

  const parts = []
  let loaded = 0
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, total - 1)
    const part = await fetchRange(url, start, end)
    parts.push(part)
    loaded += part.byteLength
    onProgress?.(loaded, total)
  }
  if (loaded !== total) throw new Error(`Thiếu dữ liệu: ${loaded}/${total} byte`)
  logInfo('cache', `Ghép xong ${loaded} byte từ ${parts.length} lát`)
  return new Blob(parts)
}

async function fetchWhole(url, onProgress) {
  const res = await loggedFetch('cache', url, undefined, 'tải một mạch')
  if (!res.ok) throw new Error(`Không tải được ${url} (HTTP ${res.status})`)

  const total = Number(res.headers.get('Content-Length') || 0)
  if (!res.body || !total || !onProgress) {
    onProgress?.(1, 1)
    return res.blob()
  }

  const reader = res.body.getReader()
  const parts = []
  let loaded = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      loaded += value.length
      onProgress(loaded, total)
    }
  } catch (err) {
    logError('cache', `Luồng đứt ở ${loaded}/${total} byte (${Math.round((loaded / total) * 100)}%)`, {
      loaded,
      total,
      error: String(err),
    })
    throw err
  }
  return new Blob(parts)
}

/**
 * Tải một URL, ưu tiên cache. onProgress nhận (loaded, total) theo byte.
 */
export async function cachedFetch(url, onProgress) {
  const cache = await openCache()

  if (cache) {
    const hit = await cache.match(url)
    if (hit) {
      onProgress?.(1, 1)
      return hit
    }
  }

  const total = await probeSize(url)
  const blob =
    total && total > CHUNK_THRESHOLD
      ? await fetchInChunks(url, total, onProgress)
      : await fetchWhole(url, onProgress)

  // Hai Response dùng chung một Blob — trình duyệt không nhân đôi bộ nhớ
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Length': String(blob.size) }
  if (cache) await cache.put(url, new Response(blob, { headers })).catch(() => {})
  return new Response(blob, { headers })
}

export async function clearModelCache() {
  try {
    await caches.delete(CACHE_NAME)
    return true
  } catch {
    return false
  }
}

export async function getCachedModels() {
  const cache = await openCache()
  if (!cache) return []
  const keys = await cache.keys()
  return keys.map((r) => decodeURIComponent(new URL(r.url).pathname))
}
