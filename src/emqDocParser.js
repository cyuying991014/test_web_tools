/**
 * 从 Sphinx/文档页解析「设备属性表」（与 device_shadow_tool.load_field_descriptions 逻辑对齐）
 */

function logLine(log, msg) {
  if (typeof log === 'function') log(msg)
}

function parseHtml(html) {
  const p = new DOMParser()
  return p.parseFromString(html, 'text/html')
}

function findToctree(doc) {
  const divs = doc.querySelectorAll('div.toctree-wrapper')
  for (const div of divs) {
    if (div.classList.contains('compound')) return div
  }
  return doc.querySelector('div.toctree-wrapper')
}

function resolveUrl(base, href) {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

/**
 * @param {string} docUrl
 * @param {(line: string) => void} log
 * @returns {Promise<Record<string, { attr_name: string, description: string }>>}
 */
export async function fetchAndParseFieldDescriptions(docUrl, log = () => {}) {
  const base = docUrl.trim()
  if (!base) throw new Error('请输入文档 URL')

  logLine(log, '【步骤1】请求入口页…')
  const r1 = await fetch(base, { credentials: 'omit' })
  if (!r1.ok) throw new Error(`入口页 HTTP ${r1.status}`)
  const html1 = await r1.text()
  const doc1 = parseHtml(html1)

  const wrapper = findToctree(doc1)
  if (!wrapper) {
    throw new Error("未找到 class 含 toctree-wrapper 与 compound 的区域")
  }

  const matched = []
  wrapper.querySelectorAll('a[href]').forEach((a) => {
    const t = a.textContent?.trim() || ''
    if (t.includes('设备属性表')) {
      const href = a.getAttribute('href') || ''
      if (href) matched.push({ text: t, href, fullUrl: resolveUrl(base, href) })
    }
  })

  if (!matched.length) {
    throw new Error("在目录区域未找到「设备属性表」链接")
  }

  const target = matched[matched.length - 1]
  logLine(log, `选用链接：${target.text} → ${target.href}`)

  const hash = target.href.includes('#') ? target.href.split('#').pop() : ''
  if (!hash) throw new Error('链接中无锚点（如 #id31），无法定位章节')

  logLine(log, '【步骤2】请求属性表页…')
  const pageUrl = target.fullUrl.split('#')[0]
  const r2 = await fetch(pageUrl, { credentials: 'omit' })
  if (!r2.ok) throw new Error(`属性表页 HTTP ${r2.status}`)
  const html2 = await r2.text()
  const doc2 = parseHtml(html2)

  const section = doc2.getElementById(hash) || doc2.querySelector(`section[id="${hash.replace(/"/g, '')}"]`)
  if (!section) {
    throw new Error(`未找到 id 为「${hash}」的章节或 section`)
  }

  const tables = section.querySelectorAll('table')
  if (!tables.length) throw new Error('该章节内没有表格')

  const table = tables[0]
  const fieldDescriptions = parseAttributeTable(table, log)
  return fieldDescriptions
}

function parseAttributeTable(table, log) {
  let headerTexts = []
  const ths = table.querySelectorAll('tr th')
  if (ths.length) {
    headerTexts = [...ths].map((th) => th.textContent?.trim() || '')
  } else {
    const firstRow = table.querySelector('tr')
    if (firstRow) {
      const tds = firstRow.querySelectorAll('td')
      if (tds.length) headerTexts = [...tds].map((td) => td.textContent?.trim() || '')
    }
  }

  if (!headerTexts.length) throw new Error('表格无表头')

  logLine(log, `表格列：${headerTexts.join(' | ')}`)

  let fieldIdx = -1
  let attrIdx = -1
  let descIdx = -1
  headerTexts.forEach((text, idx) => {
    if (['字段名', 'field', 'Field', '参数名'].some((k) => text.includes(k))) fieldIdx = idx
    if (['属性名称', '属性名', 'attribute'].some((k) => text.includes(k))) attrIdx = idx
    if (['描述', '说明', 'description', 'Description', '备注'].some((k) => text.includes(k)))
      descIdx = idx
  })

  if (fieldIdx < 0) throw new Error("未找到「字段名」列")
  if (descIdx < 0) throw new Error("未找到「描述」列")
  if (attrIdx < 0) logLine(log, '未找到「属性名称」列（可选）')

  const rows = table.querySelectorAll('tr')
  const out = {}
  let start = 1
  if (rows[0]) {
    const tds0 = rows[0].querySelectorAll('td')
    if (tds0.length && [...tds0].some((td) => /字段名|描述|field/i.test(td.textContent || ''))) {
      start = 1
    }
  }

  const headerKeywords = ['字段名', '描述', 'field', '属性名称']

  for (let i = start; i < rows.length; i++) {
    const cols = rows[i].querySelectorAll('td, th')
    const maxIdx = Math.max(fieldIdx, descIdx, attrIdx >= 0 ? attrIdx : 0)
    if (cols.length <= maxIdx) continue

    const fieldRaw = cols[fieldIdx]?.textContent?.trim() || ''
    const description = cols[descIdx]?.innerText?.trim() || ''
    let attrName = ''
    if (attrIdx >= 0 && cols[attrIdx]) attrName = cols[attrIdx].textContent?.trim() || ''

    if (!fieldRaw || !description) continue
    if (headerKeywords.some((k) => fieldRaw.includes(k) && fieldRaw.length < 20)) continue

    const m = fieldRaw.match(/[（(]([^）)]+)[）)]/)
    let fieldName = m ? m[1].trim() : fieldRaw
    const displayName = fieldRaw
    if (!attrName && m) {
      attrName = displayName.slice(0, m.index).trim()
    }
    if (!attrName) attrName = fieldName

    out[fieldName] = {
      attr_name: attrName,
      description
    }
  }

  if (!Object.keys(out).length) throw new Error('未解析到任何字段行')
  return out
}
