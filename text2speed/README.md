# NGHI-TTS — bản dựng lại

Ứng dụng chuyển văn bản thành giọng nói (TTS) và nhận dạng giọng nói (ASR)
chạy **hoàn toàn trong trình duyệt**: văn bản và âm thanh không bao giờ rời khỏi
máy người dùng. Máy chủ chỉ làm nhiệm vụ phát file model và dữ liệu demo.

Dựng lại theo kiến trúc của <https://nghitts.app>: Vue 3 + Vite + Tailwind v4 ở
front-end, Express ở back-end, suy luận Piper/VITS bằng onnxruntime-web trong
Web Worker.

## Hai chế độ chạy

App hoạt động ở hai chế độ, quyết định bởi **biến môi trường `VITE_MODEL_BASE_URL`**:

| | Không đặt biến | Có đặt biến (`.env.production`) |
| --- | --- | --- |
| Model lấy từ | server Express (`/api/model/…`) | host ngoài (Hugging Face) |
| Danh sách model | API quét thư mục `models/` | `public/models.json` sinh lúc build |
| Cần back-end | Có | **Không** |
| Dùng cho | phát triển, tự host | Cloudflare Pages, Netlify, GitHub Pages |

Toàn bộ khác biệt gói trong [data-source.js](src/lib/data-source.js) — phần còn
lại của app không biết gì về chuyện này.

## Chạy thử (chế độ tự host)

```bash
npm install
npm run fetch:models -- vi en id
npm run make:demos
npm run dev
```

Mở <http://localhost:5173>. Vite ở cổng 5173, API ở cổng 3000 (Vite proxy `/api`
sang đó). Muốn chạy bản build tự host: `npm run build && npm start`.

## Deploy tĩnh lên Cloudflare

```bash
npm run build              # sinh manifest → vite build → dọn & kiểm tra dung lượng
npx wrangler deploy --dry-run   # kiểm tra cấu hình, không deploy thật
npx vite preview           # xem thử tại http://localhost:4173
```

Dự án deploy dạng **Worker chỉ phát file tĩnh**, cấu hình trong
[wrangler.jsonc](wrangler.jsonc). Thiết lập trên dashboard:

| Mục | Giá trị |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `text2speed` *(nếu code nằm trong thư mục con của repo)* |

Không cần khai báo biến môi trường trên dashboard — chúng nằm sẵn trong
[.env.production](.env.production).

**Không dùng `public/_redirects`.** Workers static assets kiểm tra file này chặt
hơn Pages và từ chối luật `/* /index.html 200` với lỗi *"Infinite loop detected"*.
Việc SPA fallback do khoá `not_found_handling` trong `wrangler.jsonc` đảm nhiệm.
Nếu chuyển sang Cloudflare Pages thì làm ngược lại: thêm `_redirects` và xoá
`wrangler.jsonc`.

### Vì sao model phải đi qua proxy

Hugging Face **không trả header CORS cho origin `*.workers.dev`**. Kiểm chứng:
cùng một trình duyệt, cùng một URL, cùng thời điểm —

| Origin | Kết quả |
| --- | --- |
| `http://localhost:5173` | 200, `type: cors` |
| `https://<tên>.workers.dev` | `TypeError: Failed to fetch` |

Chế độ `no-cors` vẫn đi được (nhận opaque response) nên host hoàn toàn truy cập
được — chỉ là header CORS không được cấp cho origin đó. Phía server thì bình
thường: `fetch` từ Node với đúng `Origin` ấy vẫn nhận đủ header.

Đo thêm từ chính origin bị lỗi: jsDelivr, `raw.githubusercontent.com` và
`api.github.com` đều có CORS; Hugging Face và **GitHub Release assets** thì không.

Vì vậy [worker/index.js](worker/index.js) tải hộ ở phía server rồi phát lại dưới
cùng origin. Trình duyệt chỉ gọi về chính nó nên CORS không còn liên quan. File
model bất biến nên được cache tại edge — Hugging Face chỉ bị gọi ở lần miss đầu.

Chỉ `/api/*` mới đi qua mã Worker (`run_worker_first`), file tĩnh vẫn được phục
vụ trực tiếp nên không tiêu tốn lượt gọi Worker.

**Nâng cấp về sau:** nếu muốn tự chủ hoàn toàn, đưa model lên Cloudflare R2
(10 GB miễn phí, egress miễn phí) rồi đổi `UPSTREAM` trong `worker/index.js`.

### Vì sao phải có bước dọn build

Cloudflare Pages **chặn cứng file lớn hơn 25 MiB**. Gói build có ba file WASM
vượt hoặc sát ngưỡng đó:

| File | Dung lượng | Xử lý |
| --- | --- | --- |
| `ort-wasm-…jsep.wasm` (ASR) | 26.8 MB | ✗ vượt ngưỡng → CDN |
| `ort-wasm-…jsep.wasm` (TTS) | 21.6 MB | sát ngưỡng → CDN |
| `espeak-ng.wasm` | 18.5 MB | → CDN |

Vấn đề là **Vite luôn phát ra asset của mọi import tĩnh**, kể cả khi runtime đã
được trỏ sang CDN — nên chỉ đặt biến môi trường thôi thì file vẫn nằm trong
`dist/`. [prune-build.js](scripts/prune-build.js) xoá đúng những file đã có URL
ngoài thay thế, rồi **chặn build nếu còn file nào vượt 25 MiB**. Nhờ vậy nếu sau
này nâng cấp thư viện làm file phình ra, bạn biết ngay lúc build chứ không phải
lúc deploy hỏng.

Kết quả: `dist/` còn **2.05 MB** thay vì 68 MB.

### Biến môi trường

| Biến | Tác dụng |
| --- | --- |
| `VITE_MODEL_BASE_URL` | gốc URL của model Piper; bỏ trống ⇒ dùng API Express |
| `VITE_ESPEAK_WASM_URL` | eSpeak NG trên CDN |
| `VITE_ORT_TTS_WASM_BASE` | onnxruntime-web cho TTS |
| `VITE_ORT_WASM_BASE` | onnxruntime-web cho ASR (**phiên bản khác**, do transformers.js ghim) |

⚠️ Phiên bản trong URL CDN phải khớp phiên bản trong `package.json`. Lệch phiên
bản giữa file `.js` và `.wasm` gây lỗi khởi tạo khó lần ra. Hai biến ORT trỏ về
hai phiên bản **khác nhau** là đúng, không phải nhầm lẫn.

## Kiến trúc

```
models.config.json       nguồn sự thật về model (dùng chung cho script & build)
index.html
src/
  views/TtsView.vue      màn hình TTS (dùng chung cho vi / en / id / ms)
  views/AsrView.vue      màn hình nhận dạng giọng nói
  components/            header, thanh tab, chia sẻ, lịch sử, bảng demo
  workers/tts-worker.js  Piper/VITS qua onnxruntime-web
  workers/asr-worker.js  Whisper qua transformers.js
  lib/data-source.js     phân giải URL model/demo theo chế độ chạy
  lib/vietnamese.js      chuẩn hoá số / ngày / giờ / tiền tệ / số La Mã
  lib/espeak.js          văn bản → IPA bằng eSpeak NG (WASM)
  lib/audio.js           ghép PCM, chuẩn hoá biên độ, đóng gói WAV
  lib/model-cache.js     cache model trong Cache Storage
  lib/history.js         lịch sử audio trong IndexedDB
scripts/
  fetch-models.js        tải model về máy (chế độ tự host)
  make-demos.js          sinh .wav cho bảng Demo Samples
  build-manifest.js      sinh public/models.json + public/demo/ (bản tĩnh)
  prune-build.js         dọn WASM đã lên CDN + chặn file > 25 MiB
server/index.js          API + phục vụ dist/ (chỉ dùng khi tự host)
wrangler.jsonc           cấu hình deploy Worker static assets
models/                  <tên>.onnx + <tên>.onnx.json (tiếng Việt)
models/<lang>/           model cho các ngôn ngữ khác
models-asr/<tên model>/  model Whisper dạng ONNX (tuỳ chọn)
server/demo/             <tên>.txt + <tên>.wav cho bảng Demo Samples
```

### API

| Endpoint | Trả về |
| --- | --- |
| `GET /api/models` | danh sách model tiếng Việt |
| `GET /api/piper/languages` | các chế độ hiển thị trên thanh tab |
| `GET /api/piper/:lang/models` | model theo ngôn ngữ |
| `GET /api/model/<tên>.onnx(.json)` | file model (cache 1 năm) |
| `GET /api/asr/models` | model ASR cài sẵn |
| `GET /api/demo/list` | danh sách mẫu demo |
| `GET /api/demo/file/:name` | file `.txt` hoặc `.wav` của mẫu demo |

Tên model = tên file trong `models/`, nên **thêm model chỉ là thả file vào thư
mục rồi khởi động lại server** — không cần sửa code.

### Luồng xử lý TTS

1. Làm sạch văn bản (bỏ emoji, ký tự lạ).
2. Với tiếng Việt: đọc số thành chữ — ngày tháng, giờ, phần trăm, tiền tệ, số
   thập phân, số La Mã theo ngữ cảnh (`lib/vietnamese.js`).
3. Cắt thành từng câu; mỗi xuống dòng là một ranh giới cứng.
4. Từng câu → IPA bằng eSpeak NG (WASM), IPA → id theo `phoneme_id_map` của model.
5. onnxruntime-web chạy VITS, phát từng câu ngay khi xong (streaming).
6. Ghép các đoạn, chuẩn hoá biên độ, đóng gói WAV, lưu vào lịch sử.

## Ghi chú kỹ thuật

**eSpeak NG thay cho `phonemizer`.** Gói npm `phonemizer` thường dùng cho Piper
chỉ nhúng dữ liệu **tiếng Anh** — gọi với `vi` sẽ báo `Invalid language
identifier`. Dự án này dùng `espeak-ng` (bản WASM ~18 MB kèm đủ mọi ngôn ngữ).
Module espeak thuộc loại chạy `main` rồi thoát nên mỗi câu cần một instance mới;
`lib/espeak.js` biên dịch `WebAssembly.Module` một lần rồi tái sử dụng, và nạp
sẵn ngay khi model TTS load xong.

**Cache.** File `.onnx` được lưu trong Cache Storage (`nghitts-models-v1`) nên
chỉ tải một lần. Lịch sử audio nằm trong IndexedDB, giữ 50 bản ghi gần nhất.

**Cổng lúc dev.** API server đọc `API_PORT` trước `PORT`, tránh trường hợp công
cụ chạy dev đặt sẵn `PORT` cho Vite rồi hai tiến trình tranh nhau một cổng.

## Model

`npm run fetch:models` tải giọng mã nguồn mở từ
[rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices):

| Ngôn ngữ | Giọng |
| --- | --- |
| `vi` | vais1000, 25hours, vivos |
| `en` | amy, libritts_r, alan |
| `id` | news_tts |
| `ms` | *(kho chưa có giọng tiếng Mã Lai)* |

Trang gốc dùng bộ giọng riêng của họ, đặt theo tên người thật. Bản dựng lại này
không kèm những model đó — thư mục `models/` nhận bất kỳ giọng Piper nào bạn có
quyền sử dụng.

## ASR

`AsrView` ghi âm hoặc nhận file, giải mã về PCM mono 16 kHz rồi đưa vào Whisper
qua transformers.js. Nếu `models-asr/` trống, worker sẽ tải model từ Hugging Face
ở lần chạy đầu (vài trăm MB). Để chạy offline, đặt model ONNX vào
`models-asr/<tên>/` — tên thư mục sẽ hiện trong danh sách chọn.
