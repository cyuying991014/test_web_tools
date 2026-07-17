import assert from 'node:assert/strict'
import { debugRegex } from '../src/regexDebugger.js'

function run() {
  const single = debugRegex({ pattern: 'a', testText: 'a a', replacement: 'x' })
  assert.equal(single.matchCount, 1)
  assert.equal(single.matches[0].index, 0)
  assert.equal(single.replacementResult, 'x a')

  const global = debugRegex({ pattern: 'a', flags: 'g', testText: 'a A a', replacement: 'x' })
  assert.deepEqual(global.matches.map((item) => item.index), [0, 4])
  assert.equal(global.replacementResult, 'x A x')

  const caseInsensitive = debugRegex({ pattern: 'a', flags: 'gi', testText: 'a A' })
  assert.equal(caseInsensitive.matchCount, 2)

  const multiline = debugRegex({ pattern: '^b', flags: 'gm', testText: 'a\nb' })
  assert.equal(multiline.matches[0].index, 2)

  const dotAll = debugRegex({ pattern: 'a.b', flags: 's', testText: 'a\nb' })
  assert.equal(dotAll.matches[0].value, 'a\nb')

  const sticky = debugRegex({ pattern: 'a', flags: 'gy', testText: 'aab' })
  assert.equal(sticky.matchCount, 2)

  const captures = debugRegex({
    pattern: '(?<word>[a-z]+)-(\\d+)(?:-(x))?',
    flags: 'g',
    testText: 'item-42',
    replacement: '$<word>:$2:$3'
  })
  assert.deepEqual(captures.matches[0].groups, [
    { index: 1, value: 'item', matched: true },
    { index: 2, value: '42', matched: true },
    { index: 3, value: undefined, matched: false }
  ])
  assert.deepEqual(captures.matches[0].namedGroups, [
    { name: 'word', value: 'item', matched: true }
  ])
  assert.equal(captures.replacementResult, 'item:42:')

  const zeroLength = debugRegex({ pattern: '(?=a)', flags: 'g', testText: 'aa' })
  assert.deepEqual(zeroLength.matches.map((item) => item.index), [0, 1])
  assert.ok(zeroLength.matches.every((item) => item.isZeroLength))

  const unicodeZeroLength = debugRegex({ pattern: '(?=)', flags: 'gu', testText: '😀a' })
  assert.deepEqual(unicodeZeroLength.matches.map((item) => item.index), [0, 2, 3])

  const deletion = debugRegex({ pattern: '\\d+', flags: 'g', testText: 'a1b22', replacement: '' })
  assert.equal(deletion.replacementResult, 'ab')

  const wholeMatch = debugRegex({ pattern: '(\\d+)', testText: 'A12', replacement: '[$&]-$1' })
  assert.equal(wholeMatch.replacementResult, 'A[12]-12')

  const limited = debugRegex({ pattern: 'a', flags: 'g', testText: 'aaaa', maxMatches: 3 })
  assert.equal(limited.matchCount, 3)
  assert.equal(limited.truncated, true)

  const exactLimit = debugRegex({ pattern: 'a', flags: 'g', testText: 'aaa', maxMatches: 3 })
  assert.equal(exactLimit.truncated, false)

  const emptyText = debugRegex({ pattern: 'a', flags: 'g', testText: '' })
  assert.equal(emptyText.matchCount, 0)
  assert.equal(emptyText.replacementResult, '')

  assert.throws(
    () => debugRegex({ pattern: '[', flags: 'g', testText: 'a' }),
    /正则表达式无效/
  )
  assert.throws(
    () => debugRegex({ pattern: 'a', flags: 'gg', testText: 'a' }),
    /不能重复/
  )
  assert.throws(
    () => debugRegex({ pattern: '', flags: 'g', testText: 'a' }),
    /请输入正则表达式/
  )

  console.log('正则表达式调试器专项验证通过')
}

run()
