import assert from 'node:assert/strict'
import fs from 'node:fs'
import { JSDOM } from 'jsdom'
import { generateRows } from '../src/dataGenerator/generateRows.js'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage
globalThis.Blob = dom.window.Blob

class FakeWorker {
  listeners = new Map()
  addEventListener(type, listener) { this.listeners.set(type, listener) }
  postMessage(message) {
    queueMicrotask(() => {
      try {
        this.listeners.get('message')?.({ data: { type: 'complete', taskId: message.taskId, result: generateRows(message.model) } })
      } catch (error) {
        this.listeners.get('message')?.({ data: { type: 'error', taskId: message.taskId, message: error.message } })
      }
    })
  }
  terminate() {}
}
globalThis.Worker = FakeWorker

const { initDataGenerator } = await import('../src/dataGenerator/dataGeneratorApp.js')
const copied = []
initDataGenerator({ showToast() {}, copyText(value) { copied.push(value) } })

document.querySelector('[data-site-view="data-generator"]').click()
assert.equal(document.getElementById('page-data-generator').hidden, false)

document.getElementById('data-quick-count').value = '3'
document.getElementById('data-quick-seed').value = 'ui-seed'
document.getElementById('data-quick-generate').click()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.match(document.getElementById('data-quick-summary').textContent, /3 条/)
assert.equal(document.getElementById('data-quick-result').textContent.trim().split('\n').length, 3)

document.querySelector('[data-generator-view="builder"]').click()
document.getElementById('data-model-count').value = '4'
document.getElementById('data-model-seed').value = 'builder-seed'
document.getElementById('data-model-generate').click()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.match(document.getElementById('data-model-status').textContent, /已生成 4 条/)
assert.equal(document.querySelectorAll('#data-preview tbody tr').length, 4)
assert.equal(document.getElementById('data-export-json').disabled, false)

document.querySelector('[data-generator-view="templates"]').click()
assert.ok(document.getElementById('data-template-select').options.length >= 5)
document.getElementById('data-template-save').click()
assert.ok(document.getElementById('data-template-select').options.length >= 6)

console.log('测试数据生成页面交互验证通过')
