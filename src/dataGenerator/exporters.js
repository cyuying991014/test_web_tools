const BLOCKED_PATHS = new Set(['__proto__', 'prototype', 'constructor'])

function setPath(target, path, value) {
  const parts = String(path).split('.').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0 || parts.some((part) => BLOCKED_PATHS.has(part))) throw new Error(`JSON 输出路径“${path}”无效`)
  let current = target
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    if (current[part] !== undefined && (current[part] === null || typeof current[part] !== 'object' || Array.isArray(current[part]))) {
      throw new Error(`JSON 输出路径“${path}”与已有字段冲突`)
    }
    if (!current[part]) current[part] = Object.create(null)
    current = current[part]
  }
  const finalPart = parts.at(-1)
  if (Object.hasOwn(current, finalPart)) throw new Error(`JSON 输出路径“${path}”重复`)
  current[finalPart] = value
}

function mapJsonRow(row, fields, includeMeta) {
  const output = Object.create(null)
  for (const field of fields) setPath(output, field.jsonPath || field.name, row[field.name])
  if (includeMeta && row._testMeta) output._testMeta = row._testMeta
  return output
}

export function exportJson(rows, fields, options = {}) {
  const mapped = rows.map((row) => mapJsonRow(row, fields, options.includeMeta))
  const value = options.single && mapped.length === 1 ? mapped[0] : mapped
  return JSON.stringify(value, null, options.pretty === false ? 0 : 2)
}

function protectCsvFormula(value) {
  if (typeof value !== 'string' || !/^[=+\-@]/.test(value)) return value
  return `'${value}`
}

function csvCell(value, options) {
  if (value === null || value === undefined) value = options.nullText ? 'null' : ''
  if (typeof value === 'object') value = JSON.stringify(value)
  value = String(protectCsvFormula(value))
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function exportCsv(rows, fields, options = {}) {
  const selected = [...fields.map((field) => field.name), ...(options.includeMeta ? ['_testMode', '_testReason'] : [])]
  const lines = [selected.map((name) => csvCell(name, options)).join(',')]
  for (const row of rows) {
    const values = fields.map((field) => csvCell(row[field.name], options))
    if (options.includeMeta) {
      const entries = Object.entries(row._testMeta || {})
      values.push(csvCell(entries.map(([name, meta]) => `${name}:${meta.mode}`).join(';'), options))
      values.push(csvCell(entries.map(([name, meta]) => `${name}:${meta.reason}`).join(';'), options))
    }
    lines.push(values.join(','))
  }
  return `\uFEFF${lines.join('\r\n')}`
}

const DIALECTS = {
  mysql: { quote: '`', bool: (value) => value ? '1' : '0' },
  postgresql: { quote: '"', bool: (value) => value ? 'TRUE' : 'FALSE' },
  sqlite: { quote: '"', bool: (value) => value ? '1' : '0' }
}

function quoteIdentifier(identifier, dialect) {
  const config = DIALECTS[dialect]
  const parts = String(identifier).split('.')
  if (parts.some((part) => !part || /[\u0000-\u001f]/.test(part))) throw new Error(`SQL 标识符“${identifier}”无效`)
  return parts.map((part) => `${config.quote}${part.replaceAll(config.quote, config.quote + config.quote)}${config.quote}`).join('.')
}

function sqlLiteral(value, dialect) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('SQL 不支持非有限数字')
    return String(value)
  }
  if (typeof value === 'boolean') return DIALECTS[dialect].bool(value)
  if (typeof value === 'object') value = JSON.stringify(value)
  let text = String(value).replaceAll("'", "''")
  if (dialect === 'mysql') text = text.replaceAll('\\', '\\\\')
  return `'${text}'`
}

export function exportSql(rows, fields, options = {}) {
  const dialect = options.dialect || 'mysql'
  if (!DIALECTS[dialect]) throw new Error('不支持的 SQL 方言')
  const table = String(options.table || '').trim()
  if (!table) throw new Error('请输入 SQL 表名')
  const batchSize = Number(options.batchSize ?? 500)
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error('SQL 每批行数必须是 1～1,000')
  const names = fields.map((field) => field.name)
  const statements = []
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize)
    const values = batch.map((row) => `(${names.map((name) => sqlLiteral(row[name], dialect)).join(', ')})`).join(',\n')
    statements.push(`INSERT INTO ${quoteIdentifier(table, dialect)} (${names.map((name) => quoteIdentifier(name, dialect)).join(', ')}) VALUES\n${values};`)
  }
  const body = statements.join('\n\n')
  if (!options.transaction) return body
  if (dialect === 'mysql') return `START TRANSACTION;\n\n${body}\n\nCOMMIT;`
  return `BEGIN;\n\n${body}\n\nCOMMIT;`
}

export function downloadText(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
