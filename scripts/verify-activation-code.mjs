import assert from 'node:assert/strict'

let fixedRandom = 0x12345678
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    getRandomValues(values) {
      values[0] = fixedRandom
      return values
    }
  }
})

const { generateActivationCode } = await import('../src/activationCode.js')

const vectors = [
  ['test', 'cf0e8b5b91c6b26b85'],
  ['charles', '5fc91b7d5f93855fb7'],
  ['测试', '9f7143b4158f31df97']
]

for (const [keyword, expected] of vectors) {
  assert.equal(generateActivationCode(keyword), expected, `${keyword} 的固定向量不匹配`)
}

assert.throws(() => generateActivationCode(''), /请输入关键字/)
assert.throws(() => generateActivationCode('   '), /请输入关键字/)

fixedRandom = 0x04011234
const specialSuffixResult = generateActivationCode('test')
assert.equal(specialSuffixResult, 'f7498c3390f1b42efa', '特殊随机后缀分支不匹配')

fixedRandom = 0x12345679
const nextResult = generateActivationCode('test')
assert.match(nextResult, /^[0-9a-f]{18}$/)
assert.notEqual(nextResult, vectors[0][1], '不同随机后缀应生成不同结果')

console.log('activation code verification passed')
