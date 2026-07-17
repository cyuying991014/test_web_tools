import assert from 'node:assert/strict'

process.env.TZ = 'Asia/Shanghai'

const {
  calculateCronSchedule,
  formatCronExecution,
  getCronPlaceholder
} = await import('../src/cronCalculator.js')

function localDate(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second, 0)
}

function assertLocalDate(actual, expected, message) {
  const parts = [
    actual.getFullYear(),
    actual.getMonth() + 1,
    actual.getDate(),
    actual.getHours(),
    actual.getMinutes(),
    actual.getSeconds()
  ]
  assert.deepEqual(parts, expected, message)
}

function calculate(type, expression, count = 5, startTime = localDate(2026, 7, 17, 8)) {
  return calculateCronSchedule({ type, expression, count, startTime })
}

function assertError(type, expression, expectedMessage, count = 5) {
  assert.throws(
    () => calculate(type, expression, count),
    (error) => error instanceof Error && error.message.includes(expectedMessage)
  )
}

const linuxWeekdays = calculate('linux', '0 9 * * 1-5', 3)
assert.equal(linuxWeekdays.executions.length, 3)
assertLocalDate(linuxWeekdays.executions[0], [2026, 7, 17, 9, 0, 0], 'Linux 应从当前时间之后计算')
assertLocalDate(linuxWeekdays.executions[1], [2026, 7, 20, 9, 0, 0], 'Linux 星期范围应正确')
assert.match(linuxWeekdays.description, /09:00/)

const linuxSundayZero = calculate('linux', '0 9 * * 0', 1)
const linuxSundaySeven = calculate('linux', '0 9 * * 7', 1)
assert.equal(linuxSundayZero.executions[0].getTime(), linuxSundaySeven.executions[0].getTime())

const linuxOrDays = calculate('linux', '0 12 16 * MON', 1, localDate(2026, 7, 17))
assertLocalDate(linuxOrDays.executions[0], [2026, 7, 20, 12, 0, 0], 'Linux 月日和星期应使用 OR 语义')

const cron4jAndDays = calculate('cron4j', '0 12 16 * MON', 3, localDate(2026, 7, 1))
assertLocalDate(cron4jAndDays.executions[0], [2026, 11, 16, 12, 0, 0], 'Cron4j 月日和星期应同时满足')
assertLocalDate(cron4jAndDays.executions[1], [2027, 8, 16, 12, 0, 0])
assert.match(cron4jAndDays.description, /16/)
assert.match(cron4jAndDays.description, /星期一/)

const cron4jLastDay = calculate('cron4j', '30 8 L * *', 1, localDate(2026, 7, 17))
assertLocalDate(cron4jLastDay.executions[0], [2026, 7, 31, 8, 30, 0], 'Cron4j 应支持月末 L')

const quartzMonday = calculate('quartz', '0 30 10 ? * 2', 2)
assertLocalDate(quartzMonday.executions[0], [2026, 7, 20, 10, 30, 0], 'Quartz 2 应表示星期一')
assertLocalDate(quartzMonday.executions[1], [2026, 7, 27, 10, 30, 0])

const quartzYear = calculate('quartz', '0 0 0 1 1 ? 2027', 2)
assert.equal(quartzYear.executions.length, 1)
assert.equal(quartzYear.isPartial, true)
assertLocalDate(quartzYear.executions[0], [2027, 1, 1, 0, 0, 0], 'Quartz 年份字段应限制执行年份')

const quartzNoFutureDate = calculate('quartz', '0 0 9 ? 2 2#5 2026', 2, localDate(2026, 1, 1))
assert.deepEqual(quartzNoFutureDate.executions, [])
assert.equal(quartzNoFutureDate.isPartial, true)

const quartzWeekday = calculate('quartz', '0 0 9 1W * ?', 1, localDate(2026, 7, 31, 23, 59))
assertLocalDate(quartzWeekday.executions[0], [2026, 8, 3, 9, 0, 0], 'Quartz 1W 应取当月最近工作日')

const quartzNthMonday = calculate('quartz', '0 0 9 ? * 2#3', 1)
assertLocalDate(quartzNthMonday.executions[0], [2026, 7, 20, 9, 0, 0], 'Quartz 2#3 应表示第三个星期一')

const springWeekdays = calculate('spring', '0 0 9 * * MON-FRI', 2)
assertLocalDate(springWeekdays.executions[0], [2026, 7, 17, 9, 0, 0])
assertLocalDate(springWeekdays.executions[1], [2026, 7, 20, 9, 0, 0])

assert.equal(linuxWeekdays.timeZone, 'Asia/Shanghai')
assert.equal(formatCronExecution(localDate(2026, 7, 17, 9)), '2026-07-17 09:00:00 星期五')
assert.match(getCronPlaceholder('quartz'), /^例如：/)

assertError('linux', '', '请输入 Cron 表达式')
assertError('linux', '0 0 * *', '5 个字段')
assertError('cron4j', '0 0 * * MON#2', '不支持特殊字符 #')
assertError('quartz', '0 0 9 * * MON', '必须且只能有一个使用 ?')
assertError('quartz', '0 0 9 ? * 0', '星期字段取值应为 1–7')
assertError('spring', '0 0 9 32 * *', '月日字段格式或取值不合法')
assertError('cron4j', '0 0 31 2 *', '不存在有效日期')
assertError('linux', '@daily', '不支持 @daily')
assertError('linux', '* * * * *', '1–50', 0)
assertError('linux', '* * * * *', '1–50', 51)

console.log('Cron 表达式计算验证通过')
