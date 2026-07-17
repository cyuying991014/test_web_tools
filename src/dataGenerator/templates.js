import { normalizeModel } from './config.js'

export const TEMPLATE_STORAGE_KEY = 'test-web-tools:data-generator:templates:v1'

export const BUILT_IN_TEMPLATES = [
  { id: 'builtin-user', name: '用户注册数据', builtIn: true, count: 20, fields: [
    { name: 'userId', type: 'uuid', unique: true }, { name: 'name', type: 'nameZh' },
    { name: 'phone', type: 'phone', unique: true }, { name: 'email', type: 'email' },
    { name: 'password', type: 'password' }, { name: 'createdAt', type: 'datetime' }
  ] },
  { id: 'builtin-login', name: '登录账号数据', builtIn: true, count: 20, fields: [
    { name: 'username', type: 'username', unique: true }, { name: 'password', type: 'password' },
    { name: 'token', type: 'token' }, { name: 'enabled', type: 'boolean' }
  ] },
  { id: 'builtin-order', name: '订单基础数据', builtIn: true, count: 20, fields: [
    { name: 'orderNo', type: 'orderNo', unique: true }, { name: 'amount', type: 'decimal', options: { min: 1, max: 9999, decimals: 2 } },
    { name: 'status', type: 'enum', options: { values: ['待支付', '已支付', '已取消'] } }, { name: 'createdAt', type: 'datetime' }
  ] },
  { id: 'builtin-api', name: '接口请求参数', builtIn: true, count: 10, fields: [
    { name: 'requestId', type: 'traceId', unique: true }, { name: 'timestamp', type: 'timestampMs' },
    { name: 'page', type: 'integer', options: { min: 1, max: 20 } }, { name: 'keyword', type: 'textMixed' }
  ] },
  { id: 'builtin-device', name: '设备基础数据', builtIn: true, count: 20, fields: [
    { name: 'sn', type: 'deviceSn', unique: true }, { name: 'imei', type: 'imei', unique: true },
    { name: 'ip', type: 'ipv4Private' }, { name: 'firmware', type: 'version' }, { name: 'online', type: 'boolean' }
  ] }
]

function validateTemplate(template) {
  if (!template || typeof template !== 'object' || !Array.isArray(template.fields) || !template.name) throw new Error('模板格式无效')
  const normalized = normalizeModel(template)
  return { ...structuredClone(template), ...normalized, id: template.id, builtIn: Boolean(template.builtIn) }
}

export function createTemplateStore(storage = localStorage) {
  const read = () => {
    const raw = storage.getItem(TEMPLATE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('本地模板数据损坏')
    return parsed.map(validateTemplate)
  }
  const write = (templates) => storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates))
  return {
    list() { return [...BUILT_IN_TEMPLATES.map((item) => structuredClone(item)), ...read()] },
    save(template) {
      const valid = validateTemplate(template)
      const templates = read()
      const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
      const id = valid.id && !valid.builtIn ? valid.id : `local-${Date.now()}-${suffix}`
      const item = { ...valid, id, builtIn: false }
      const existing = templates.findIndex((entry) => entry.id === id)
      if (existing >= 0) templates[existing] = item
      else templates.push(item)
      write(templates)
      return structuredClone(item)
    },
    remove(id) {
      if (BUILT_IN_TEMPLATES.some((item) => item.id === id)) throw new Error('内置模板不能删除')
      write(read().filter((item) => item.id !== id))
    },
    importJson(text) {
      const parsed = validateTemplate(JSON.parse(text))
      delete parsed.id
      delete parsed.builtIn
      return this.save(parsed)
    },
    exportJson(template) { return JSON.stringify(validateTemplate(template), null, 2) }
  }
}
