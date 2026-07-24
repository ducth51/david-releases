/**
 * Dọn dist/ sau `vite build` và kiểm tra giới hạn dung lượng.
 *
 * Vì sao cần: Vite luôn phát ra asset của mọi import tĩnh, kể cả khi runtime
 * đã được trỏ sang CDN. Ba file .wasm (18–27 MB) vì thế vẫn nằm trong dist/
 * dù không bao giờ được tải. Script này xoá đúng những file đã có URL ngoài
 * thay thế, rồi chặn build nếu còn file nào vượt giới hạn của Cloudflare Pages.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const MAX_FILE_BYTES = 25 * 1024 * 1024 // giới hạn cứng 25 MiB/file của Pages

if (!fs.existsSync(DIST)) {
  console.error('Chưa có dist/ — chạy `vite build` trước.')
  process.exit(1)
}

const env = loadEnv('production', ROOT, 'VITE_')

/** Mỗi mục: xoá asset khớp `pattern` nếu biến môi trường `when` đã được đặt. */
const RULES = [
  { when: 'VITE_ESPEAK_WASM_URL', pattern: /^espeak-ng-.*\.wasm$/, label: 'eSpeak NG' },
  { when: 'VITE_ORT_TTS_WASM_BASE', pattern: /^ort-wasm-.*\.wasm$/, label: 'onnxruntime (TTS)' },
  { when: 'VITE_ORT_WASM_BASE', pattern: /^ort-wasm-.*\.wasm$/, label: 'onnxruntime (ASR)' },
]

const assetsDir = path.join(DIST, 'assets')
const assets = fs.existsSync(assetsDir) ? await fsp.readdir(assetsDir) : []

let freed = 0
for (const rule of RULES) {
  if (!env[rule.when]) continue
  for (const file of assets) {
    const target = path.join(assetsDir, file)
    if (!rule.pattern.test(file) || !fs.existsSync(target)) continue
    freed += (await fsp.stat(target)).size
    await fsp.rm(target)
    console.log(`− ${file}  (${rule.label} → CDN)`)
  }
}

if (freed) console.log(`✓ Gỡ ${(freed / 1024 / 1024).toFixed(1)} MB khỏi gói build`)

// --- Cổng kiểm tra ---------------------------------------------------------

const oversized = []
let total = 0

async function walk(dir) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full)
      continue
    }
    const { size } = await fsp.stat(full)
    total += size
    if (size > MAX_FILE_BYTES) oversized.push({ file: path.relative(DIST, full), size })
  }
}
await walk(DIST)

console.log(`✓ dist/ tổng cộng ${(total / 1024 / 1024).toFixed(2)} MB`)

if (oversized.length) {
  console.error('\n✗ Vượt giới hạn 25 MiB/file của Cloudflare Pages:')
  for (const f of oversized) console.error(`  ${f.file} — ${(f.size / 1024 / 1024).toFixed(1)} MB`)
  console.error('\nĐưa file này ra CDN/R2 rồi thêm quy tắc tương ứng vào scripts/prune-build.js.')
  process.exit(1)
}
