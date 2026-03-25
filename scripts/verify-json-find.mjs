/**
 * 验证 JSON 树查找高亮：键名 + 字符串值
 * 运行：npm run test:json-find
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="tree" class="json-tree"></div></body></html>', {
  pretendToBeVisual: true
})

globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.Node = dom.window.Node
globalThis.HTMLElement = dom.window.HTMLElement

const { renderJsonTree, applyFindHighlight, resetFindHighlights } = await import('../src/jsonTree.js')

const sample = {
  name: 'Alice',
  role: 'tester',
  nested: { title: '测试中文', note: 'line1\nline2' },
  tags: ['alpha', 'beta'],
  count: 42,
  active: true,
  empty: null
}

const tree = document.getElementById('tree')

function countHits() {
  return tree.querySelectorAll('.json-search-hit').length
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

renderJsonTree(sample, tree)

applyFindHighlight(tree, 'Alice', false)
assert(countHits() === 1, `Alice 应 1 处命中，实际 ${countHits()}`)

resetFindHighlights(tree)
applyFindHighlight(tree, 'name', false)
assert(countHits() >= 1, `键名 name 应至少 1 处命中，实际 ${countHits()}`)

resetFindHighlights(tree)
applyFindHighlight(tree, '测试', false)
assert(countHits() === 1, `测试中文 应 1 处命中，实际 ${countHits()}`)

resetFindHighlights(tree)
applyFindHighlight(tree, 'line1', false)
assert(countHits() === 1, '多行字符串应能命中 line1')

resetFindHighlights(tree)
applyFindHighlight(tree, `line1\nline2`, false)
assert(countHits() === 1, '真实换行应与解析后字符串一致并可命中')

resetFindHighlights(tree)
applyFindHighlight(tree, 'beta', false)
assert(countHits() === 1, `数组字符串 beta 应命中，实际 ${countHits()}`)

resetFindHighlights(tree)
applyFindHighlight(tree, 'NOPE', false)
assert(countHits() === 0, '不存在的内容应 0 命中')

resetFindHighlights(tree)
applyFindHighlight(tree, 'alice', true)
assert(countHits() === 1, '忽略大小写应对 Alice 命中')

resetFindHighlights(tree)
applyFindHighlight(tree, '42', false)
assert(countHits() === 1, `数字值 42 应 1 处命中，实际 ${countHits()}`)

resetFindHighlights(tree)
applyFindHighlight(tree, 'true', false)
assert(countHits() === 1, `布尔 true 应 1 处命中，实际 ${countHits()}`)

resetFindHighlights(tree)
applyFindHighlight(tree, 'null', false)
assert(countHits() === 1, `null 应 1 处命中，实际 ${countHits()}`)

console.log('verify-json-find: 全部通过')
