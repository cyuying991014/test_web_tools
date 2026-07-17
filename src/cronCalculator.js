import { CronosExpression } from 'cronosjs'
import cronstrue from 'cronstrue'
import 'cronstrue/locales/zh_CN.js'

const MONTH_ALIASES = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
}

const TYPE_CONFIG = {
  linux: {
    label: 'Linux',
    counts: [5],
    fields: ['分钟', '小时', '月日', '月份', '星期'],
    placeholder: '例如：*/5 * * * *'
  },
  cron4j: {
    label: 'Cron4j',
    counts: [5],
    fields: ['分钟', '小时', '月日', '月份', '星期'],
    placeholder: '例如：0 9 * * MON-FRI'
  },
  quartz: {
    label: 'Quartz',
    counts: [6, 7],
    fields: ['秒', '分钟', '小时', '月日', '月份', '星期', '年份'],
    placeholder: '例如：0 30 10 ? * MON-FRI'
  },
  spring: {
    label: 'Spring',
    counts: [6],
    fields: ['秒', '分钟', '小时', '月日', '月份', '星期'],
    placeholder: '例如：0 */10 * * * *'
  }
}

const EXTENDED_SPECIALS = {
  linux: { dayOfMonth: '', dayOfWeek: '' },
  cron4j: { dayOfMonth: 'L', dayOfWeek: '' },
  quartz: { dayOfMonth: '?LW', dayOfWeek: '?L#' },
  spring: { dayOfMonth: '?LW', dayOfWeek: '?L#' }
}

function cronError(message) {
  return new Error(message)
}

function normalizeInput(expression) {
  return String(expression ?? '').trim().replace(/\s+/g, ' ')
}

function getTypeConfig(type) {
  const normalizedType = String(type ?? '').toLowerCase()
  const config = TYPE_CONFIG[normalizedType]
  if (!config) throw cronError('请选择有效的 Cron 类型')
  return { type: normalizedType, config }
}

function stripFieldAliases(field, fieldIndex, fieldCount) {
  const monthIndex = fieldCount === 5 ? 3 : 4
  const dayOfWeekIndex = fieldCount === 5 ? 4 : 5
  let value = field.toUpperCase()

  if (fieldIndex === monthIndex) {
    value = value.replace(/JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC/g, '')
  }
  if (fieldIndex === dayOfWeekIndex) {
    value = value.replace(/SUN|MON|TUE|WED|THU|FRI|SAT/g, '')
  }
  return value
}

function validateExtendedSpecials(type, fields, config) {
  const dayOfMonthIndex = fields.length === 5 ? 2 : 3
  const dayOfWeekIndex = fields.length === 5 ? 4 : 5
  const allowed = EXTENDED_SPECIALS[type]

  fields.forEach((field, index) => {
    if (!/^[0-9A-Za-z*?,/#-]+$/.test(field)) {
      throw cronError(`${config.fields[index]}字段包含不支持的字符`)
    }

    const stripped = stripFieldAliases(field, index, fields.length)
    const extended = [...stripped.matchAll(/[?LW#]/gi)].map((match) => match[0].toUpperCase())
    const allowedChars = index === dayOfMonthIndex
      ? allowed.dayOfMonth
      : index === dayOfWeekIndex
        ? allowed.dayOfWeek
        : ''

    const invalid = extended.find((char) => !allowedChars.includes(char))
    if (invalid) {
      throw cronError(`${config.fields[index]}字段不支持特殊字符 ${invalid}`)
    }
  })
}

function parseAtomicValue(raw, aliases, min, max, fieldLabel) {
  const upper = String(raw).toUpperCase()
  const value = aliases?.[upper] ?? Number(upper)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw cronError(`${fieldLabel}字段取值应为 ${min}–${max}`)
  }
  return value
}

function expandSimpleField(field, {
  min,
  max,
  aliases = null,
  cyclic = false,
  fieldLabel
}) {
  const values = new Set()
  const parts = field.toUpperCase().split(',')

  for (const part of parts) {
    if (!part) throw cronError(`${fieldLabel}字段格式不合法`)
    const [base, stepRaw, extra] = part.split('/')
    if (extra !== undefined) throw cronError(`${fieldLabel}字段格式不合法`)
    const step = stepRaw === undefined ? 1 : Number(stepRaw)
    if (!Number.isInteger(step) || step <= 0) throw cronError(`${fieldLabel}字段步长必须为正整数`)

    let start
    let end
    if (base === '*') {
      start = min
      end = max
    } else if (base.includes('-')) {
      const range = base.split('-')
      if (range.length !== 2) throw cronError(`${fieldLabel}字段范围格式不合法`)
      start = parseAtomicValue(range[0], aliases, min, max, fieldLabel)
      end = parseAtomicValue(range[1], aliases, min, max, fieldLabel)
    } else {
      start = parseAtomicValue(base, aliases, min, max, fieldLabel)
      end = stepRaw === undefined ? start : max
    }

    if (start <= end) {
      for (let value = start; value <= end; value += step) values.add(value)
    } else if (cyclic) {
      const ordered = []
      for (let value = start; value <= max; value += 1) ordered.push(value)
      for (let value = min; value <= end; value += 1) ordered.push(value)
      ordered.forEach((value, index) => {
        if (index % step === 0) values.add(value)
      })
    } else {
      throw cronError(`${fieldLabel}字段范围起始值不能大于结束值`)
    }
  }

  return [...values].sort((a, b) => a - b)
}

function normalizeQuartzDayOfWeek(field) {
  const convertValue = (value) => {
    if (!/^\d+$/.test(value)) return value
    const number = Number(value)
    if (number < 1 || number > 7) throw cronError('星期字段取值应为 1–7')
    return String(number - 1)
  }

  const convertBase = (base) => {
    if (base === '*' || base === '?') return base
    const suffix = base.endsWith('L') ? 'L' : ''
    const withoutSuffix = suffix ? base.slice(0, -1) : base
    if (withoutSuffix.includes('-')) {
      const [start, end, extra] = withoutSuffix.split('-')
      if (extra !== undefined) throw cronError('星期字段范围格式不合法')
      return `${convertValue(start)}-${convertValue(end)}${suffix}`
    }
    return `${convertValue(withoutSuffix)}${suffix}`
  }

  return field.toUpperCase().split(',').map((item) => {
    const [beforeNth, nth, nthExtra] = item.split('#')
    if (nthExtra !== undefined) throw cronError('星期字段 # 格式不合法')
    const [base, step, stepExtra] = beforeNth.split('/')
    if (stepExtra !== undefined) throw cronError('星期字段步长格式不合法')
    const converted = convertBase(base)
    const withStep = step === undefined ? converted : `${converted}/${step}`
    return nth === undefined ? withStep : `${withStep}#${nth}`
  }).join(',')
}

function normalizeQuartzYear(field) {
  const values = expandSimpleField(field, {
    min: 1970,
    max: 2099,
    fieldLabel: '年份'
  })
  return values.join(',')
}

function buildInternalFields(type, fields) {
  const internal = [...fields]
  if (type === 'quartz') {
    internal[5] = normalizeQuartzDayOfWeek(internal[5])
    if (internal.length === 7) internal[6] = normalizeQuartzYear(internal[6])
  }
  return internal
}

function findInvalidField(internalFields, config) {
  for (let index = 0; index < internalFields.length; index += 1) {
    const probe = Array(internalFields.length).fill('*')
    probe[index] = internalFields[index]
    try {
      CronosExpression.parse(probe.join(' '), { strict: true })
    } catch {
      return config.fields[index]
    }
  }
  return null
}

function containsLastDay(field) {
  return field.toUpperCase().split(',').some((part) => part.includes('L'))
}

function getDayNumbers(field) {
  const normalized = field.toUpperCase().replace(/W/g, '')
  return expandSimpleField(normalized, {
    min: 1,
    max: 31,
    fieldLabel: '月日'
  })
}

function hasPossibleCalendarDate(type, fields, internalFields) {
  const dayOfMonthIndex = fields.length === 5 ? 2 : 3
  const monthIndex = fields.length === 5 ? 3 : 4
  const dayOfWeekIndex = fields.length === 5 ? 4 : 5
  const dayOfMonth = fields[dayOfMonthIndex].toUpperCase()
  const dayOfWeek = fields[dayOfWeekIndex].toUpperCase()

  const mustUseDayOfMonth = type === 'cron4j'
    || (type === 'quartz' && dayOfMonth !== '?')
    || ((type === 'linux' || type === 'spring') && (dayOfWeek === '*' || dayOfWeek === '?'))

  if (!mustUseDayOfMonth || dayOfMonth === '*' || dayOfMonth === '?' || containsLastDay(dayOfMonth)) {
    return true
  }

  const months = expandSimpleField(fields[monthIndex], {
    min: 1,
    max: 12,
    aliases: MONTH_ALIASES,
    cyclic: true,
    fieldLabel: '月份'
  })
  const days = getDayNumbers(dayOfMonth)
  const years = type === 'quartz' && fields.length === 7
    ? internalFields[6].split(',').map(Number)
    : [2024, 2025]

  return years.some((year) => months.some((month) => {
    const maximumDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return days.some((day) => day <= maximumDay)
  }))
}

function createDescription(type, originalExpression, fields, config) {
  try {
    return cronstrue.toString(originalExpression, {
      locale: 'zh_CN',
      use24HourTimeFormat: true,
      dayOfWeekStartIndexZero: type !== 'quartz',
      logicalAndDayFields: type === 'cron4j',
      verbose: true
    })
  } catch {
    return fields.map((field, index) => `${config.fields[index]}：${field}`).join('；')
  }
}

function getCron4jTimes(fields) {
  return {
    minutes: expandSimpleField(fields[0], { min: 0, max: 59, fieldLabel: '分钟' }),
    hours: expandSimpleField(fields[1], { min: 0, max: 23, fieldLabel: '小时' })
  }
}

function getNextCommonDate(leftExpression, rightExpression, afterDate, maxAdvances) {
  let left = leftExpression.nextDate(afterDate)
  let right = rightExpression.nextDate(afterDate)
  let advances = 0

  while (left && right && advances < maxAdvances) {
    const leftTime = left.getTime()
    const rightTime = right.getTime()
    if (leftTime === rightTime) return { date: left, advances }
    if (leftTime < rightTime) left = leftExpression.nextDate(left)
    else right = rightExpression.nextDate(right)
    advances += 1
  }
  return { date: null, advances }
}

function calculateCron4j(fields, startTime, count) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields
  const { minutes, hours } = getCron4jTimes(fields)
  const dayOfMonthExpression = CronosExpression.parse(`0 0 ${dayOfMonth} ${month} *`, { strict: true })
  const dayOfWeekExpression = CronosExpression.parse(`0 0 * ${month} ${dayOfWeek}`, { strict: true })
  const executions = []
  const searchLimit = 20000
  let advances = 0
  let cursor = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate() - 1, 23, 59, 59, 999)

  while (executions.length < count && advances < searchLimit) {
    const next = getNextCommonDate(dayOfMonthExpression, dayOfWeekExpression, cursor, searchLimit - advances)
    advances += next.advances
    if (!next.date) break

    for (const currentHour of hours) {
      for (const currentMinute of minutes) {
        const execution = new Date(
          next.date.getFullYear(),
          next.date.getMonth(),
          next.date.getDate(),
          currentHour,
          currentMinute,
          0,
          0
        )
        const keptLocalTime = execution.getHours() === currentHour && execution.getMinutes() === currentMinute
        if (keptLocalTime && execution > startTime) executions.push(execution)
        if (executions.length === count) return executions
      }
    }

    cursor = next.date
    advances += 1
  }

  return executions
}

function validateAndParse(type, expression) {
  const { config } = getTypeConfig(type)
  const normalizedExpression = normalizeInput(expression)
  if (!normalizedExpression) throw cronError('请输入 Cron 表达式')
  if (normalizedExpression.startsWith('@')) throw cronError('当前工具不支持 @daily、@reboot 等 Cron 宏')

  const fields = normalizedExpression.split(' ')
  if (!config.counts.includes(fields.length)) {
    const expected = config.counts.join(' 或 ')
    throw cronError(`${config.label} 表达式应包含 ${expected} 个字段`)
  }

  validateExtendedSpecials(type, fields, config)

  if (type === 'quartz') {
    const dayOfMonthIsQuestion = fields[3] === '?'
    const dayOfWeekIsQuestion = fields[5] === '?'
    if (dayOfMonthIsQuestion === dayOfWeekIsQuestion) {
      throw cronError('Quartz 的月日和星期字段必须且只能有一个使用 ?')
    }
  }

  const internalFields = buildInternalFields(type, fields)
  const internalExpression = internalFields.join(' ')
  try {
    CronosExpression.parse(internalExpression, { strict: true })
  } catch {
    const invalidField = findInvalidField(internalFields, config)
    throw cronError(invalidField
      ? `${invalidField}字段格式或取值不合法`
      : `${config.label} 表达式格式不合法`)
  }

  if (!hasPossibleCalendarDate(type, fields, internalFields)) {
    throw cronError('月日与月份组合不存在有效日期')
  }

  return { config, fields, internalExpression, normalizedExpression }
}

export function getCronPlaceholder(type) {
  return getTypeConfig(type).config.placeholder
}

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || '浏览器本地时区'
}

export function formatCronExecution(date) {
  const pad = (value) => String(value).padStart(2, '0')
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} 星期${weekday}`
}

export function calculateCronSchedule({
  type,
  expression,
  count,
  startTime = new Date()
}) {
  const normalizedCount = Number(count)
  if (!Number.isInteger(normalizedCount) || normalizedCount < 1 || normalizedCount > 50) {
    throw cronError('查看数量必须是 1–50 的整数')
  }
  if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) {
    throw cronError('计算起始时间不合法')
  }

  const normalizedType = String(type ?? '').toLowerCase()
  const parsed = validateAndParse(normalizedType, expression)
  const executions = normalizedType === 'cron4j'
    ? calculateCron4j(parsed.fields, startTime, normalizedCount)
    : CronosExpression.parse(parsed.internalExpression, { strict: true })
        .nextNDates(startTime, normalizedCount)

  return {
    description: createDescription(
      normalizedType,
      parsed.normalizedExpression,
      parsed.fields,
      parsed.config
    ),
    executions,
    timeZone: getBrowserTimeZone(),
    isPartial: executions.length < normalizedCount
  }
}
