/**
 * 验证 JSON 键名 + 字符串值替换与命中统计（含 JSON.parse 字符串用例）
 * 运行：npm run test:json-replace
 */
import { replaceStringValuesInJsonWithStats } from '../src/jsonTree.js'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const sample = { a: 'hello world', b: { c: 'hello' }, d: ['hello'] }
const { value, count } = replaceStringValuesInJsonWithStats(sample, 'hello', 'hi')
assert(count === 3, `应替换 3 处 hello，实际 count=${count}`)
assert(
  JSON.stringify(value) === JSON.stringify({ a: 'hi world', b: { c: 'hi' }, d: ['hi'] }),
  '替换后结构或内容不符'
)

const { count: c0 } = replaceStringValuesInJsonWithStats({ k: 'x' }, 'y', 'z')
assert(c0 === 0, '无命中时应为 0')

const { value: vNum, count: cNum } = replaceStringValuesInJsonWithStats({ n: 55 }, '1', '9')
assert(cNum === 0 && vNum.n === 55, '数字 55 不含子串 1，不应替换')

const { value: vNum2, count: cNum2 } = replaceStringValuesInJsonWithStats({ n: 102 }, '02', '99')
assert(cNum2 === 1 && vNum2.n === 199, '数字文本子串替换后应重解析为合法数字')

const { value: vBool, count: cBool } = replaceStringValuesInJsonWithStats({ ok: true }, 'true', 'false')
assert(cBool === 1 && vBool.ok === false, '布尔 true 应可替换为 false')

const multi = { t: 'aa' }
const { value: vMulti, count: cMulti } = replaceStringValuesInJsonWithStats(multi, 'a', 'b')
assert(cMulti === 2 && vMulti.t === 'bb', '同一字符串内多处应全部计数并替换')

/* 键名：嵌套 JSON 字符串 */
const keyJson = '{"oldName":1,"nest":{"oldName":2,"keep":3}}'
const keyObj = JSON.parse(keyJson)
const { value: vk, count: ck } = replaceStringValuesInJsonWithStats(keyObj, 'oldName', 'newName')
assert(ck === 2, `两处键名 oldName，count 应为 2，实际 ${ck}`)
assert(
  JSON.stringify(vk) === JSON.stringify({ newName: 1, nest: { newName: 2, keep: 3 } }),
  '嵌套键名替换后结构不符'
)

/* 键名子串 */
const prefixJson = '{"prefix_a":10,"prefix_b":20}'
const { value: vp, count: cp } = replaceStringValuesInJsonWithStats(JSON.parse(prefixJson), 'prefix_', '')
assert(cp === 2, `键名子串两处，count=${cp}`)
assert(JSON.stringify(vp) === JSON.stringify({ a: 10, b: 20 }), '键名去前缀后不符')

/* 同一子串同时出现在键名与字符串值 */
const bothJson = '{"foo":"pre-foo"}'
const { value: vb, count: cb } = replaceStringValuesInJsonWithStats(JSON.parse(bothJson), 'foo', 'bar')
assert(cb === 2, `键+值各 1 处，count=${cb}`)
assert(vb.bar === 'pre-bar', `字符串值应为 pre-bar，实际 ${JSON.stringify(vb.bar)}`)

/* JSON 字符串 round-trip */
const rtIn = '{"user_id":1,"meta":{"user_id":2}}'
const { value: vRt, count: cRt } = replaceStringValuesInJsonWithStats(JSON.parse(rtIn), 'user_id', 'userId')
assert(cRt === 2, `user_id 键两处，count=${cRt}`)
assert(JSON.stringify(vRt) === JSON.stringify({ userId: 1, meta: { userId: 2 } }), 'snake 键转 camel round-trip 不符')

/* JSON 文本中的 \\n 解析为真实换行后，替换应对内存字符串生效 */
const parsed = JSON.parse('{"msg":"hello\\nworld"}')
assert(parsed.msg === 'hello\nworld', 'JSON.parse 后应为真实换行')
const { value: vNl, count: cNl } = replaceStringValuesInJsonWithStats(parsed, '\n', ' ')
assert(cNl === 1 && vNl.msg === 'hello world', '真实换行应用空格替换')

console.log('verify-json-replace: 全部通过')
