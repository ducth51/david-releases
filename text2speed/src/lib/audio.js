/** Bọc dữ liệu PCM float32 và xuất ra WAV 16-bit. */
export class RawAudio {
  constructor(audio, samplingRate) {
    this.audio = audio
    this.sampling_rate = samplingRate
  }

  get length() {
    return this.audio.length
  }

  toBlob() {
    return new Blob([encodeWAV(this.audio, this.sampling_rate)], { type: 'audio/wav' })
  }
}

export function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // kích thước khối fmt
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

/** Chuẩn hoá biên độ, giới hạn hệ số khuếch đại để không thổi phồng nhiễu. */
export function normalizePeak(samples, target = 1) {
  if (!samples?.length) return
  let peak = 1e-9
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  const gain = Math.min(4, target / peak)
  if (gain < 1) for (let i = 0; i < samples.length; i++) samples[i] *= gain
}

const SENTENCE_GAP_SEC = 0.3

/**
 * Nối nhiều RawAudio cùng sample rate thành một, chèn khoảng lặng giữa các
 * câu — mỗi câu là một lần suy luận VITS độc lập với ngữ điệu riêng, dán
 * liền 0ms nghe dồn dập/hụt hơi như đọc không kịp thở.
 */
export function concatAudio(chunks) {
  if (!chunks.length) return null
  const rate = chunks[0].sampling_rate
  const gapLength = Math.round(rate * SENTENCE_GAP_SEC)
  const total = chunks.reduce((sum, c) => sum + c.audio.length, 0) + gapLength * (chunks.length - 1)
  const merged = new Float32Array(total) // khoảng trống mặc định là 0 (lặng)
  let offset = 0
  chunks.forEach((c, i) => {
    merged.set(c.audio, offset)
    offset += c.audio.length + (i < chunks.length - 1 ? gapLength : 0)
  })
  normalizePeak(merged, 1)
  return new RawAudio(merged, rate)
}
