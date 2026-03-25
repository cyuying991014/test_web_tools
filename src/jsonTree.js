/**
 * 可折叠 JSON 树渲染、全部展开/折叠、字符串值与键名内查找高亮、深度替换（字符串值 + 对象键名）
 */

function escapeRegExp(s) {
  return String(s).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')
}

function replaceLeafPrimitive(v, from, to) {
  if (from === '') return { v, added: 0 }
  if (typeof v === 'string') {
    if (!v.includes(from)) return { v, added: 0 }
    const parts = v.split(from)
    return { v: parts.join(to), added: parts.length - 1 }
  }
  if (v === null) {
    const disp = 'null'
    if (!disp.includes(from)) return { v, added: 0 }
    const parts = disp.split(from)
    const next = parts.join(to)
    return next === 'null' ? { v: null, added: parts.length - 1 } : { v, added: 0 }
  }
  if (typeof v === 'number') {
    const disp = String(v)
    if (!disp.includes(from)) return { v, added: 0 }
    const parts = disp.split(from)
    const next = parts.join(to)
    if (next === '') return { v, added: 0 }
    try {
      const p = JSON.parse(next)
      if (typeof p === 'number' && Number.isFinite(p)) return { v: p, added: parts.length - 1 }
    } catch {
      /* ignore */
    }
    return { v, added: 0 }
  }
  if (typeof v === 'boolean') {
    const disp = String(v)
    if (!disp.includes(from)) return { v, added: 0 }
    const parts = disp.split(from)
    const next = parts.join(to)
    if (next === 'true') return { v: true, added: parts.length - 1 }
    if (next === 'false') return { v: false, added: parts.length - 1 }
    return { v, added: 0 }
  }
  return { v, added: 0 }
}

/**
 * 在 JSON 中替换子串：**字符串值**、**数字 / 布尔 / null 的文本形式**、**对象键名**（数组下标不改）
 * 字符串在树中与这里均使用解析后的原始字符，与 JSON 文本里的转义（如 \\n）区分。
 * @returns {{ value: unknown, count: number }}
 */
export function replaceStringValuesInJsonWithStats(value, from, to) {
  if (from === '') return { value, count: 0 }
  let count = 0
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk)
    if (v !== null && typeof v === 'object') {
      const o = {}
      for (const k of Object.keys(v)) {
        let newKey = k
        if (k.includes(from)) {
          const pk = k.split(from)
          count += pk.length - 1
          newKey = pk.join(to)
        }
        o[newKey] = walk(v[k])
      }
      return o
    }
    const { v: nv, added } = replaceLeafPrimitive(v, from, to)
    count += added
    return nv
  }
  return { value: walk(value), count }
}

export function replaceStringValuesInJson(value, from, to) {
  return replaceStringValuesInJsonWithStats(value, from, to).value
}

function textSpan(text, className) {
  const s = document.createElement('span')
  if (className) s.className = className
  s.textContent = text
  return s
}

function punct(ch) {
  return textSpan(ch, 'j-punct')
}

function renderPrimitive(val) {
  if (val === null) return textSpan('null', 'j-null')
  if (typeof val === 'boolean') return textSpan(String(val), 'j-bool')
  if (typeof val === 'number') return textSpan(String(val), 'j-num')
  if (typeof val === 'string') {
    const wrap = document.createElement('span')
    wrap.className = 'j-str-wrap'
    wrap.appendChild(punct('"'))
    const body = document.createElement('span')
    body.className = 'j-string-body'
    /* 与 JSON.parse 后的实际字符串一致，避免用 JSON.stringify 转义导致查找/替换与内存值对不上 */
    body.textContent = val
    wrap.appendChild(body)
    wrap.appendChild(punct('"'))
    return wrap
  }
  return textSpan(String(val), 'j-unknown')
}

function setCollapsed(node, collapsed) {
  node.classList.toggle('j-collapsed', collapsed)
  const btn = node.querySelector(':scope > .j-head > .j-toggle')
  const sum = node.querySelector(':scope > .j-head > .j-collapsed-sum')
  const ch = node.querySelector(':scope > .j-children')
  const foot = node.querySelector(':scope > .j-foot')
  if (btn) btn.textContent = collapsed ? '▶' : '▼'
  if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  if (sum) sum.style.display = collapsed ? 'inline' : 'none'
  if (ch) ch.style.display = collapsed ? 'none' : 'block'
  if (foot) foot.style.display = collapsed ? 'none' : 'block'
}

function makeCollapsibleHead(openChar, summaryText) {
  const head = document.createElement('div')
  head.className = 'j-head'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'j-toggle'
  btn.textContent = '▼'
  btn.setAttribute('aria-expanded', 'true')
  head.appendChild(btn)
  head.appendChild(punct(openChar))
  const sum = document.createElement('span')
  sum.className = 'j-collapsed-sum'
  sum.style.display = 'none'
  sum.textContent = summaryText
  head.appendChild(sum)
  return { head, btn }
}

function renderArray(arr, depth) {
  const node = document.createElement('div')
  node.className = 'j-node'
  const { head, btn } = makeCollapsibleHead('[', ` ${arr.length} 项 … ]`)
  node.appendChild(head)
  const children = document.createElement('div')
  children.className = 'j-children'
  children.style.paddingLeft = '12px'
  arr.forEach((item, i) => {
    const row = document.createElement('div')
    row.className = 'j-row'
    const v = renderValue(item, depth + 1)
    row.appendChild(v)
    if (i < arr.length - 1) row.appendChild(punct(','))
    children.appendChild(row)
  })
  node.appendChild(children)
  const foot = document.createElement('div')
  foot.className = 'j-foot'
  foot.appendChild(punct(']'))
  node.appendChild(foot)
  btn.addEventListener('click', () => setCollapsed(node, !node.classList.contains('j-collapsed')))
  return node
}

function renderObject(obj, depth) {
  const keys = Object.keys(obj)
  const node = document.createElement('div')
  node.className = 'j-node'
  const { head, btn } = makeCollapsibleHead('{', ` ${keys.length} 个键 … }`)
  node.appendChild(head)
  const children = document.createElement('div')
  children.className = 'j-children'
  children.style.paddingLeft = '12px'
  keys.forEach((k, i) => {
    const row = document.createElement('div')
    row.className = 'j-row'
    const keyEl = document.createElement('span')
    keyEl.className = 'j-key'
    keyEl.textContent = JSON.stringify(k)
    row.appendChild(keyEl)
    row.appendChild(punct(': '))
    row.appendChild(renderValue(obj[k], depth + 1))
    if (i < keys.length - 1) row.appendChild(punct(','))
    children.appendChild(row)
  })
  node.appendChild(children)
  const foot = document.createElement('div')
  foot.className = 'j-foot'
  foot.appendChild(punct('}'))
  node.appendChild(foot)
  btn.addEventListener('click', () => setCollapsed(node, !node.classList.contains('j-collapsed')))
  return node
}

function renderValue(val, depth) {
  if (val !== null && typeof val === 'object') {
    if (Array.isArray(val)) return renderArray(val, depth)
    return renderObject(val, depth)
  }
  return renderPrimitive(val)
}

export function renderJsonTree(value, container) {
  container.innerHTML = ''
  container.classList.add('json-tree-root')
  const root = document.createElement('div')
  root.className = 'json-tree-inner'
  root.appendChild(renderValue(value, 0))
  container.appendChild(root)
}

export function expandAllTreeNodes(container) {
  container.querySelectorAll('.json-tree-inner .j-node').forEach((node) => {
    setCollapsed(node, false)
  })
}

export function collapseAllTreeNodes(container) {
  container.querySelectorAll('.json-tree-inner .j-node').forEach((node) => {
    setCollapsed(node, true)
  })
}

/** 可高亮：字符串原始内容、键名、数字/布尔/null 的文本 */
const FIND_TARGET_SELECTOR = '.j-string-body, .j-key, .j-num, .j-bool, .j-null'

/** 去掉查找高亮，还原为纯文本（不重建整棵树） */
export function resetFindHighlights(container) {
  container.querySelectorAll(FIND_TARGET_SELECTOR).forEach((el) => {
    const raw = el.getAttribute('data-raw')
    if (raw !== null) {
      el.textContent = raw
      el.removeAttribute('data-raw')
    }
  })
}

function highlightMatchesInElement(el, query, caseInsensitive) {
  let raw = el.getAttribute('data-raw')
  if (raw === null) raw = el.textContent
  else el.removeAttribute('data-raw')

  el.textContent = ''
  const s = raw
  const re = new RegExp(escapeRegExp(query), caseInsensitive ? 'gi' : 'g')
  el.setAttribute('data-raw', s)

  let last = 0
  let m
  let guard = 0
  const maxIter = Math.max(s.length, 1) * 2 + 16
  while ((m = re.exec(s)) !== null) {
    if (++guard > maxIter) break
    if (m.index > last) el.appendChild(document.createTextNode(s.slice(last, m.index)))
    const mk = document.createElement('mark')
    mk.className = 'json-search-hit'
    mk.textContent = m[0]
    el.appendChild(mk)
    last = m.index + m[0].length
    if (m[0].length === 0) {
      re.lastIndex++
      if (re.lastIndex > s.length) break
    }
  }
  if (last < s.length) el.appendChild(document.createTextNode(s.slice(last)))
}

/**
 * 在已渲染树中，为字符串值与键名文本中的 query 加 <mark>
 * 调用前应先 resetFindHighlights（由调用方保证）
 * @returns 高亮块（.json-search-hit）数量
 */
export function applyFindHighlight(container, query, caseInsensitive) {
  if (!query) {
    resetFindHighlights(container)
    return 0
  }

  container.querySelectorAll(FIND_TARGET_SELECTOR).forEach((el) => {
    highlightMatchesInElement(el, query, caseInsensitive)
  })
  return container.querySelectorAll('.json-search-hit').length
}
