/**
 * Worker phát file tĩnh + proxy file model.
 *
 * Vì sao cần proxy: Hugging Face không trả header CORS cho origin *.workers.dev
 * (kiểm chứng: cùng trình duyệt, fetch từ localhost thành công, từ workers.dev
 * báo "Failed to fetch"). Cho Worker tải hộ ở phía server thì không còn ràng
 * buộc CORS, và trình duyệt chỉ gọi về chính origin của mình.
 */
const UPSTREAM = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'
const PREFIX = '/api/model/'
const ONE_YEAR = 60 * 60 * 24 * 365

export default {
  async fetch(request, env) {
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

    // Chuyển tiếp Range để trình duyệt tải tiếp được khi đứt giữa chừng
    const forward = new Headers()
    const range = request.headers.get('Range')
    if (range) forward.set('Range', range)

    // Dùng cache của chính fetch (cf.cacheEverything) thay vì Cache API +
    // response.clone(): clone buộc Worker đệm song song hai nhánh, với file
    // 60 MB rất dễ chạm trần bộ nhớ 128 MB và bị cắt luồng giữa chừng.
    const upstream = await fetch(target.href, {
      method: request.method,
      headers: forward,
      cf: { cacheEverything: true, cacheTtl: ONE_YEAR },
    })

    if (!upstream.ok && upstream.status !== 206) {
      return new Response(`Không tải được model (upstream ${upstream.status})`, {
        status: upstream.status === 404 ? 404 : 502,
      })
    }

    // Dựng header mới thay vì sao chép của upstream: Workers tự giải nén phần
    // thân, nên Content-Encoding/Content-Length của Hugging Face không còn khớp
    // với số byte thực gửi đi — trình duyệt sẽ báo "network error".
    const headers = new Headers({
      'Content-Type': target.pathname.endsWith('.json')
        ? 'application/json; charset=utf-8'
        : 'application/octet-stream',
      'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
    })
    // Giữ Content-Length để thanh phần trăm lúc tải model chạy đúng
    for (const name of ['Content-Length', 'Content-Range', 'ETag']) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }

    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
