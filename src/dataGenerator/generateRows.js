import { normalizeModel } from './config.js'
import { createAutoSeed, createRandom } from './random.js'
import { generateBoundary, generateInvalid, generateValid } from './generators.js'

function chooseMode(field, random) {
  if (field.mode !== 'mixed') return field.mode
  const roll = random.next() * 100
  if (roll < field.options.mix.valid) return 'valid'
  if (roll < field.options.mix.valid + field.options.mix.boundary) return 'boundary'
  return 'invalid'
}

function generateByMode(field, context, mode) {
  if (mode === 'boundary') return generateBoundary(field.type, field.options, context)
  if (mode === 'invalid') return generateInvalid(field.type, field.options, context)
  return generateValid(field.type, field.options, context)
}

function resolveRelation(field, row, context) {
  const relation = field.relation
  if (!relation) return undefined
  const source = row[relation.source]
  if (source === undefined) throw new Error(`字段“${field.name}”依赖的字段“${relation.source}”尚未生成`)
  switch (relation.kind) {
    case 'copy': return source
    case 'prefix': return `${source}${relation.value ?? ''}`
    case 'suffix': return `${relation.value ?? ''}${source}`
    case 'ageFromBirthDate': {
      const birth = new Date(`${source}T00:00:00Z`)
      if (Number.isNaN(birth.getTime())) throw new Error(`字段“${relation.source}”不是有效出生日期`)
      const now = new Date(`${context.referenceDate}T00:00:00Z`)
      let age = now.getUTCFullYear() - birth.getUTCFullYear()
      const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())
      if (beforeBirthday) age -= 1
      return age
    }
    case 'birthDateFromCnId': {
      const value = String(source)
      if (!/^\d{17}[\dX]$/.test(value)) throw new Error(`字段“${relation.source}”不是有效身份证格式`)
      return `${value.slice(6, 10)}-${value.slice(10, 12)}-${value.slice(12, 14)}`
    }
    case 'genderFromCnId': {
      const value = String(source)
      if (!/^\d{17}[\dX]$/.test(value)) throw new Error(`字段“${relation.source}”不是有效身份证格式`)
      return Number(value[16]) % 2 === 1 ? '男' : '女'
    }
    case 'regionFromCnId': return String(source).slice(0, 6)
    case 'usernameFromName': return `user_${[...String(source)].map((char) => char.codePointAt(0).toString(36)).join('').slice(0, 18)}`
    case 'emailFromName': return `user_${[...String(source)].map((char) => char.codePointAt(0).toString(36)).join('').slice(0, 18)}@example.com`
    case 'endAfterStart': {
      const start = new Date(String(source).replace(' ', 'T') + (String(source).includes('T') ? '' : 'Z'))
      if (Number.isNaN(start.getTime())) throw new Error(`字段“${relation.source}”不是有效时间`)
      const minMinutes = Number(relation.minMinutes ?? 1)
      const maxMinutes = Number(relation.maxMinutes ?? 1440)
      return new Date(start.getTime() + context.random.int(minMinutes, maxMinutes) * 60000).toISOString().slice(0, 19).replace('T', ' ')
    }
    case 'multiply': {
      const value = Number(source) * Number(row[relation.otherSource])
      const decimals = Number(relation.decimals ?? 2)
      return Number(value.toFixed(decimals))
    }
    default: throw new Error(`字段“${field.name}”的关联类型不受支持`)
  }
}

function validateRelationOrder(fields) {
  const indexes = new Map(fields.map((field, index) => [field.name, index]))
  for (const [index, field] of fields.entries()) {
    if (!field.relation) continue
    if (!indexes.has(field.relation.source)) throw new Error(`字段“${field.name}”依赖的字段“${field.relation.source}”不存在`)
    if (indexes.get(field.relation.source) >= index) throw new Error(`字段“${field.name}”必须排在依赖字段“${field.relation.source}”之后`)
    if (field.relation.otherSource && (!indexes.has(field.relation.otherSource) || indexes.get(field.relation.otherSource) >= index)) {
      throw new Error(`字段“${field.name}”的第二个依赖字段无效或顺序错误`)
    }
  }
}

export function generateRows(rawModel) {
  const model = normalizeModel(rawModel)
  validateRelationOrder(model.fields)
  const seed = model.seed || createAutoSeed()
  const random = createRandom(seed)
  const rows = []
  const used = new Map(model.fields.map((field) => [field.name, new Set()]))
  for (let rowIndex = 0; rowIndex < model.count; rowIndex += 1) {
    const row = {}
    const meta = {}
    for (const field of model.fields) {
      const context = { random, rowIndex, row, referenceDate: model.referenceDate }
      const mode = chooseMode(field, random)
      let value
      if (field.emptyRate > 0 && random.next() * 100 < field.emptyRate) {
        value = null
        meta[field.name] = { mode: 'boundary', reason: '按空值比例生成' }
      } else if (field.duplicateRate > 0 && rows.length > 0 && random.next() * 100 < field.duplicateRate) {
        value = random.pick(rows)[field.name]
        meta[field.name] = { mode: 'boundary', reason: '按重复比例复用已有值' }
      } else {
        value = resolveRelation(field, row, context)
        if (value === undefined) value = generateByMode(field, context, mode)
        if (field.unique) {
          let attempts = 0
          while (used.get(field.name).has(JSON.stringify(value)) && attempts < 1000) {
            value = resolveRelation(field, row, context)
            if (value === undefined) value = generateByMode(field, context, mode)
            attempts += 1
          }
          if (used.get(field.name).has(JSON.stringify(value))) throw new Error(`字段“${field.name}”无法生成足够的唯一值`)
        }
        if (mode !== 'valid') meta[field.name] = { mode, reason: mode === 'invalid' ? '按字段规则生成无效值' : '按字段规则生成边界值' }
      }
      row[field.name] = value
      used.get(field.name).add(JSON.stringify(value))
    }
    if (model.includeMeta && Object.keys(meta).length > 0) row._testMeta = meta
    rows.push(row)
  }
  return { rows, seed, model }
}
