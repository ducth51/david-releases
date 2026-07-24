/**
 * Tải giọng Piper mã nguồn mở về thư mục models/ theo khai báo trong
 * models.config.json.
 *
 *   npm run fetch:models            # bộ mặc định (vi + en)
 *   npm run fetch:models -- vi      # chỉ tiếng Việt
 *   npm run fetch:models -- en id
 *
 * Chỉ cần thiết khi muốn chạy tự host (server Express phát model). Bản deploy
 * tĩnh tải thẳng từ host ngoài nên không cần bước này.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODELS_DIR = path.join(ROOT, 'models')

const config = JSON.parse(await fsp.readFile(path.join(ROOT, 'models.config.json'), 'utf8'))
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['vi', 'en']

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest))
  return (await fsp.stat(dest)).size
}

for (const lang of targets) {
  const voices = config.languages[lang]
  if (!voices) {
    console.warn(`! models.config.json chưa khai báo ngôn ngữ "${lang}"`)
    continue
  }
  if (!voices.length) {
    console.warn(`! Chưa có giọng nào cho "${lang}"`)
    continue
  }

  // Tiếng Việt nằm ngay trong models/, ngôn ngữ khác nằm trong models/<lang>/
  const dir = lang === 'vi' ? MODELS_DIR : path.join(MODELS_DIR, lang)

  for (const voice of voices) {
    for (const ext of ['.onnx', '.onnx.json']) {
      const dest = path.join(dir, voice.name + ext)
      if (fs.existsSync(dest)) {
        console.log(`· bỏ qua (đã có) ${path.relative(ROOT, dest)}`)
        continue
      }
      try {
        process.stdout.write(`↓ ${voice.name}${ext} … `)
        const size = await download(`${config.base}/${voice.path}${ext}`, dest)
        console.log(`${(size / 1024 / 1024).toFixed(1)} MB`)
      } catch (err) {
        await fsp.rm(dest, { force: true })
        console.log(`bỏ qua (${err.message})`)
      }
    }
  }
}

console.log('\nXong. Khởi động lại server để thấy model mới.')
