/**
 * Chuẩn hoá văn bản tiếng Việt trước khi đưa vào phonemizer.
 *
 * Thứ tự xử lý (quan trọng — chạy sai thứ tự sẽ ra kết quả sai):
 *   1. Bỏ dấu phân cách nghìn kiểu VN: 1.000.000 -> 1000000
 *   2. Khoảng giá trị / phân số có đơn vị: 5-10 kg, 1/2 lít
 *   3. Ngày tháng: 30/1, 23-1, 22/01/2026
 *   4. Giờ: 14:30, 8h30, 8h
 *   5. Phần trăm: 22%, 5,5%
 *   6. Tiền tệ: 100.000 đồng, $50, 20 USD
 *   7. Số thập phân: 3,14
 *   8. Số La Mã: thế kỷ XXI
 *   9. Số nguyên còn lại
 */

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

const TEENS = {
  10: 'mười',
  11: 'mười một',
  12: 'mười hai',
  13: 'mười ba',
  14: 'mười bốn',
  15: 'mười lăm',
  16: 'mười sáu',
  17: 'mười bảy',
  18: 'mười tám',
  19: 'mười chín',
}

const TENS = {
  2: 'hai mươi',
  3: 'ba mươi',
  4: 'bốn mươi',
  5: 'năm mươi',
  6: 'sáu mươi',
  7: 'bảy mươi',
  8: 'tám mươi',
  9: 'chín mươi',
}

/** Đọc một chuỗi số nguyên (dạng text để giữ được số rất lớn). */
export function readNumber(raw) {
  let s = String(raw)
  if (s.startsWith('-')) return 'âm ' + readNumber(s.slice(1))
  s = s.replace(/^0+/, '') || '0'

  const n = Number.parseInt(s, 10)
  if (!Number.isFinite(n)) return s

  if (n === 0) return 'không'
  if (n < 10) return DIGITS[n]
  if (n < 20) return TEENS[n]

  if (n < 100) {
    const t = Math.floor(n / 10)
    const u = n % 10
    if (u === 0) return TENS[t]
    if (u === 1) return TENS[t] + ' mốt'
    if (u === 4) return TENS[t] + ' tư'
    if (u === 5) return TENS[t] + ' lăm'
    return TENS[t] + ' ' + DIGITS[u]
  }

  if (n < 1_000) {
    const h = Math.floor(n / 100)
    const r = n % 100
    const head = DIGITS[h] + ' trăm'
    if (r === 0) return head
    if (r < 10) return head + ' lẻ ' + DIGITS[r]
    return head + ' ' + readNumber(String(r))
  }

  // Nhóm lớn: nghìn / triệu / tỷ
  const groups = [
    [1_000_000_000_000, 'nghìn tỷ'],
    [1_000_000_000, 'tỷ'],
    [1_000_000, 'triệu'],
    [1_000, 'nghìn'],
  ]
  for (const [unit, label] of groups) {
    if (n >= unit) {
      const head = Math.floor(n / unit)
      const rest = n % unit
      let out = readNumber(String(head)) + ' ' + label
      if (rest === 0) return out
      if (rest < 10) return out + ' không trăm lẻ ' + DIGITS[rest]
      if (rest < 100) return out + ' không trăm ' + readNumber(String(rest))
      return out + ' ' + readNumber(String(rest))
    }
  }

  // Quá lớn: đọc rời từng chữ số
  return s
    .split('')
    .map((d) => DIGITS[Number(d)] ?? d)
    .join(' ')
}

/** Đọc phần thập phân: "3,14" -> "ba phẩy mười bốn" */
function readDecimal(intPart, fracPart) {
  const frac = fracPart.replace(/^0+/, '') || '0'
  return `${readNumber(intPart)} phẩy ${readNumber(frac)}`
}

/* ------------------------------------------------------------------ */
/* Các bước chuẩn hoá                                                  */
/* ------------------------------------------------------------------ */

/** 1.000.000 -> 1000000 (dấu chấm phân cách nghìn kiểu Việt Nam) */
export function stripThousandDots(text) {
  return text.replace(/\d{1,3}(?:\.\d{3})+(?![\d])/g, (m) => m.replace(/\./g, ''))
}

const UNITS = [
  'mm', 'cm', 'dm', 'km', 'hm', 'dam', 'm', 'inch',
  'mg', 'kg', 'g', 'tấn', 'tạ', 'yến', 'lạng', 't',
  'ml', 'lít', 'l',
  'km²', 'km2', 'cm²', 'cm2', 'm²', 'm2', 'ha',
  'km³', 'km3', 'cm³', 'cm3', 'm³', 'm3',
  'km/h', 'kmh', 'm/s', 'mm/h', 'cm/s',
  'sec', 'min', 'hrs', 'hr', 'ms', 's', 'h',
  '°C', '°F', '°K',
]
const CURRENCIES = ['đồng', 'VND', 'vnđ', 'USD', 'đ', '$']
const UNIT_ALT = [...new Set([...UNITS, ...CURRENCIES])]
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

/** "5-10 kg" -> "5 đến 10 kg";  "1/2 lít" -> "1 phần 2 lít" */
export function expandRanges(text) {
  const sep = (u) => (u.toLowerCase() === 'đ' ? '' : ' ')
  text = text.replace(
    new RegExp(`(\\d+)\\s*[-–—]\\s*(\\d+)\\s*(${UNIT_ALT})\\b`, 'gi'),
    (_m, a, b, u) => `${a} đến ${b}${sep(u)}${u}`
  )
  text = text.replace(
    new RegExp(`(\\d+)\\s*[\\/:]\\s*(\\d+)\\s*(${UNIT_ALT})\\b`, 'gi'),
    (_m, a, b, u) => `${a} phần ${b}${sep(u)}${u}`
  )
  return text
}

/** "ngày 30/1", "22/01/2026", "23-1" -> đọc thành "ngày ba mươi tháng một" */
export function expandDates(text) {
  // dd/mm/yyyy
  text = text.replace(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g, (_m, d, mo, y) => {
    const dd = +d, mm = +mo
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return _m
    return `ngày ${readNumber(d)} tháng ${readNumber(mo)} năm ${readNumber(y)}`
  })
  // "ngày 30/1" / "ngày 23-1"
  text = text.replace(/\b(ngày)\s+(\d{1,2})\s*[/-]\s*(\d{1,2})\b/gi, (_m, w, d, mo) => {
    const dd = +d, mm = +mo
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return _m
    return `${w} ${readNumber(d)} tháng ${readNumber(mo)}`
  })
  return text
}

/** "14:30", "8h30", "8h" -> "mười bốn giờ ba mươi" */
export function expandTime(text) {
  text = text.replace(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g, (_m, h, mi, se) => {
    let out = `${readNumber(h)} giờ ${readNumber(mi)} phút`
    if (se) out += ` ${readNumber(se)} giây`
    return out
  })
  text = text.replace(/\b(\d{1,2})h(\d{2})(?![\wà-ỹ])/gi, (m, h, mi) =>
    +h <= 23 && +mi <= 59 ? `${readNumber(h)} giờ ${readNumber(mi)} phút` : m
  )
  text = text.replace(/\b(\d{1,2})h(?![\wà-ỹ\d])/gi, (m, h) =>
    +h <= 23 ? `${readNumber(h)} giờ` : m
  )
  text = text.replace(/(\d+)\s*giờ\s*(\d+)\s*phút/gi, (_m, h, mi) =>
    `${readNumber(h)} giờ ${readNumber(mi)} phút`
  )
  text = text.replace(/(\d+)\s*giờ(?!\s*\d)/gi, (_m, h) => `${readNumber(h)} giờ`)
  return text
}

/** "22%", "5,5%", "10-20%" */
export function expandPercent(text) {
  text = text.replace(/(\d+)\s*[-–—]\s*(\d+)\s*%/g, (_m, a, b) =>
    `${readNumber(a)} đến ${readNumber(b)} phần trăm`
  )
  text = text.replace(/(\d+),(\d+)\s*%/g, (_m, a, b) => `${readDecimal(a, b)} phần trăm`)
  text = text.replace(/(\d+)\s*%/g, (_m, a) => `${readNumber(a)} phần trăm`)
  return text
}

/** "100000 đồng", "$50", "20 USD" */
export function expandCurrency(text) {
  const vnd = (_m, num) => readNumber(num.replace(/[,\s]/g, '')) + ' đồng'
  const usd = (_m, num) => readNumber(num.replace(/[,\s]/g, '')) + ' đô la'

  text = text.replace(/(\d+(?:[,.]\d+)?)\s*(?:đồng|VNĐ|VND|vnđ)\b/gi, vnd)
  text = text.replace(/(\d+(?:[,.]\d+)?)\s*đ(?![\wà-ỹ])/gi, vnd)
  text = text.replace(/\$\s*(\d+(?:[,.]\d+)?)/g, usd)
  text = text.replace(/(\d+(?:[,.]\d+)?)\s*(?:USD|đô la|đô)\b/gi, usd)
  return text
}

/** "3,14" -> "ba phẩy mười bốn" */
export function expandDecimals(text) {
  return text.replace(/(\d+),(\d+)(?![\d,])/g, (_m, a, b) => readDecimal(a, b))
}

const ROMAN_VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }

function romanToInt(s) {
  const up = s.toUpperCase()
  if (!/^[IVXLCDM]+$/.test(up)) return null
  let total = 0
  for (let i = 0; i < up.length; i++) {
    const cur = ROMAN_VALUES[up[i]]
    const next = ROMAN_VALUES[up[i + 1]]
    total += next && next > cur ? -cur : cur
  }
  return total > 0 && total < 4000 ? total : null
}

/**
 * Chỉ đổi số La Mã khi đứng sau từ khoá ngữ cảnh (thế kỷ, chương, quận…)
 * để tránh nuốt nhầm các từ như "I", "V", "MI".
 */
const ROMAN_CONTEXT =
  '(thế kỷ|thế kỉ|chương|phần|quyển|tập|khoá|khóa|kỳ|kì|quận|khu|lớp|loại|đời|vua|hạng|mục|điều|bảng)'

export function expandRoman(text, { unlimited = false } = {}) {
  if (unlimited) {
    return text.replace(/\b([IVXLCDM]{2,})\b/g, (m) => {
      const v = romanToInt(m)
      return v ? readNumber(String(v)) : m
    })
  }
  return text.replace(new RegExp(`\\b${ROMAN_CONTEXT}\\s+([IVXLCDM]+)\\b`, 'gi'), (m, word, num) => {
    const v = romanToInt(num)
    return v ? `${word} ${readNumber(String(v))}` : m
  })
}

/** Số nguyên còn sót lại. */
export function expandIntegers(text) {
  return text.replace(/\d+/g, (m) => readNumber(m))
}

/** Bỏ emoji và ký tự ngoài bảng chữ Latinh mở rộng. */
export function cleanText(text) {
  if (!text) return ''
  const emoji =
    /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F1E6}-\u{1F1FF}]|\u{200D}/gu
  return text
    .replace(emoji, '')
    .replace(/[\\()¯]/g, '')
    .replace(/[“”„«»]/g, '')
    .replace(/\s[—–]\s/g, '. ')
    .replace(/\b_\b/g, ' ')
    .replace(/(?<!\d)-(?!\d)/g, ' ')
    .replace(/[^ -ɏḀ-ỿ\s]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Chạy toàn bộ pipeline chuẩn hoá tiếng Việt. */
export function normalizeVietnamese(text, options = {}) {
  if (!text || typeof text !== 'string') return ''
  let out = text
  out = stripThousandDots(out)
  out = expandRanges(out)
  out = expandDates(out)
  out = expandTime(out)
  out = expandPercent(out)
  out = expandCurrency(out)
  out = expandDecimals(out)
  out = expandRoman(out, { unlimited: options.UnlimitedRomanNumerals === true })
  out = expandIntegers(out)
  return out.replace(/\s{2,}/g, ' ').trim()
}

/**
 * Cắt văn bản thành từng câu để sinh audio theo luồng (streaming).
 * Giữ nguyên ngắt dòng của người dùng như một ranh giới cứng.
 */
export function chunkText(text) {
  const chunks = []
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const withStop = /[.!?]$/.test(trimmed) ? trimmed : trimmed + '.'
    for (const sentence of withStop.split(/(?<=[.!?])(?=\s|$)/)) {
      const s = sentence.trim()
      if (s) chunks.push(s)
    }
  }
  return chunks
}
