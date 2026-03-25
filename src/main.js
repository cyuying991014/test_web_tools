import './style.css'
import SparkMD5 from 'spark-md5'
import { diffChars } from 'diff'
import { compareJson } from './jsonDiff.js'
import {
  renderJsonTree,
  expandAllTreeNodes,
  collapseAllTreeNodes,
  replaceStringValuesInJsonWithStats,
  applyFindHighlight,
  resetFindHighlights
} from './jsonTree.js'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

const MAX_FILE_MB = 200
const CHUNK = 2 * 1024 * 1024

function showToast(msg) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(showToast._t)
  showToast._t = setTimeout(() => el.classList.remove('show'), 2200)
}

async function copyText(text) {
  if (text == null || text === '') {
    showToast('没有可复制的内容')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    showToast('已复制到剪贴板')
  } catch {
    showToast('复制失败，请手动选择复制')
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function md5Utf8(text) {
  const spark = new SparkMD5.ArrayBuffer()
  spark.append(new TextEncoder().encode(text))
  return spark.end().toLowerCase()
}

function md5FileChunked(file) {
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer()
    const fr = new FileReader()
    let offset = 0
    fr.onload = (e) => {
      spark.append(e.target.result)
      offset += e.target.result.byteLength
      if (offset >= file.size) {
        resolve(spark.end().toLowerCase())
      } else {
        loadChunk()
      }
    }
    fr.onerror = () => reject(new Error('读取文件失败'))
    function loadChunk() {
      const end = Math.min(offset + CHUNK, file.size)
      fr.readAsArrayBuffer(file.slice(offset, end))
    }
    loadChunk()
  })
}

/* —— 导航 —— */
;(function initNav() {
  const links = document.querySelectorAll('.nav-group a[href^="#"]')
  const sections = document.querySelectorAll('.section[id]')
  function setActive(id) {
    links.forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + id)
    })
  }
  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault()
      const id = a.getAttribute('href').slice(1)
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setActive(id)
      }
    })
  })
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.25) {
          setActive(entry.target.id)
        }
      })
    },
    { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5] }
  )
  sections.forEach((sec) => observer.observe(sec))
  if (sections.length) setActive(sections[0].id)
})()

/* —— 文件 MD5 —— */
let lastFileMd5 = ''
const md5FileInput = document.getElementById('md5-file-input')
const md5FileDrop = document.getElementById('md5-file-drop')
const md5FileOut = document.getElementById('md5-file-output')
const md5FileOutWrap = document.getElementById('md5-file-output-wrap')
const md5FileCopy = document.getElementById('md5-file-copy')

function setFileMd5Result(text, isError = false) {
  lastFileMd5 = isError ? '' : text
  md5FileOut.textContent = text
  md5FileOutWrap.classList.toggle('muted', isError || !text)
  md5FileOutWrap.classList.toggle('err', isError)
  md5FileCopy.disabled = !lastFileMd5
}

async function handleFile(file) {
  if (!file) return
  const maxBytes = MAX_FILE_MB * 1024 * 1024
  if (file.size > maxBytes) {
    setFileMd5Result(`文件超过 ${MAX_FILE_MB} MB 限制，未计算。`, true)
    return
  }
  setFileMd5Result('正在计算 MD5，请稍候…')
  md5FileCopy.disabled = true
  try {
    const hash = await md5FileChunked(file)
    setFileMd5Result(hash, false)
  } catch (e) {
    setFileMd5Result(e.message || '计算失败', true)
  }
}

document.getElementById('md5-file-pick').addEventListener('click', () => md5FileInput.click())
md5FileInput.addEventListener('change', () => {
  const f = md5FileInput.files?.[0]
  if (f) handleFile(f)
  md5FileInput.value = ''
})

;['dragenter', 'dragover'].forEach((ev) => {
  md5FileDrop.addEventListener(ev, (e) => {
    e.preventDefault()
    e.stopPropagation()
    md5FileDrop.classList.add('dragover')
  })
})
;['dragleave', 'drop'].forEach((ev) => {
  md5FileDrop.addEventListener(ev, (e) => {
    e.preventDefault()
    e.stopPropagation()
    md5FileDrop.classList.remove('dragover')
  })
})
md5FileDrop.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0]
  if (f) handleFile(f)
})
md5FileDrop.addEventListener('click', () => md5FileInput.click())
md5FileDrop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    md5FileInput.click()
  }
})

document.getElementById('md5-file-clear').addEventListener('click', () => {
  setFileMd5Result('MD5 结果将显示在这里', false)
  md5FileOutWrap.classList.remove('err')
  md5FileOutWrap.classList.add('muted')
})

md5FileCopy.addEventListener('click', () => copyText(lastFileMd5))

/* —— 文本 MD5 —— */
const md5TextInput = document.getElementById('md5-text-input')
const md5TextOut = document.getElementById('md5-text-output')
const md5TextWrap = document.getElementById('md5-text-output-wrap')
let lastTextMd5 = ''

document.getElementById('md5-text-calc').addEventListener('click', () => {
  const t = md5TextInput.value
  if (t.length > 5_000_000) {
    showToast('文本较长，计算可能稍慢')
  }
  try {
    lastTextMd5 = md5Utf8(t)
    md5TextOut.textContent = lastTextMd5
    md5TextWrap.classList.remove('muted', 'err')
  } catch (e) {
    md5TextOut.textContent = e.message || '计算失败'
    md5TextWrap.classList.add('err')
    md5TextWrap.classList.remove('muted')
    lastTextMd5 = ''
  }
})

document.getElementById('md5-text-copy').addEventListener('click', () => copyText(lastTextMd5))

/* —— JSON 树 + 查找替换 —— */
const jsonInput = document.getElementById('json-input')
const jsonTreeEl = document.getElementById('json-tree')
const jsonToolbar = document.getElementById('json-toolbar')
const jsonError = document.getElementById('json-error')
const jsonFindInput = document.getElementById('json-find')
const jsonFindCi = document.getElementById('json-find-ci')
const jsonFindMeta = document.getElementById('json-find-meta')
let jsonParsedData = null
/** 最近一次非空的查找关键字（查找框清空后，替换仍可沿用） */
let lastNonEmptyFindQuery = ''
let findActiveIdx = 0

function debounce(fn, ms) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

/** 同步查找命中数、当前项高亮与说明文案（resetIndex：是否将当前项重置为第 1 处） */
function syncJsonFindUi(resetIndex) {
  if (!jsonFindMeta) return
  const hits = [...jsonTreeEl.querySelectorAll('.json-search-hit')]
  hits.forEach((el) => el.classList.remove('json-search-hit-active'))
  if (hits.length === 0) {
    const q = jsonFindInput.value.trim()
    jsonFindMeta.textContent = q ? '共 0 处匹配' : '（输入关键字后点「高亮」或稍停自动高亮）'
    return
  }
  if (resetIndex) findActiveIdx = 0
  findActiveIdx = ((findActiveIdx % hits.length) + hits.length) % hits.length
  const active = hits[findActiveIdx]
  active.classList.add('json-search-hit-active')
  active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  jsonFindMeta.textContent = `共 ${hits.length} 处匹配 · 当前第 ${findActiveIdx + 1} 处`
}

/** 仅更新查找高亮，不重建树（保留折叠状态） */
function updateJsonFindHighlight() {
  if (jsonParsedData === null) return
  const q = jsonFindInput.value.trim()
  if (q) lastNonEmptyFindQuery = q
  resetFindHighlights(jsonTreeEl)
  if (q) applyFindHighlight(jsonTreeEl, q, jsonFindCi.checked)
  syncJsonFindUi(true)
}

/** 从内存数据重绘整棵树，再套当前查找条件 */
function rebuildJsonTreeFromData() {
  if (jsonParsedData === null) return
  renderJsonTree(jsonParsedData, jsonTreeEl)
  const q = jsonFindInput.value.trim() || lastNonEmptyFindQuery
  resetFindHighlights(jsonTreeEl)
  if (q) applyFindHighlight(jsonTreeEl, q, jsonFindCi.checked)
  syncJsonFindUi(true)
}

const debouncedJsonFind = debounce(() => {
  if (jsonParsedData !== null) updateJsonFindHighlight()
}, 300)

document.getElementById('json-format').addEventListener('click', () => {
  try {
    const obj = JSON.parse(jsonInput.value)
    jsonParsedData = obj
    jsonError.style.display = 'none'
    jsonToolbar.style.display = 'block'
    rebuildJsonTreeFromData()
  } catch (e) {
    jsonParsedData = null
    jsonToolbar.style.display = 'none'
    jsonTreeEl.innerHTML =
      '<p class="json-tree-placeholder">请先点击「格式化」生成可折叠树状视图</p>'
    jsonError.style.display = 'block'
    jsonError.textContent = 'JSON 解析失败：' + (e.message || String(e))
  }
})

jsonFindInput.addEventListener('input', debouncedJsonFind)
jsonFindInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    updateJsonFindHighlight()
    return
  }
  if (e.key === 'F3') {
    const hits = jsonTreeEl.querySelectorAll('.json-search-hit')
    if (hits.length === 0) return
    e.preventDefault()
    findActiveIdx = e.shiftKey
      ? (findActiveIdx - 1 + hits.length) % hits.length
      : (findActiveIdx + 1) % hits.length
    syncJsonFindUi(false)
  }
})

document.getElementById('json-find-run').addEventListener('click', () => {
  updateJsonFindHighlight()
  const q = jsonFindInput.value.trim()
  if (!q) showToast('请输入要查找的内容')
  else {
    const n = jsonTreeEl.querySelectorAll('.json-search-hit').length
    if (n === 0) showToast('未在键名或值（字符串/数字/布尔/null）中找到匹配')
    else showToast(`共找到 ${n} 处匹配`)
  }
})

document.getElementById('json-find-prev').addEventListener('click', () => {
  const hits = jsonTreeEl.querySelectorAll('.json-search-hit')
  if (hits.length === 0) {
    showToast('当前无匹配项，请先高亮查找')
    return
  }
  findActiveIdx = (findActiveIdx - 1 + hits.length) % hits.length
  syncJsonFindUi(false)
})

document.getElementById('json-find-next').addEventListener('click', () => {
  const hits = jsonTreeEl.querySelectorAll('.json-search-hit')
  if (hits.length === 0) {
    showToast('当前无匹配项，请先高亮查找')
    return
  }
  findActiveIdx = (findActiveIdx + 1) % hits.length
  syncJsonFindUi(false)
})

jsonFindInput.addEventListener('compositionend', debouncedJsonFind)

jsonFindCi.addEventListener('change', () => {
  if (jsonParsedData !== null) updateJsonFindHighlight()
})

document.getElementById('json-repl-all').addEventListener('click', () => {
  if (jsonParsedData === null) {
    showToast('请先成功格式化 JSON')
    return
  }
  const fromRepl = document.getElementById('json-repl-from').value.trim()
  const fromFind = jsonFindInput.value.trim()
  const from = fromRepl || fromFind || lastNonEmptyFindQuery
  if (from === '') {
    showToast('请填写「要替换的字符串」，或先执行一次查找（清空查找框后仍沿用上次关键字）')
    return
  }
  const to = document.getElementById('json-repl-to').value
  const { value, count } = replaceStringValuesInJsonWithStats(jsonParsedData, from, to)
  jsonParsedData = value
  rebuildJsonTreeFromData()
  if (count === 0) {
    showToast('未在键名或值（字符串/数字/布尔/null）中替换到任何内容')
  } else {
    showToast(`已在键名与各类值中替换 ${count} 处`)
  }
})

document.getElementById('json-expand-all').addEventListener('click', () => {
  if (jsonParsedData === null) return
  expandAllTreeNodes(jsonTreeEl)
})

document.getElementById('json-collapse-all').addEventListener('click', () => {
  if (jsonParsedData === null) return
  collapseAllTreeNodes(jsonTreeEl)
})

document.getElementById('json-copy').addEventListener('click', () => {
  if (jsonParsedData === null) {
    showToast('请先成功格式化 JSON')
    return
  }
  copyText(JSON.stringify(jsonParsedData, null, 2))
})

/* —— 时间戳 ↔ 时间 —— */
const tsInput = document.getElementById('ts-input')
const tsOut = document.getElementById('ts-output')
const tsWrap = document.getElementById('ts-output-wrap')

document.getElementById('ts-convert').addEventListener('click', () => {
  const raw = tsInput.value.trim().replace(/\s+/g, '')
  if (!raw) {
    tsOut.textContent = '请输入时间戳'
    tsWrap.classList.add('err')
    tsWrap.classList.remove('muted')
    return
  }
  if (!/^\d+$/.test(raw)) {
    tsOut.textContent = '仅支持数字（整数时间戳）'
    tsWrap.classList.add('err')
    tsWrap.classList.remove('muted')
    return
  }
  const msMode = document.getElementById('ts-in-ms').checked
  let ms = msMode ? Number(raw) : Number(raw) * 1000
  if (!Number.isFinite(ms)) {
    tsOut.textContent = '数值无效'
    tsWrap.classList.add('err')
    tsWrap.classList.remove('muted')
    return
  }
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) {
    tsOut.textContent = '无法解析为合法时间'
    tsWrap.classList.add('err')
    tsWrap.classList.remove('muted')
    return
  }
  tsOut.textContent = d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  tsWrap.classList.remove('muted', 'err')
})

function formatBeijingNowText() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
}

/** 将「北京时间墙钟」解析为 UTC 毫秒（上海无夏令时，固定 UTC+8） */
function parseBeijingWallToUtcMs(str) {
  const m = str
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const y = +m[1]
  const mo = +m[2]
  const d = +m[3]
  const h = +m[4]
  const mi = +m[5]
  const s = +(m[6] ?? 0)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null
  return Date.UTC(y, mo - 1, d, h - 8, mi, s)
}

const dtBj = document.getElementById('dt-bj')
const dtTsOut = document.getElementById('dt-ts-out')
const dtTsWrap = document.getElementById('dt-ts-wrap')
const dtTsCopy = document.getElementById('dt-ts-copy')
let lastDtTsNumeric = ''

function setDtTsResult(text, numericForCopy, isError) {
  lastDtTsNumeric = isError ? '' : numericForCopy
  dtTsOut.textContent = text
  dtTsWrap.classList.toggle('muted', isError || !text)
  dtTsWrap.classList.toggle('err', isError)
  dtTsCopy.disabled = !lastDtTsNumeric
}

dtBj.value = formatBeijingNowText()

document.getElementById('dt-fill-bj').addEventListener('click', () => {
  dtBj.value = formatBeijingNowText()
  showToast('已填入当前北京时间')
})

document.getElementById('dt-convert').addEventListener('click', () => {
  const ms = parseBeijingWallToUtcMs(dtBj.value)
  if (ms === null) {
    setDtTsResult('格式不正确，请使用 YYYY-MM-DD HH:mm:ss（北京时间）', '', true)
    return
  }
  const wantMs = document.getElementById('dt-out-ms').checked
  const msB = BigInt(ms)
  const s = wantMs ? msB.toString() : (msB / 1000n).toString()
  const label = wantMs ? '毫秒' : '秒'
  setDtTsResult(`${label}：${s}`, s, false)
})

dtTsCopy.addEventListener('click', () => copyText(lastDtTsNumeric))

/* —— 比较 —— */
const cmpJsonOut = document.getElementById('cmp-json-out')
const cmpTextOutWrap = document.getElementById('cmp-text-out-wrap')
const cmpOutLeft = document.getElementById('cmp-out-left')
const cmpOutRight = document.getElementById('cmp-out-right')
const cmpStrictRow = document.getElementById('cmp-strict-row')

function bindSyncedScrollPair(a, b) {
  let syncing = false
  function sync(src, dst) {
    if (syncing) return
    syncing = true
    dst.scrollTop = src.scrollTop
    dst.scrollLeft = src.scrollLeft
    syncing = false
  }
  a.addEventListener('scroll', () => sync(a, b))
  b.addEventListener('scroll', () => sync(b, a))
}

let cmpScrollBound = false
function ensureCompareScrollSync() {
  if (cmpScrollBound) return
  cmpScrollBound = true
  bindSyncedScrollPair(cmpOutLeft, cmpOutRight)
}

function updateCompareModeUi() {
  const jsonMode = document.getElementById('cmp-mode-json').checked
  cmpStrictRow.style.display = jsonMode ? '' : 'none'
}

document.querySelectorAll('input[name="cmp-mode"]').forEach((r) => {
  r.addEventListener('change', updateCompareModeUi)
})
updateCompareModeUi()

document.getElementById('cmp-run').addEventListener('click', () => {
  const left = document.getElementById('cmp-left').value
  const right = document.getElementById('cmp-right').value
  const jsonMode = document.getElementById('cmp-mode-json').checked

  if (jsonMode) {
    cmpTextOutWrap.style.display = 'none'
    cmpOutLeft.innerHTML = ''
    cmpOutRight.innerHTML = ''
    cmpJsonOut.style.display = 'block'
    let a
    let b
    try {
      a = JSON.parse(left)
    } catch (e) {
      cmpJsonOut.innerHTML = `<div class="line err">左侧 JSON 解析失败：${escapeHtml(e.message)}</div>`
      return
    }
    try {
      b = JSON.parse(right)
    } catch (e) {
      cmpJsonOut.innerHTML = `<div class="line err">右侧 JSON 解析失败：${escapeHtml(e.message)}</div>`
      return
    }
    const strict = document.getElementById('cmp-strict-yes').checked
    const { equal, diffs } = compareJson(a, b, { strict })
    if (equal) {
      cmpJsonOut.innerHTML = '<div class="ok">结构一致，无差异。</div>'
      return
    }
    cmpJsonOut.innerHTML = diffs
      .map(
        (d) =>
          `<div class="line"><span class="path">${escapeHtml(d.path)}</span>：${escapeHtml(d.text)}</div>`
      )
      .join('')
  } else {
    cmpJsonOut.style.display = 'none'
    cmpJsonOut.innerHTML = ''
    cmpTextOutWrap.style.display = 'block'
    ensureCompareScrollSync()

    if (left === '' && right === '') {
      cmpOutLeft.textContent = '（两侧均为空）'
      cmpOutRight.textContent = '（两侧均为空）'
      return
    }

    const parts = diffChars(left, right)
    let leftHtml = ''
    let rightHtml = ''
    for (const p of parts) {
      const v = escapeHtml(p.value)
      if (p.removed) leftHtml += `<span class="diff-differ">${v}</span>`
      else if (!p.added) leftHtml += v
      if (p.added) rightHtml += `<span class="diff-differ">${v}</span>`
      else if (!p.removed) rightHtml += v
    }
    cmpOutLeft.innerHTML = leftHtml || '<span class="muted-inline">（无内容）</span>'
    cmpOutRight.innerHTML = rightHtml || '<span class="muted-inline">（无内容）</span>'
  }
})

/* —— 颜色（输入 RGB / Hex 二选一） —— */
const colorRgb = document.getElementById('color-rgb')
const colorHex = document.getElementById('color-hex')
const colorSwatch = document.getElementById('color-swatch')
const colorResult = document.getElementById('color-result')
const colorResultWrap = document.getElementById('color-result-wrap')
const colorSrcRgb = document.getElementById('color-src-rgb')
const colorSrcHex = document.getElementById('color-src-hex')
let lastColorCopy = ''

function expandHex3(h) {
  if (h.length === 3) {
    return h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  return h
}

function parseHexInput(str) {
  const s = str.trim().replace(/^#/, '').toLowerCase()
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(s)) return null
  const full = expandHex3(s)
  const n = parseInt(full, 16)
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    hex: '#' + full
  }
}

function parseRgbInput(str) {
  const m = str.trim().match(/^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/)
  if (!m) return null
  const r = Number(m[1])
  const g = Number(m[2])
  const b = Number(m[3])
  if (r > 255 || g > 255 || b > 255) return null
  const toHex = (x) => x.toString(16).padStart(2, '0')
  return { r, g, b, hex: '#' + toHex(r) + toHex(g) + toHex(b) }
}

function setSwatch(c) {
  colorSwatch.style.background = `rgb(${c.r},${c.g},${c.b})`
}

function syncColorInputMode() {
  const rgbMode = colorSrcRgb.checked
  document.getElementById('color-rgb-field-wrap').style.display = rgbMode ? 'block' : 'none'
  document.getElementById('color-hex-field-wrap').style.display = rgbMode ? 'none' : 'block'
  if (rgbMode) colorHex.value = ''
  else colorRgb.value = ''
}

document.querySelectorAll('input[name="color-src"]').forEach((r) => {
  r.addEventListener('change', syncColorInputMode)
})
syncColorInputMode()

document.getElementById('color-convert').addEventListener('click', () => {
  const rgbMode = colorSrcRgb.checked
  const c = rgbMode ? parseRgbInput(colorRgb.value) : parseHexInput(colorHex.value)
  if (!c) {
    showToast(rgbMode ? '请输入合法的 RGB（R,G,B）' : '请输入合法的 Hex')
    return
  }
  setSwatch(c)
  colorResult.textContent = `HEX：${c.hex}     RGB：${c.r},${c.g},${c.b}`
  colorResultWrap.classList.remove('muted')
  lastColorCopy = `${c.hex}  RGB(${c.r},${c.g},${c.b})`
})

document.getElementById('color-copy').addEventListener('click', () => copyText(lastColorCopy))

/* —— 进制转换 —— */
const radixInput = document.getElementById('radix-input')
const radixResults = document.getElementById('radix-results')
const MAX_BIN_DIGITS = 512
const MAX_HEX_DIGITS = 128
const MAX_DEC_DIGITS = 155

function parseRadixInput(str, base) {
  const t = str.trim().replace(/\s+/g, '')
  if (t === '') return { error: 'empty' }
  if (base === 2) {
    let s = t.replace(/^0b/i, '')
    if (!/^[01]+$/.test(s)) return { error: 'bin' }
    if (s.length > MAX_BIN_DIGITS) return { error: 'long' }
    return { value: BigInt('0b' + s) }
  }
  if (base === 10) {
    if (!/^-?\d+$/.test(t)) return { error: 'dec' }
    if (t.replace(/^-/, '').length > MAX_DEC_DIGITS) return { error: 'long' }
    return { value: BigInt(t) }
  }
  if (base === 16) {
    let s = t.replace(/^0x/i, '')
    if (!/^[0-9a-fA-F]+$/.test(s)) return { error: 'hex' }
    if (s.length > MAX_HEX_DIGITS) return { error: 'long' }
    return { value: BigInt('0x' + s) }
  }
  return { error: 'base' }
}

document.getElementById('radix-convert').addEventListener('click', () => {
  const base = +document.querySelector('input[name="radix-in-base"]:checked').value
  const parsed = parseRadixInput(radixInput.value, base)
  if (parsed.error === 'empty') {
    radixResults.textContent = '请输入要转换的数字'
    radixResults.classList.add('err', 'muted')
    return
  }
  if (parsed.error === 'long') {
    radixResults.textContent = '数字位数过长，请缩短后再试'
    radixResults.classList.add('err', 'muted')
    return
  }
  if (parsed.error) {
    radixResults.textContent = '格式与所选进制不符，请检查输入'
    radixResults.classList.add('err', 'muted')
    return
  }
  const n = parsed.value
  const bin = n.toString(2)
  const dec = n.toString(10)
  const hex = n.toString(16).toLowerCase()
  radixResults.innerHTML = `二进制：<strong>0b${bin}</strong><br />十进制：<strong>${dec}</strong><br />十六进制：<strong>0x${hex}</strong>`
  radixResults.classList.remove('err', 'muted')
})
