import assert from 'node:assert/strict'
import { exportCsv, exportJson, exportSql } from '../src/dataGenerator/exporters.js'

const fields = [{ name: 'name', jsonPath: 'user.name' }, { name: 'amount', jsonPath: 'order.amount' }, { name: 'note', jsonPath: 'note' }]
const rows = [{ name: '张三', amount: -12.5, note: '=1+1' }, { name: '李"四', amount: null, note: '换行\n文本' }]
const json = JSON.parse(exportJson(rows, fields))
assert.equal(json[0].user.name, '张三')
assert.equal(json[0].order.amount, -12.5)
assert.throws(() => exportJson(rows, [{ name: 'name', jsonPath: '__proto__.x' }]), /无效/)

const csv = exportCsv(rows, fields)
assert.ok(csv.startsWith('\uFEFF'))
assert.match(csv, /'=1\+1/)
assert.match(csv, /"李""四"/)
assert.match(csv, /"换行\r?\n文本"/)

for (const dialect of ['mysql', 'postgresql', 'sqlite']) {
  const sql = exportSql(rows, fields, { dialect, table: 'qa_users', batchSize: 1, transaction: true })
  assert.match(sql, /INSERT INTO/)
  assert.match(sql, /张三/)
  assert.equal((sql.match(/INSERT INTO/g) || []).length, 2)
}
assert.throws(() => exportSql(rows, fields, { dialect: 'oracle', table: 'x' }), /不支持/)

console.log('测试数据导出验证通过')
