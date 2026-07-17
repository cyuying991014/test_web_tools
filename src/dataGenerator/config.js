import { getCatalogItem } from './catalog.js'

export const GENERATION_MODES = new Set(['valid', 'boundary', 'invalid', 'mixed'])

export function normalizeField(rawField, index = 0) {
  const item = getCatalogItem(rawField.type)
  if (!item) throw new Error(`字段 ${rawField.name || index + 1} 的数据类型不存在`)
  return {
    id: rawField.id || `field-${index + 1}`,
    name: String(rawField.name || `field${index + 1}`).trim(),
    type: rawField.type,
    mode: rawField.mode || 'valid',
    options: { ...item.defaults, ...(rawField.options || {}) },
    unique: Boolean(rawField.unique),
    emptyRate: Number(rawField.emptyRate || 0),
    duplicateRate: Number(rawField.duplicateRate || 0),
    relation: rawField.relation || null,
    jsonPath: String(rawField.jsonPath || rawField.name || `field${index + 1}`).trim()
  }
}

export function normalizeModel(rawModel = {}) {
  const count = Number(rawModel.count ?? 10)
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('生成数量必须是 1～10,000 的整数')
  const fields = (rawModel.fields || []).map(normalizeField)
  if (fields.length === 0) throw new Error('请至少添加一个字段')
  const names = new Set()
  for (const field of fields) {
    if (!field.name) throw new Error('字段名不能为空')
    if (names.has(field.name)) throw new Error(`字段名“${field.name}”重复`)
    names.add(field.name)
    if (!GENERATION_MODES.has(field.mode)) throw new Error(`字段“${field.name}”的数据模式无效`)
    for (const [label, value] of [['空值比例', field.emptyRate], ['重复比例', field.duplicateRate]]) {
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`字段“${field.name}”的${label}必须为 0～100`)
    }
    if (field.unique && field.duplicateRate > 0) throw new Error(`字段“${field.name}”不能同时要求唯一和重复值`)
    if (field.mode === 'mixed') {
      const mix = field.options.mix || { valid: 70, boundary: 15, invalid: 15 }
      const total = Number(mix.valid) + Number(mix.boundary) + Number(mix.invalid)
      if (total !== 100 || Object.values(mix).some((value) => Number(value) < 0)) throw new Error(`字段“${field.name}”的混合比例合计必须为 100%`)
      field.options.mix = { valid: Number(mix.valid), boundary: Number(mix.boundary), invalid: Number(mix.invalid) }
    }
  }
  return {
    version: 1,
    name: String(rawModel.name || '未命名数据模型'),
    count,
    seed: String(rawModel.seed || ''),
    referenceDate: /^\d{4}-\d{2}-\d{2}$/.test(String(rawModel.referenceDate || '')) ? String(rawModel.referenceDate) : new Date().toISOString().slice(0, 10),
    fields,
    includeMeta: Boolean(rawModel.includeMeta)
  }
}
