/**
 * Sinh file <tên>.wav cho từng <tên>.txt trong server/demo/ bằng chính model
 * cùng tên trong models/ — chạy đúng pipeline như trên trình duyệt, nhưng
 * dùng onnxruntime-node để làm hàng loạt ngoài trình duyệt.
 *
 *   npm run make:demos
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ort from 'onnxruntime-node'
import createEspeakModule from 'espeak-ng'
import { normalizeVietnamese, chunkText, cleanText } from '../src/lib/vietnamese.js'
import { encodeWAV, normalizePeak } from '../src/lib/audio.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODELS_DIR = path.join(ROOT, 'models')
const DEMO_DIR = path.join(ROOT, 'server', 'demo')

async function phonemize(text, voice) {
  const lines = []
  await createEspeakModule({
    arguments: ['-v', voice, '-q', '--ipa', '--', text],
    print: (l) => lines.push(l),
    printErr: () => {},
  })
  return lines.join(' ').replace(/\([a-z-]{2,7}\)/g, '').replace(/\s+/g, ' ').trim()
}

function phonemesToIds(config, phonemes) {
  const map = config.phoneme_id_map
  const ids = [...map['^'], ...map['_']]
  for (const p of phonemes) if (p in map) ids.push(...map[p], ...map['_'])
  ids.push(...map['$'])
  return ids
}

async function synthesize(session, config, sentence) {
  let ipa = await phonemize(sentence, config.espeak?.voice || 'en-us')
  if (!ipa) return null
  const punct = sentence.trim().match(/[.!?,;:]$/)?.[0]
  if (punct && !ipa.endsWith(punct)) ipa += punct

  const ids = phonemesToIds(config, Array.from(ipa.normalize('NFD')))
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([0.667, 1, 0.8]), [3]),
  }
  if ((config.num_speakers ?? 1) > 1) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1])
  }
  const { output } = await session.run(feeds)
  return new Float32Array(output.data)
}

const texts = (await fsp.readdir(DEMO_DIR)).filter((f) => f.endsWith('.txt'))
if (!texts.length) {
  console.log('Không có file .txt nào trong server/demo/')
  process.exit(0)
}

for (const file of texts) {
  const name = file.slice(0, -4)
  const modelPath = path.join(MODELS_DIR, `${name}.onnx`)
  const configPath = `${modelPath}.json`

  if (!fs.existsSync(modelPath) || !fs.existsSync(configPath)) {
    console.log(`· bỏ qua "${name}" — chưa có model cùng tên trong models/`)
    continue
  }

  const text = (await fsp.readFile(path.join(DEMO_DIR, file), 'utf8')).trim()
  const config = JSON.parse(await fsp.readFile(configPath, 'utf8'))
  const session = await ort.InferenceSession.create(modelPath)

  const isVietnamese = (config.espeak?.voice || '').startsWith('vi')
  const prepared = isVietnamese ? normalizeVietnamese(cleanText(text)).toLowerCase() : cleanText(text)

  const parts = []
  for (const sentence of chunkText(prepared)) {
    const audio = await synthesize(session, config, sentence)
    if (audio) parts.push(audio)
  }
  if (!parts.length) {
    console.log(`! "${name}" không sinh được audio`)
    continue
  }

  const merged = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    merged.set(p, offset)
    offset += p.length
  }
  normalizePeak(merged, 1)

  const dest = path.join(DEMO_DIR, `${name}.wav`)
  await fsp.writeFile(dest, Buffer.from(encodeWAV(merged, config.audio?.sample_rate ?? 22050)))
  console.log(`✓ ${name}.wav (${(merged.length / (config.audio?.sample_rate ?? 22050)).toFixed(1)}s)`)
}
