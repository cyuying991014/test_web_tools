/**
 * 浏览器端复刻 theLongestText/find_longest_language_by_font 的核心规则（首表、Manrope 14px、Canvas 测宽）。
 * 与 Python/PIL 像素值可能略有差异，但排序逻辑一致。
 */
import * as XLSX from 'xlsx'

export const MSG_NO_CC = '请保证iot后台中，国际化-语种管理有cc这个语言'

const EXCLUDED = new Set(['key', 'moduleKey', 'remark', 'cc'])
const KEY_VALUES_TO_DELETE = new Set(['addition_like_1'])
const FONT_SIZE = 14
const FONT_FAMILY = 'Manrope'
const SAMPLE_ROW_END_EXCLUSIVE = 100

let _canvas
let _ctx
let _fontReady = false

function getCtx() {
  if (!_canvas) {
    _canvas = document.createElement('canvas')
    _ctx = _canvas.getContext('2d')
  }
  return _ctx
}

/** @param {string} baseUrl Vite 的 import.meta.env.BASE_URL，如 ./ 或 /repo/ */
export async function ensureManropeLoaded(baseUrl = './') {
  if (_fontReady) return
  const b = (baseUrl || './').endsWith('/') ? baseUrl : `${baseUrl}/`
  const url = `${b}fonts/Manrope-Regular.ttf`
  try {
    const face = new FontFace(FONT_FAMILY, `url(${url})`)
    await face.load()
    document.fonts.add(face)
    await document.fonts.load(`${FONT_SIZE}px ${FONT_FAMILY}`)
    _fontReady = true
  } catch (e) {
    throw new Error(`字体加载失败（${url}）：${e.message || e}`)
  }
}

export function measureTextWidthPx(text) {
  const ctx = getCtx()
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}, sans-serif`
  if (!text) return 0
  let max = 0
  for (const line of String(text).split(/\r?\n/)) {
    const m = ctx.measureText(line)
    const w = m.width
    if (w > max) max = w
  }
  return Math.ceil(max)
}

function matrixFromSheet(ws) {
  if (!ws['!ref']) return [['']]
  const range = XLSX.utils.decode_range(ws['!ref'])
  const rows = []
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row = []
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr]
      if (!cell) {
        row.push('')
        continue
      }
      if (cell.w != null) row.push(String(cell.w))
      else if (cell.v == null) row.push('')
      else row.push(String(cell.v))
    }
    rows.push(row)
  }
  return rows
}

function padRows(matrix, ncol) {
  for (const row of matrix) {
    while (row.length < ncol) row.push('')
  }
}

function buildHeaderMap(headerRow) {
  const map = {}
  for (let c = 0; c < headerRow.length; c++) {
    const h = String(headerRow[c] ?? '').trim()
    if (h) map[h] = c
  }
  return map
}

function findEnIndex(headerRow) {
  for (let c = 0; c < headerRow.length; c++) {
    if (String(headerRow[c] ?? '').trim() === 'en') return c
  }
  return -1
}

function findLastUsedCol(matrix, enIdx, headerLen) {
  let last = Math.max(headerLen - 1, enIdx)
  const lastRowIdx = Math.min(matrix.length - 1, SAMPLE_ROW_END_EXCLUSIVE - 1)
  for (let c = last; c >= enIdx; c--) {
    let has = false
    for (let r = 1; r <= lastRowIdx; r++) {
      const row = matrix[r]
      if (!row) continue
      if (String(row[c] ?? '').trim()) {
        has = true
        break
      }
    }
    if (has) return c
  }
  return enIdx
}

function collectLangCols(headerRow, enIdx, lastIdx, writeCol) {
  const excluded = new Set(EXCLUDED)
  excluded.add(writeCol)
  const cols = []
  for (let c = enIdx; c <= lastIdx; c++) {
    const h = String(headerRow[c] ?? '').trim()
    if (!h || excluded.has(h)) continue
    cols.push(c)
  }
  return cols
}

/**
 * @param {ArrayBuffer} ab
 * @returns {{ outBytes: Uint8Array, downloadName: string, stats: object, lines: string[] }}
 */
export async function processLongestFontXlsx(ab, originalName = 'export.xlsx') {
  const lines = []
  const wb = XLSX.read(ab, { type: 'array', cellDates: true })
  if (!wb.SheetNames.length) throw new Error('工作簿中没有工作表')

  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  let matrix = matrixFromSheet(ws)
  if (matrix.length < 2) throw new Error('表格至少需要表头与一行数据')

  const ncol = Math.max(...matrix.map((r) => r.length))
  padRows(matrix, ncol)

  const headerRow = matrix[0]
  const headerMap = buildHeaderMap(headerRow)
  if (!('cc' in headerMap)) throw new Error(MSG_NO_CC)

  const keyIdx = headerMap['key']
  if (keyIdx !== undefined) {
    let removed = 0
    for (let r = matrix.length - 1; r >= 1; r--) {
      const k = String(matrix[r][keyIdx] ?? '').trim()
      if (KEY_VALUES_TO_DELETE.has(k)) {
        matrix.splice(r, 1)
        removed++
      }
    }
    if (removed) lines.push(`已删除 key 为 addition_like_1 的行：${removed} 行`)
  }

  const ncol2 = Math.max(...matrix.map((r) => r.length), 1)
  padRows(matrix, ncol2)
  const enIdx = findEnIndex(matrix[0])
  if (enIdx < 0) throw new Error("表中未找到列「en」")

  const lastCol = findLastUsedCol(matrix, enIdx, matrix[0].length)
  const ccIdx = headerMap['cc']
  const langCols = collectLangCols(matrix[0], enIdx, lastCol, 'cc')
  if (!langCols.length) throw new Error('从 en 起未找到可参与比较的语言列')

  lines.push(`工作表：${sheetName}；语言列数：${langCols.length}（自 en 至第 ${lastCol + 1} 列范围内）`)

  let processed = 0
  let skipped = 0
  const langStats = {}

  for (let r = 1; r < matrix.length; r++) {
    let bestW = -1
    let bestText = ''
    let bestLang = ''
    let rowHas = false

    for (const c of langCols) {
      const text = String(matrix[r][c] ?? '').trim()
      if (!text) continue
      rowHas = true
      const h = String(matrix[0][c] ?? '').trim()
      const w = measureTextWidthPx(text)
      if (w > bestW || (w === bestW && text.length > bestText.length)) {
        bestW = w
        bestText = text
        bestLang = h
      }
    }

    if (!rowHas) {
      skipped++
      continue
    }

    while (matrix[r].length <= ccIdx) matrix[r].push('')
    matrix[r][ccIdx] = bestText
    processed++
    langStats[bestLang] = (langStats[bestLang] || 0) + 1

    if (processed <= 10) {
      const keyCell = keyIdx !== undefined ? matrix[r][keyIdx] : ''
      lines.push(`行 ${r + 1}: key=${keyCell}, 最长语言=${bestLang}, 排版宽度≈${bestW}px`)
    }
  }

  const newWs = XLSX.utils.aoa_to_sheet(matrix)
  wb.Sheets[sheetName] = newWs

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const stem = originalName.replace(/\.[^.]+$/, '') || 'export'
  const downloadName = `${stem}_最长文案_字体.xlsx`

  return {
    outBytes: new Uint8Array(out),
    downloadName,
    stats: { processed, skipped, sheetName, langStats },
    lines
  }
}
