import assert from 'node:assert/strict'
import { createRandom } from '../src/dataGenerator/random.js'
import { normalizeModel } from '../src/dataGenerator/config.js'
import { generateRows } from '../src/dataGenerator/generateRows.js'
import { isValidCnId, isValidLuhn } from '../src/dataGenerator/validators.js'

const first = createRandom('same-seed')
const second = createRandom('same-seed')
assert.deepEqual(Array.from({ length: 20 }, () => first.next()), Array.from({ length: 20 }, () => second.next()))

assert.throws(() => normalizeModel({ count: 0, fields: [{ name: 'id', type: 'uuid' }] }), /1～10,000/)
assert.throws(() => normalizeModel({ fields: [{ name: 'id', type: 'uuid' }, { name: 'id', type: 'integer' }] }), /重复/)
assert.throws(() => normalizeModel({ fields: [{ name: 'id', type: 'uuid', unique: true, duplicateRate: 10 }] }), /唯一和重复/)

const model = {
  count: 30,
  seed: 'qa-seed',
  referenceDate: '2026-07-17',
  fields: [
    { name: 'id', type: 'uuid', unique: true },
    { name: 'cnId', type: 'cnId' },
    { name: 'imei', type: 'imei' },
    { name: 'phone', type: 'phone' },
    { name: 'amount', type: 'decimal', options: { min: 0, max: 100, decimals: 2 } },
    { name: 'status', type: 'enum', options: { values: ['A', 'B'] } }
  ]
}
const result1 = generateRows(model)
const result2 = generateRows(model)
assert.deepEqual(result1.rows, result2.rows)
assert.equal(new Set(result1.rows.map((row) => row.id)).size, 30)
assert.ok(result1.rows.every((row) => isValidCnId(row.cnId)))
assert.ok(result1.rows.every((row) => isValidLuhn(row.imei)))
assert.ok(result1.rows.every((row) => /^1\d{10}$/.test(row.phone)))

const invalid = generateRows({ count: 4, seed: 'invalid', fields: [{ name: 'cnId', type: 'cnId', mode: 'invalid' }], includeMeta: true })
assert.ok(invalid.rows.every((row) => !isValidCnId(row.cnId) && row._testMeta.cnId.mode === 'invalid'))

const related = generateRows({ count: 8, seed: 'relations', fields: [
  { name: 'cnId', type: 'cnId' },
  { name: 'birthday', type: 'birthDate', relation: { kind: 'birthDateFromCnId', source: 'cnId' } },
  { name: 'gender', type: 'gender', relation: { kind: 'genderFromCnId', source: 'cnId' } },
  { name: 'price', type: 'decimal', options: { min: 1, max: 10, decimals: 2 } },
  { name: 'quantity', type: 'integer', options: { min: 1, max: 5 } },
  { name: 'total', type: 'decimal', relation: { kind: 'multiply', source: 'price', otherSource: 'quantity', decimals: 2 } }
] })
assert.ok(related.rows.every((row) => row.birthday.replaceAll('-', '') === row.cnId.slice(6, 14)))
assert.ok(related.rows.every((row) => row.gender === (Number(row.cnId[16]) % 2 ? '男' : '女')))
assert.ok(related.rows.every((row) => row.total === Number((row.price * row.quantity).toFixed(2))))

const bulk = generateRows({ count: 10000, seed: 'bulk', referenceDate: '2026-07-17', fields: [
  { name: 'id', type: 'uuid', unique: true }, { name: 'phone', type: 'phone' }, { name: 'status', type: 'enum', options: { values: ['正常', '停用'] } }
] })
assert.equal(bulk.rows.length, 10000)
assert.equal(new Set(bulk.rows.map((row) => row.id)).size, 10000)

console.log('测试数据生成器核心验证通过')
