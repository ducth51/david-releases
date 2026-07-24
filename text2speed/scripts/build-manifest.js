/**
 * Sinh dữ liệu tĩnh cho bản deploy không có back-end:
 *
 *   public/models.json     thay cho /api/models và /api/piper/:lang/models
 *   public/demo/demo.json  thay cho /api/demo/list
 *   public/demo/*.txt|wav  thay cho /api/demo/file/:name
 *
 * Chạy tự động trước `vite build`.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = path.join(ROOT, 'models.config.json')
const DEMO_SRC = path.join(ROOT, 'server', 'demo')
const PUBLIC = path.join(ROOT, 'public')
const DEMO_OUT = path.join(PUBLIC, 'demo')

const config = JSON.parse(await fsp.readFile(CONFIG, 'utf8'))
delete config.$comment

await fsp.mkdir(PUBLIC, { recursive: true })
await fsp.writeFile(path.join(PUBLIC, 'models.json'), JSON.stringify(config, null, 2))

const voiceCount = Object.values(config.languages).reduce((n, list) => n + list.length, 0)
console.log(`✓ public/models.json — ${voiceCount} giọng / ${Object.keys(config.languages).length} ngôn ngữ`)

// --- Demo ------------------------------------------------------------------

await fsp.rm(DEMO_OUT, { recursive: true, force: true })
await fsp.mkdir(DEMO_OUT, { recursive: true })

const files = fs.existsSync(DEMO_SRC) ? await fsp.readdir(DEMO_SRC) : []
const present = new Set(files)
const demos = []

for (const file of files) {
  if (!file.endsWith('.wav')) continue
  const speaker = file.slice(0, -4)
  // Chỉ lấy mẫu có đủ cả .txt lẫn .wav — giống điều kiện của /api/demo/list
  if (!present.has(`${speaker}.txt`)) continue

  const stat = await fsp.stat(path.join(DEMO_SRC, file))
  await fsp.copyFile(path.join(DEMO_SRC, file), path.join(DEMO_OUT, file))
  await fsp.copyFile(path.join(DEMO_SRC, `${speaker}.txt`), path.join(DEMO_OUT, `${speaker}.txt`))
  demos.push({ speaker, size: stat.size, uploaded: stat.mtime.toISOString() })
}

demos.sort((a, b) => new Intl.Collator('vi').compare(a.speaker, b.speaker))
await fsp.writeFile(path.join(DEMO_OUT, 'demo.json'), JSON.stringify({ demos }, null, 2))

console.log(
  demos.length
    ? `✓ public/demo/ — ${demos.length} mẫu demo`
    : '! Chưa có mẫu demo nào — chạy `npm run make:demos` trước nếu muốn bảng Demo Samples có dữ liệu'
)
