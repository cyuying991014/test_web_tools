const item = (type, label, group, defaults = {}) => ({ type, label, group, defaults })

export const DATA_CATALOG = [
  item('nameZh', '中文姓名', '人员与身份'), item('nameEn', '英文姓名', '人员与身份'),
  item('gender', '性别', '人员与身份'), item('age', '年龄', '人员与身份', { min: 18, max: 60 }),
  item('birthDate', '出生日期', '人员与身份'), item('cnId', '中国大陆身份证', '人员与身份'),
  item('phone', '中国大陆手机号', '人员与身份'), item('landline', '座机号', '人员与身份'),
  item('email', 'Email', '人员与身份'), item('address', '省市区地址', '人员与身份'),
  item('postcode', '邮政编码', '人员与身份'),
  item('username', '用户名', '账号与认证'), item('nickname', '昵称', '账号与认证'),
  item('password', '密码', '账号与认证', { length: 12 }),
  item('verificationCode', '验证码', '账号与认证', { length: 6 }),
  item('token', 'Token 风格字符串', '账号与认证', { length: 32 }),
  item('apiKey', 'API Key 风格字符串', '账号与认证', { length: 32, prefix: 'test_' }),
  item('integer', '整数', '数字与基础类型', { min: 0, max: 1000 }),
  item('decimal', '小数', '数字与基础类型', { min: 0, max: 1000, decimals: 2 }),
  item('boolean', '布尔值', '数字与基础类型'), item('null', 'null', '数字与基础类型'),
  item('empty', '空字符串', '数字与基础类型'), item('spaces', '空格字符串', '数字与基础类型', { length: 1 }),
  item('enum', '枚举值', '数字与基础类型', { values: ['待处理', '处理中', '已完成'] }),
  item('sequence', '自增序号', '数字与基础类型', { start: 1, step: 1 }), item('fixed', '固定值', '数字与基础类型', { value: 'fixed' }),
  item('textZh', '中文文本', '文本数据', { minLength: 4, maxLength: 12 }),
  item('textEn', '英文文本', '文本数据', { minLength: 8, maxLength: 20 }),
  item('textMixed', '混合文本', '文本数据', { minLength: 8, maxLength: 20 }),
  item('multiline', '多行文本', '文本数据', { lines: 3 }), item('emoji', 'Emoji', '文本数据', { length: 3 }),
  item('date', '日期', '日期与时间'), item('datetime', '日期时间', '日期与时间'),
  item('timestampSec', 'Unix 秒时间戳', '日期与时间'), item('timestampMs', 'Unix 毫秒时间戳', '日期与时间'),
  item('uuid', 'UUID v4', '标识符与业务编号'), item('numericId', '数字 ID', '标识符与业务编号', { length: 12 }),
  item('orderNo', '订单号', '标识符与业务编号', { prefix: 'ORD' }), item('traceId', 'Trace ID', '标识符与业务编号', { length: 32 }),
  item('deviceSn', '设备 SN', '标识符与业务编号', { prefix: 'SN', length: 16 }), item('imei', 'IMEI', '标识符与业务编号'),
  item('bankCard', '银行卡号格式', '标识符与业务编号', { length: 19 }),
  item('ipv4', 'IPv4', '网络与设备'), item('ipv4Private', '内网 IPv4', '网络与设备'),
  item('ipv6', 'IPv6', '网络与设备'), item('mac', 'MAC 地址', '网络与设备'),
  item('domain', '域名', '网络与设备'), item('hostname', '主机名', '网络与设备'),
  item('url', 'URL', '网络与设备'), item('port', '端口号', '网络与设备'),
  item('userAgent', 'User-Agent', '网络与设备'), item('longitude', '经度', '网络与设备'),
  item('latitude', '纬度', '网络与设备'), item('version', '版本号', '网络与设备')
]

export const CATALOG_BY_TYPE = new Map(DATA_CATALOG.map((entry) => [entry.type, entry]))
export const CATALOG_GROUPS = [...new Set(DATA_CATALOG.map((entry) => entry.group))]

export function getCatalogItem(type) {
  return CATALOG_BY_TYPE.get(type)
}
