import assert from 'node:assert/strict'
import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const requiredIds = [
  'page-data-generator', 'data-generator-quick', 'data-generator-builder', 'data-generator-templates',
  'data-quick-type', 'data-quick-generate', 'data-field-list', 'data-field-editor',
  'data-model-generate', 'data-preview', 'data-export-json', 'data-export-csv', 'data-export-sql',
  'data-template-select', 'data-template-load', 'data-template-save'
]
for (const id of requiredIds) assert.match(html, new RegExp(`id=["']${id}["']`), `缺少页面节点：${id}`)
assert.match(html, /data-site-view="data-generator"/)
assert.match(html, /仅供软件测试使用/)
assert.equal((html.match(/id="page-data-generator"/g) || []).length, 1)

console.log('测试数据生成页面结构验证通过')
