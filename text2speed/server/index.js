import express from 'express'
import compression from 'compression'
import cors from 'cors'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const MODELS_DIR = process.env.MODELS_DIR || path.join(ROOT, 'models')
const ASR_DIR = process.env.ASR_DIR || path.join(ROOT, 'models-asr')
const DEMO_DIR = process.env.DEMO_DIR || path.join(ROOT, 'server', 'demo')
const DIST_DIR = path.join(ROOT, 'dist')
// API_PORT được ưu tiên để lúc dev không bị "cướp" cổng bởi PORT mà
// công cụ bên ngoài (vite/preview runner) đã đặt sẵn cho web server.
const PORT = Number(process.env.API_PORT || process.env.PORT || 3000)

const app = express()
app.use(cors())
app.use(
  compression({
    // Không nén lại file .onnx (đã lớn + client cache), tránh tốn CPU
    filter: (req, res) => (req.path.endsWith('.onnx') ? false : compression.filter(req, res)),
  })
)

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Chống path traversal: chỉ cho phép tên file trong đúng thư mục gốc. */
function safeJoin(baseDir, ...parts) {
  const target = path.resolve(baseDir, ...parts)
  const base = path.resolve(baseDir)
  if (target !== base && !target.startsWith(base + path.sep)) return null
  return target
}

async function listDir(dir) {
  try {
    return await fsp.readdir(dir)
  } catch {
    return []
  }
}

const viCollator = new Intl.Collator('vi', { sensitivity: 'base' })

/** Danh sách model TTS = mọi cặp <tên>.onnx + <tên>.onnx.json trong MODELS_DIR. */
async function listTtsModels(dir = MODELS_DIR) {
  const files = await listDir(dir)
  const set = new Set(files)
  return files
    .filter((f) => f.endsWith('.onnx') && set.has(f + '.json'))
    .map((f) => f.slice(0, -'.onnx'.length))
    .sort(viCollator.compare)
}

/* ------------------------------------------------------------------ */
/* API: models                                                         */
/* ------------------------------------------------------------------ */

// Model tiếng Việt (thư mục models/)
app.get('/api/models', async (_req, res) => {
  res.json({ models: await listTtsModels() })
})

// Model theo ngôn ngữ Piper: models/<lang>/
app.get('/api/piper/:lang/models', async (req, res) => {
  const dir = safeJoin(MODELS_DIR, req.params.lang)
  if (!dir) return res.status(400).json({ error: 'Invalid language' })
  res.json({ models: await listTtsModels(dir) })
})

// Các chế độ / ngôn ngữ hiển thị trên thanh tab
app.get('/api/piper/languages', (_req, res) => {
  res.json({
    languages: [
      { code: 'en', label: 'English', sampleText: '', route: '/en', type: 'i18n' },
      { code: 'id', label: 'Indonesia', sampleText: '', route: '/id', type: 'i18n' },
      { code: 'ms', label: 'Malaysia', sampleText: 'salam kepada aplikasi ini', route: '/ms', type: 'i18n' },
      { code: 'vi', label: 'Tiếng Việt', sampleText: '', route: '/', type: 'vietnamese' },
    ],
  })
})

app.get('/api/asr/models', async (_req, res) => {
  const dirs = []
  for (const name of await listDir(ASR_DIR)) {
    const p = safeJoin(ASR_DIR, name)
    if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) dirs.push(name)
  }
  res.json({ models: dirs.sort() })
})

/* ------------------------------------------------------------------ */
/* API: file model (stream, hỗ trợ Range + cache dài hạn)              */
/* ------------------------------------------------------------------ */

const sendModelFile = (dir) => (req, res) => {
  const rel = decodeURIComponent(req.params[0] || '')
  const file = safeJoin(dir, rel)
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return res.status(404).json({ error: 'Model not found' })
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.setHeader(
    'Content-Type',
    file.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream'
  )
  res.sendFile(file)
}

app.get(/^\/api\/model\/asr\/(.+)$/, (req, res) => sendModelFile(ASR_DIR)(req, res))
app.get(/^\/api\/model\/(.+)$/, (req, res) => sendModelFile(MODELS_DIR)(req, res))

/* ------------------------------------------------------------------ */
/* API: demo samples                                                   */
/* ------------------------------------------------------------------ */

app.get('/api/demo/list', async (_req, res) => {
  const files = await listDir(DEMO_DIR)
  const set = new Set(files)
  const demos = []
  for (const f of files) {
    if (!f.endsWith('.wav')) continue
    const speaker = f.slice(0, -4)
    if (!set.has(speaker + '.txt')) continue
    const st = await fsp.stat(path.join(DEMO_DIR, f))
    demos.push({ speaker, size: st.size, uploaded: st.mtime.toISOString() })
  }
  demos.sort((a, b) => viCollator.compare(a.speaker, b.speaker))
  res.json({ demos })
})

app.get('/api/demo/file/:name', (req, res) => {
  const file = safeJoin(DEMO_DIR, req.params.name)
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Not found' })
  if (file.endsWith('.txt')) res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.sendFile(file)
})

/* ------------------------------------------------------------------ */
/* Static (production) + SPA fallback                                  */
/* ------------------------------------------------------------------ */

if (fs.existsSync(DIST_DIR)) {
  app.use(
    express.static(DIST_DIR, {
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    })
  )
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`NGHI-TTS API  →  http://localhost:${PORT}`)
  console.log(`  models: ${MODELS_DIR}`)
  console.log(`  demo:   ${DEMO_DIR}`)
})
