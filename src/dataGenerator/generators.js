import { CN_GIVEN_NAMES, CN_REGIONS, CN_SURNAMES, EN_FIRST_NAMES, EN_LAST_NAMES, PHONE_PREFIXES } from './datasets.js'
import { getCnIdCheckDigit, getLuhnCheckDigit } from './validators.js'

const ALPHA = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = ALPHA.toUpperCase()
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*_-+'
const CN_CHARS = '测试数据边界接口用户订单设备成功失败状态时间地址网络随机样本'
const EMOJIS = ['😀', '🧪', '🚀', '✅', '⚠️', '📦', '🔧', '🌟']
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36'
]

function chars(random, alphabet, length) {
  return Array.from({ length }, () => alphabet[random.int(0, alphabet.length - 1)]).join('')
}

function paddedNumber(random, length) {
  return chars(random, DIGITS, length)
}

function dateParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: String(date.getUTCMonth() + 1).padStart(2, '0'),
    day: String(date.getUTCDate()).padStart(2, '0')
  }
}

function formatDate(date, withTime = false) {
  const parts = dateParts(date)
  const base = `${parts.year}-${parts.month}-${parts.day}`
  if (!withTime) return base
  return `${base} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`
}

function randomDate(random, options = {}) {
  const min = Date.parse(options.min || '1970-01-01T00:00:00Z')
  const max = Date.parse(options.max || '2035-12-31T23:59:59Z')
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) throw new Error('日期范围无效')
  return new Date(min + Math.floor(random.next() * (max - min + 1)))
}

function randomBirthDate(random, minAge = 18, maxAge = 60, referenceDate = '2026-01-01') {
  const nowYear = Number(String(referenceDate).slice(0, 4))
  return randomDate(random, { min: `${nowYear - maxAge}-01-01T00:00:00Z`, max: `${nowYear - minAge}-12-31T23:59:59Z` })
}

function chooseRegion(random, options = {}) {
  const candidates = CN_REGIONS.filter((region) => !options.regionCode || region.code === options.regionCode || region.code.startsWith(options.regionCode))
  if (candidates.length === 0) throw new Error('指定行政区划不存在')
  return random.pick(candidates)
}

function validPassword(random, options) {
  const length = Number(options.length ?? 12)
  const pools = []
  if (options.lowercase !== false) pools.push(ALPHA)
  if (options.uppercase !== false) pools.push(UPPER)
  if (options.digits !== false) pools.push(DIGITS)
  if (options.symbols !== false) pools.push(SYMBOLS)
  if (pools.length === 0) throw new Error('密码至少选择一种字符类型')
  if (!Number.isInteger(length) || length < pools.length || length > 256) throw new Error(`密码长度必须是 ${pools.length}～256`)
  const required = pools.map((pool) => random.pick([...pool]))
  return random.shuffle([...required, ...Array.from({ length: length - required.length }, () => random.pick([...pools.join('')]))]).join('')
}

function validIpv4(random, privateOnly = false) {
  if (privateOnly) {
    const block = random.pick(['10', '172', '192'])
    if (block === '10') return `10.${random.int(0, 255)}.${random.int(0, 255)}.${random.int(1, 254)}`
    if (block === '172') return `172.${random.int(16, 31)}.${random.int(0, 255)}.${random.int(1, 254)}`
    return `192.168.${random.int(0, 255)}.${random.int(1, 254)}`
  }
  const first = random.pick([1, 2, 8, 23, 36, 42, 49, 58, 61, 101, 114, 123, 150, 180, 202, 210, 223])
  return `${first}.${random.int(0, 255)}.${random.int(0, 255)}.${random.int(1, 254)}`
}

export function generateValid(type, options, context) {
  const { random, rowIndex } = context
  switch (type) {
    case 'nameZh': return random.pick(CN_SURNAMES) + random.pick(CN_GIVEN_NAMES)
    case 'nameEn': return `${random.pick(EN_FIRST_NAMES)} ${random.pick(EN_LAST_NAMES)}`
    case 'gender': return random.pick(['男', '女'])
    case 'age': return random.int(Number(options.min ?? 18), Number(options.max ?? 60))
    case 'birthDate': return formatDate(randomBirthDate(random, Number(options.minAge ?? 18), Number(options.maxAge ?? 60), context.referenceDate))
    case 'cnId': {
      const region = chooseRegion(random, options)
      const birth = options.birthDate ? new Date(`${options.birthDate}T00:00:00Z`) : randomBirthDate(random, 18, 60, context.referenceDate)
      if (Number.isNaN(birth.getTime())) throw new Error('身份证出生日期无效')
      const p = dateParts(birth)
      let sequence = random.int(1, 999)
      if (options.gender === '男' && sequence % 2 === 0) sequence += sequence === 998 ? -1 : 1
      if (options.gender === '女' && sequence % 2 === 1) sequence += sequence === 999 ? -1 : 1
      const first17 = `${region.code}${p.year}${p.month}${p.day}${String(sequence).padStart(3, '0')}`
      return first17 + getCnIdCheckDigit(first17)
    }
    case 'phone': return random.pick(PHONE_PREFIXES) + paddedNumber(random, 8)
    case 'landline': return `${random.pick(['010', '020', '021', '023', '028', '029', '0571', '0755'])}-${paddedNumber(random, 8)}`
    case 'email': return `${chars(random, ALPHA + DIGITS, random.int(6, 12))}@${random.pick(['example.com', 'test.local', 'mail.test'])}`
    case 'address': {
      const region = chooseRegion(random, options)
      return `${region.province}${region.city}${region.district}${random.pick(['测试路', '数据街', '边界大道'])}${random.int(1, 999)}号`
    }
    case 'postcode': return chooseRegion(random, options).postcode
    case 'username': return `${random.pick(EN_FIRST_NAMES).toLowerCase()}_${paddedNumber(random, 4)}`
    case 'nickname': return random.pick(['测试小助手', '边界探索者', '数据观察员', '接口巡检员']) + random.int(1, 99)
    case 'password': return validPassword(random, options)
    case 'verificationCode': return chars(random, options.alphanumeric ? UPPER + DIGITS : DIGITS, Number(options.length ?? 6))
    case 'token': return chars(random, ALPHA + UPPER + DIGITS, Number(options.length ?? 32))
    case 'apiKey': return String(options.prefix ?? 'test_') + chars(random, ALPHA + UPPER + DIGITS, Number(options.length ?? 32))
    case 'integer': return random.int(Number(options.min ?? 0), Number(options.max ?? 1000))
    case 'decimal': {
      const decimals = Number(options.decimals ?? 2)
      const factor = 10 ** decimals
      const min = Math.ceil(Number(options.min ?? 0) * factor)
      const max = Math.floor(Number(options.max ?? 1000) * factor)
      return random.int(min, max) / factor
    }
    case 'boolean': return random.bool()
    case 'null': return null
    case 'empty': return ''
    case 'spaces': return ' '.repeat(Number(options.length ?? 1))
    case 'enum': return random.pick(Array.isArray(options.values) ? options.values : String(options.values || '').split(',').map((v) => v.trim()).filter(Boolean))
    case 'sequence': return Number(options.start ?? 1) + rowIndex * Number(options.step ?? 1)
    case 'fixed': return options.value ?? 'fixed'
    case 'textZh': return chars(random, CN_CHARS, random.int(Number(options.minLength ?? 4), Number(options.maxLength ?? 12)))
    case 'textEn': return chars(random, ALPHA + ' ', random.int(Number(options.minLength ?? 8), Number(options.maxLength ?? 20))).trim() || 'test'
    case 'textMixed': return chars(random, CN_CHARS + ALPHA + UPPER + DIGITS + SYMBOLS, random.int(Number(options.minLength ?? 8), Number(options.maxLength ?? 20)))
    case 'multiline': return Array.from({ length: Number(options.lines ?? 3) }, () => chars(random, CN_CHARS, random.int(4, 12))).join('\n')
    case 'emoji': return Array.from({ length: Number(options.length ?? 3) }, () => random.pick(EMOJIS)).join('')
    case 'date': return formatDate(randomDate(random, options))
    case 'datetime': return formatDate(randomDate(random, options), true)
    case 'timestampSec': return Math.floor(randomDate(random, options).getTime() / 1000)
    case 'timestampMs': return randomDate(random, options).getTime()
    case 'uuid': {
      const bytes = Array.from({ length: 16 }, () => random.int(0, 255))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
    case 'numericId': return paddedNumber(random, Number(options.length ?? 12))
    case 'orderNo': {
      const stamp = formatDate(randomDate(random, options), false).replaceAll('-', '')
      return `${options.prefix ?? 'ORD'}${stamp}${String(rowIndex + 1).padStart(6, '0')}${paddedNumber(random, 4)}`
    }
    case 'traceId': return chars(random, DIGITS + 'abcdef', Number(options.length ?? 32))
    case 'deviceSn': return `${options.prefix ?? 'SN'}${chars(random, UPPER + DIGITS, Number(options.length ?? 16))}`
    case 'imei': {
      const base = paddedNumber(random, 14)
      return base + getLuhnCheckDigit(base)
    }
    case 'bankCard': {
      const length = Number(options.length ?? 19)
      const base = '62' + paddedNumber(random, length - 3)
      return base + getLuhnCheckDigit(base)
    }
    case 'ipv4': return validIpv4(random)
    case 'ipv4Private': return validIpv4(random, true)
    case 'ipv6': return Array.from({ length: 8 }, () => random.int(0, 65535).toString(16)).join(':')
    case 'mac': return Array.from({ length: 6 }, () => random.int(0, 255).toString(16).padStart(2, '0')).join(':').toUpperCase()
    case 'domain': return `${chars(random, ALPHA, random.int(5, 10))}.${random.pick(['test', 'example', 'local'])}`
    case 'hostname': return `${random.pick(['api', 'web', 'db', 'device'])}-${paddedNumber(random, 3)}`
    case 'url': return `https://${chars(random, ALPHA, 8)}.example.com/${chars(random, ALPHA, 6)}?id=${paddedNumber(random, 6)}`
    case 'port': return random.int(1, 65535)
    case 'userAgent': return random.pick(USER_AGENTS)
    case 'longitude': return Number((random.next() * 360 - 180).toFixed(Number(options.decimals ?? 6)))
    case 'latitude': return Number((random.next() * 180 - 90).toFixed(Number(options.decimals ?? 6)))
    case 'version': return `${random.int(0, 9)}.${random.int(0, 20)}.${random.int(0, 99)}`
    default: throw new Error(`不支持的数据类型：${type}`)
  }
}

export function generateBoundary(type, options, context) {
  switch (type) {
    case 'integer': case 'decimal': case 'age': return Number(options.min ?? 0)
    case 'port': return context.rowIndex % 2 === 0 ? 1 : 65535
    case 'longitude': return context.rowIndex % 2 === 0 ? -180 : 180
    case 'latitude': return context.rowIndex % 2 === 0 ? -90 : 90
    case 'textZh': case 'textEn': case 'textMixed': return generateValid(type, { ...options, minLength: options.minLength ?? 0, maxLength: options.minLength ?? 0 }, context)
    case 'date': return options.min ? String(options.min).slice(0, 10) : '1970-01-01'
    case 'ipv4': return context.rowIndex % 2 === 0 ? '0.0.0.0' : '255.255.255.255'
    default: return generateValid(type, options, context)
  }
}

export function generateInvalid(type, options, context) {
  const valid = generateValid(type, options, context)
  switch (type) {
    case 'cnId': return String(valid).slice(0, -1) + (String(valid).at(-1) === '0' ? '1' : '0')
    case 'phone': return `12${String(valid).slice(2, -2)}`
    case 'landline': return String(valid).replace('-', 'A')
    case 'email': return String(valid).replace('@', '')
    case 'postcode': return 'ABCDEF'
    case 'imei': case 'bankCard': return String(valid).slice(0, -1) + (String(valid).at(-1) === '0' ? '1' : '0')
    case 'integer': case 'decimal': case 'age': return Number(options.max ?? 1000) + 1
    case 'date': case 'birthDate': return '2026-02-30'
    case 'datetime': return '2026-13-40 25:61:61'
    case 'ipv4': case 'ipv4Private': return '999.999.999.999'
    case 'ipv6': return 'GGGG::1'
    case 'mac': return 'ZZ:ZZ:ZZ:ZZ:ZZ:ZZ'
    case 'domain': return 'invalid domain'
    case 'url': return '://invalid-url'
    case 'port': return 65536
    case 'longitude': return 181
    case 'latitude': return 91
    case 'uuid': return String(valid).replace('-', '')
    default: return typeof valid === 'string' ? `${valid}\u0000` : '类型错误'
  }
}
