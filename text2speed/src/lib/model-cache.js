/**
 * Cache file model (.onnx / .onnx.json) vào Cache Storage để lần sau
 * mở app không phải tải lại vài chục MB.
 */
const CACHE_NAME = 'nghitts-models-v1'

async function openCache() {
  try {
    return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null
  } catch {
    return null
  }
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

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Không tải được ${url} (HTTP ${res.status})`)

  const total = Number(res.headers.get('Content-Length') || 0)

  // Không có body stream hoặc không biết dung lượng -> tải thẳng
  if (!res.body || !total || !onProgress) {
    const clone = res.clone()
    if (cache) await cache.put(url, clone).catch(() => {})
    onProgress?.(1, 1)
    return res
  }

  const reader = res.body.getReader()
  const parts = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.length
    onProgress(loaded, total)
  }

  const blob = new Blob(parts)
  const cached = new Response(blob, { headers: res.headers })
  if (cache) await cache.put(url, cached.clone()).catch(() => {})
  return cached
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
