# CLAUDE.md — Text To Speed

Tài liệu định hướng cho phiên làm việc sau. Đọc file này trước khi sửa gì.

## 1. App này là gì

Ứng dụng **chuyển văn bản thành giọng nói (TTS)** + **nhận dạng giọng nói (ASR)**
chạy **hoàn toàn trong trình duyệt**. Văn bản và âm thanh không bao giờ rời máy
người dùng; máy chủ chỉ phát file model tĩnh.

Dựng lại theo kiến trúc của <https://nghitts.app> (bản gốc), nhưng dùng bộ giọng
mã nguồn mở thay cho giọng nhân bản người thật của trang gốc.

- **Bản công khai:** `https://text2speed.duc-th51.workers.dev` (Cloudflare Worker)
- **Repo:** `github.com/ducth51/david-releases`, code nằm trong **thư mục con `text2speed/`**
  (repo còn hai project khác: `magiccapcut`, `magicflow`)
- **Phiên bản hiện tại:** xem `package.json` → `version` (v1.4.0 tại thời điểm viết)

## 2. Kiến trúc cốt lõi

```
Trình duyệt (Web Worker)                    Nguồn dữ liệu
┌─────────────────────────┐
│ tts-worker.js           │   .onnx/.json   ┌──────────────────────┐
│  eSpeak NG (WASM) → IPA │ ◄────────────── │ Hugging Face          │
│  onnxruntime-web → VITS │   qua proxy     │ (rhasspy/piper-voices)│
│  → WAV                   │                 └──────────────────────┘
└─────────────────────────┘                 ┌──────────────────────┐
        ▲  WASM từ jsDelivr CDN             │ raw.githubusercontent │
        │                                    │ (giọng tự host, CORS  │
   Vue 3 UI (Vite + Tailwind v4)             │ sẵn — không qua proxy)│
                                              └──────────────────────┘
```

- **Front-end:** Vue 3 + Vue Router + Vite 6 + Tailwind v4
- **Suy luận TTS:** Piper/VITS qua `onnxruntime-web`, chạy trong Web Worker
- **Phiên âm:** `espeak-ng` (WASM ~18 MB) — văn bản → IPA
- **ASR:** Whisper qua `@huggingface/transformers` (giao diện + luồng đã xong,
  **chưa test nhận dạng thật** vì cần tải model Whisper vài trăm MB)

## 3. Hai chế độ chạy — điều khiển bằng `VITE_MODEL_BASE_URL`

Toàn bộ khác biệt gói trong `src/lib/data-source.js`. Phần còn lại của app không
biết model nằm ở đâu.

| | KHÔNG đặt biến (dev/tự host) | CÓ đặt biến (`.env.production`) |
| --- | --- | --- |
| Model lấy từ | server Express `/api/model/*` | proxy Worker `/api/model` → Hugging Face |
| Danh sách model | Express quét thư mục `models/` | `public/models.json` (sinh lúc build) |
| Cần back-end | Có | Không (Worker chỉ proxy + phát tĩnh) |
| Dùng cho | phát triển, chạy local với giọng riêng | Cloudflare (bản công khai) |

## 4. Cấu trúc file

```
models.config.json     NGUỒN SỰ THẬT về model — script tải + build manifest đều đọc đây
index.html             có <title>, áp theme trước khi mount
vite.config.js         define __APP_VERSION__, __BUILD_TIME__ từ package.json
wrangler.jsonc         cấu hình deploy Worker (assets + proxy /api/*)
.env.production         URL model/WASM cho bản tĩnh
.node-version           ép Cloudflare dùng Node 22

src/
  main.js              mount app + đăng ký logger toàn cục
  router.js            5 route: / (vi) /en /id /ms /asr /log
  views/
    TtsView.vue        màn hình TTS (dùng chung vi/en/id/ms), quản lý worker
    AsrView.vue        nhận dạng giọng nói (Whisper)
    LogView.vue        tab Log DEBUG — xem/lọc/sao chép/tải log
  components/
    AppHeader.vue      logo "Text To Speed" + nhãn version + Chia sẻ/Lịch sử/theme
    ModeTabs.vue       thanh chọn ngôn ngữ/chế độ
    DemoSamples.vue    bảng mẫu demo (chỉ tab vi)
    ModelInfoModal.vue nút "Chi tiết" — bảng so sánh model, ĐỌC SPEC THẬT từ config
    ShareModal.vue     chia sẻ link
    HistoryPanel.vue   lịch sử audio (IndexedDB)
  lib/
    data-source.js     ★ phân giải URL model/demo theo chế độ; listVoices, fetchModelSpecs;
                       "path" trong models.config.json là URL tuyệt đối (http...) thì dùng
                       nguyên, không cộng base — cho giọng tự host ngoài kho HF chung
    vietnamese.js      chuẩn hoá số/ngày/giờ/tiền tệ/%/số La Mã → chữ; cắt câu (chỉ tại . ! ?)
    espeak.js          eSpeak NG WASM → IPA (thay 'phonemizer' vì gói đó chỉ có tiếng Anh);
                       ★ tự ghép lại dấu câu GIỮA câu — eSpeak xoá hết khi tách dòng
    audio.js           ghép PCM (chèn khoảng lặng 300ms giữa các câu), chuẩn hoá biên độ, đóng gói WAV
    model-cache.js     ★ tải model (theo LÁT 8MB nếu >16MB) + cache Cache Storage
    history.js         lịch sử audio trong IndexedDB (giữ 50 bản)
    logger.js          bộ log dùng chung; log trong Worker gửi về qua postMessage
  workers/
    tts-worker.js      Piper/VITS: textToPhonemes → phonemesToIds → onnxruntime → WAV
    asr-worker.js      Whisper qua transformers.js
  composables/useTheme.js   dark mode (class trên <html>, lưu localStorage)

scripts/
  fetch-models.js      tải giọng về models/ theo models.config.json
  make-demos.js        sinh server/demo/*.wav bằng onnxruntime-node (cần cho bảng demo)
  build-manifest.js    sinh public/models.json + public/demo/ (chạy trước vite build)
  prune-build.js       ★ XOÁ WASM đã lên CDN khỏi dist/ + CHẶN build nếu file >25 MiB
  dev-server.js        chạy Express với API_PORT=3000 (tránh tranh cổng với Vite)

worker/index.js        ★ Worker Cloudflare: proxy /api/model/* → HF, phát tĩnh còn lại
server/index.js        Express: API + phục vụ dist/ (chỉ dùng khi tự host)
server/demo/           <tên>.txt + <tên>.wav cho bảng Demo Samples (CÓ commit)
models/                model .onnx (GITIGNORE — không lên repo)
```

## 5. Luồng xử lý TTS (khi bấm Generate)

1. `cleanText` bỏ emoji/ký tự lạ (`vietnamese.js`)
2. Với tiếng Việt: `normalizeVietnamese` đọc số → chữ (ngày, giờ, %, tiền, La Mã)
3. `chunkText` cắt thành câu; mỗi xuống dòng là ranh giới cứng
4. Từng câu → IPA bằng eSpeak NG (`espeak.js`), IPA → id theo `phoneme_id_map`
5. `onnxruntime-web` chạy VITS, phát từng câu ngay khi xong (streaming)
6. Ghép đoạn, chuẩn hoá biên độ, đóng WAV, lưu lịch sử (IndexedDB)

## 6. Những cạm bẫy đã gặp — ĐỪNG lặp lại

Ghi lại vì mỗi cái tốn một vòng deploy hỏng mới tìm ra:

1. **`phonemizer` chỉ có tiếng Anh** → dùng `espeak-ng` (WASM đủ ngôn ngữ). Gọi
   `phonemize(text,'vi')` với gói cũ báo `Invalid language identifier`.

2. **Giới hạn 25 MiB/file của Cloudflare.** File `ort-wasm-…jsep.wasm` (ASR) tới
   26.8 MB → vượt. Cách xử lý: WASM lớn để trên **jsDelivr CDN**, `prune-build.js`
   xoá chúng khỏi `dist/` sau build và chặn nếu còn file quá cỡ. `dist/` cuối ≈ 2 MB.

3. **Vite luôn phát asset của import tĩnh** dù runtime trỏ CDN → phải có
   `prune-build.js` dọn, không thì `dist/` vẫn 68 MB.

4. **Workers từ chối `_redirects`** với lỗi "Infinite loop detected" (Pages thì
   nhận). Dùng `not_found_handling: "single-page-application"` trong `wrangler.jsonc`.
   Nếu ĐỔI sang Pages: thêm `_redirects`, xoá `wrangler.jsonc`.

5. **Hugging Face KHÔNG trả CORS cho origin `*.workers.dev`.** Cùng URL: fetch từ
   `localhost` OK, từ `workers.dev` báo "Failed to fetch". → `worker/index.js`
   proxy model ở phía server, trình duyệt chỉ gọi same-origin. jsDelivr,
   raw.githubusercontent, api.github.com thì CÓ CORS; GitHub Release assets thì KHÔNG.

6. **Luồng dài đứt giữa chừng với file >30 MB qua Worker** ("network error" ở ~14%,
   28 MB qua được, 63 MB chết). KHÔNG bật `cf.cacheEverything` (bắt edge nuốt trọn
   object → chạm trần bộ nhớ 128 MB). → `model-cache.js` tải theo **lát 8 MB** có
   retry khi file >16 MB. Đây là cách chốt, đang hoạt động.

7. **Phiên bản WASM trong `.env.production` phải khớp `package.json`.** Hai biến ORT
   trỏ HAI phiên bản KHÁC nhau (TTS dùng onnxruntime-web bản ổn định; ASR dùng bản
   dev mà transformers.js ghim) — đúng, không phải nhầm.

8. **Cloudflare R2 bắt buộc có thẻ thanh toán trên hồ sơ để kích hoạt**, kể cả chỉ
   dùng free tier (10 GB, $0). Không thẻ thì `wrangler r2 bucket create` báo lỗi
   `10042`. Thay thế đã dùng: đẩy giọng tự host lên **repo GitHub riêng**
   (`ducth51/text2speed-voices`) và phát qua `raw.githubusercontent.com` — đã kiểm
   chứng có CORS (`Access-Control-Allow-Origin: *`) VÀ hỗ trợ Range/206, nên trình
   duyệt tải thẳng, không cần qua Worker proxy. Nhược điểm: repo phải **public** (repo
   private thì raw.githubusercontent không phục vụ được cho người dùng ẩn danh).

9. **eSpeak NG xoá SẠCH dấu câu khi tách một câu ghép thành nhiều dòng nội bộ**
   (`--ipa`), không chỉ giữ lại dấu cuối câu. Ví dụ "A, B." → hai dòng `A` và `B`
   rồi mất luôn dấu phẩy nếu chỉ nối bằng khoảng trắng. Piper cần đúng dấu câu đó để
   biết chỗ ngắt nhịp/lên-xuống giọng — thiếu thì model rơi vào tình huống ngoài
   phân phối huấn luyện, đọc dính câu và ngữ điệu bất thường. Cách sửa (`espeak.js`):
   đếm số dấu câu trong text gốc, ghép lại đúng thứ tự giữa các dòng eSpeak trả về,
   không chỉ khôi phục dấu cuối cùng như bản đầu.

10. **Ghép nhiều câu VITS lại với nhau cần khoảng lặng, không thì nghe dồn dập.**
    Mỗi câu (`chunkText` cắt tại `.!?`) được suy luận độc lập, có ngữ điệu mở/đóng
    câu riêng; nối PCM liền 0ms giữa các câu làm giọng đọc nghe hụt hơi. `audio.js`
    → `concatAudio` chèn 300ms lặng (`SENTENCE_GAP_SEC`) giữa mỗi câu.

## 7. Deploy (Cloudflare Worker)

Cấu hình trên dashboard (project là **Worker**, không phải Pages):

| Ô | Giá trị |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `text2speed` ← BẮT BUỘC vì code trong thư mục con |

Quy trình cập nhật: sửa code trong `C:\Users\localadm\Desktop\Text2Speed` →
copy sang bản clone của repo → commit → push → Cloudflare tự build, hoặc bấm
**Retry build**. `git push` credential đã lưu sẵn (Git Credential Manager).

**Trước khi push, luôn:** `npm run build` chạy sạch (manifest + prune qua được),
và nếu đổi Worker/proxy thì test bằng `npx wrangler dev --port 8788`.

## 8. Model & giọng

`npm run fetch:models -- vi en id` tải từ `rhasspy/piper-voices`:

| Ngôn ngữ | Giọng công khai |
| --- | --- |
| vi | vais1000 (nên dùng), 25hours, vivos (65 giọng đa người nói) |
| en | lessac, ryan, cori (chất lượng cao) + hfc_female/male, kristin, amy, jenny, alan, libritts_r (904 giọng) |
| id | news_tts |
| ms | *(kho chưa có giọng tiếng Mã Lai)* |

Thêm model = thêm mục vào `models.config.json` (kèm `recommended`, `note`) →
`npm run build`. Tên model = tên trong config. Bảng "Chi tiết" đọc spec thật từ
`.onnx.json` nên không cần khai tần số/số giọng bằng tay.

### Giọng tự host (không thuộc rhasspy/piper-voices)

18 giọng tiếng Việt tùy chỉnh (Ban Mai, Mỹ Tâm, Trấn Thành, Ngọc Ngạn, Việt Thảo...)
nằm ở repo riêng **`github.com/ducth51/text2speed-voices`** (public, ~1 GB, nhánh
`vi/<slug-ascii>.onnx(.json)`), phát qua `raw.githubusercontent.com` — xem cạm bẫy #8.
Trong `models.config.json`, các mục này có `path` là **URL tuyệt đối đầy đủ**
(`https://raw.githubusercontent.com/ducth51/text2speed-voices/main/vi/<slug>`),
khác với các giọng Piper thường chỉ ghi path tương đối trong kho HF.

Muốn thêm giọng tự host khác (không phải Piper chính thức, hoặc giọng clone riêng):
1. Đặt file `.onnx` + `.onnx.json` vào repo `text2speed-voices` (hoặc repo public khác).
2. Thêm mục vào `models.config.json` với `path` là URL raw.githubusercontent đầy đủ
   (không có đuôi `.onnx`/`.onnx.json` — `resolveModelUrls` tự thêm).
3. `npm run build` để sinh lại `public/models.json`.

⚠️ Model clone giọng người thật (celebrity voice clone) đặt ở repo **public** — ai
có link cũng tải được. Cân nhắc vấn đề bản quyền/quyền riêng tư trước khi chia sẻ
rộng rãi; muốn giấu thì phải chuyển sang nguồn có xác thực (R2 + proxy, cần thẻ —
xem cạm bẫy #8) chứ raw.githubusercontent không phục vụ được repo private.

## 9. Lệnh hay dùng

```bash
npm run dev            # Express :3000 + Vite :5173 (dev, quét models/ local)
npm run build          # manifest → vite build → prune (ra dist/ ~2MB cho public)
npm run fetch:models   # tải giọng công khai về models/
npm run make:demos     # sinh server/demo/*.wav (cần onnxruntime-node)
npx wrangler dev --port 8788   # chạy thử đúng môi trường Worker trước khi deploy
```

## 10. Việc còn dang dở

- **ASR chưa test thật** — giao diện + worker đã xong, chưa chạy nhận dạng vì cần
  tải model Whisper vài trăm MB. Nếu làm tiếp: đặt model ONNX vào `models-asr/<tên>/`
  hoặc để transformers.js tự tải từ HF lần đầu.
- **Tab Malaysia trống** — kho chưa có giọng Piper tiếng Mã Lai.
- **Model Piper chuẩn vẫn phụ thuộc Hugging Face** (qua proxy `worker/index.js`).
  Giọng tự host thì đã độc lập HF (dùng GitHub, xem mục 8) nhưng lại phụ thuộc
  GitHub public repo — chưa có phương án dùng R2 vì cần thẻ thanh toán (cạm bẫy #8).
  Có thẻ rồi thì bật R2 xong đổi `worker/index.js` để proxy thêm nguồn R2 song song
  HF (nhánh riêng theo prefix, ví dụ từng thử ở nhánh `/api/model/r2/*` — đã revert).
- **Repo giọng tự host (`text2speed-voices`) đang public** — chấp nhận đánh đổi để
  không cần thẻ (xem cạm bẫy #8). Nếu cần private, phải quay lại proxy có xác thực.

## 11. Lịch sử phiên bản

- v1.0 — bản đầu, TTS chạy được, 2 chế độ dev/tĩnh
- v1.1 — proxy model qua Worker (sửa CORS workers.dev)
- v1.2 — tab Log DEBUG + tải model theo lát 8 MB (sửa đứt luồng file lớn)
- v1.3 — thêm 7 giọng tiếng Anh chất lượng cao
- v1.4 — nút "Chi tiết" + bảng so sánh model (đọc spec thật từ config); đổi tên
  NGHI-TTS → Text To Speed, thêm nhãn version
- *(sau v1.4, chưa bump `package.json`)* — thêm 18 giọng tiếng Việt tự host qua
  `raw.githubusercontent.com` (`data-source.js` hỗ trợ `path` dạng URL tuyệt đối);
  sửa lỗi mất dấu câu giữa câu khi phonemize (`espeak.js`) và thiếu khoảng lặng
  giữa các câu khi ghép audio (`audio.js`, 300ms) — xem cạm bẫy #8, #9, #10
