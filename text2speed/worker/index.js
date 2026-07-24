/**
 * Worker phát file tĩnh + proxy file model.
 *
 * Vì sao cần proxy: Hugging Face không trả header CORS cho origin *.workers.dev
 * (kiểm chứng: cùng trình duyệt, fetch từ localhost thành công, từ workers.dev
 * báo "Failed to fetch"). Cho Worker tải hộ ở phía server thì không còn ràng
 * buộc CORS, và trình duyệt chỉ gọi về chính origin của mình.
 *
 * File model bất biến nên được cache tại edge — Hugging Face chỉ bị gọi ở lần
 * miss đầu tiên.
 */
const UPSTREAM = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'
const PREFIX = '/api/model/'
const ONE_YEAR = 60 * 60 * 24 * 365

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // Mọi thứ ngoài /api/model/ đều là file tĩnh
    if (!url.pathname.startsWith(PREFIX)) return env.ASSETS.fetch(request)

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const target = new URL(url.pathname.slice(PREFIX.length), UPSTREAM)
    // Chặn đường dẫn thoát ra ngoài kho model
    if (!target.href.startsWith(UPSTREAM)) {
      return new Response('Not Found', { status: 404 })
    }

    const cache = caches.default
    const cacheKey = new Request(url.toString(), { method: 'GET' })

    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const upstream = await fetch(target.href, {
      cf: { cacheEverything: true, cacheTtl: ONE_YEAR },
    })
    if (!upstream.ok) {
      return new Response(`Không tải được model (upstream ${upstream.status})`, {
        status: upstream.status === 404 ? 404 : 502,
      })
    }

    const response = new Response(upstream.body, upstream)
    response.headers.set('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`)
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set(
      'Content-Type',
      target.pathname.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream'
    )
    response.headers.delete('set-cookie')

    ctx.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  },
}
