/**
 * 设备影子 HTTP：路径形态
 * GET http://{host}/emq/things/{deviceSn}/shadow/classical
 * deviceSn 放在路径中（需 encodeURIComponent），不再使用 ?deviceSn= 查询参数。
 * 浏览器优先直连；失败时回退同源代理（解决 CORS）。
 */

const PROXY_PREFIX = '/api/emq-shadow'

/** 与当前网关一致的基址 */
export const SHADOW_THINGS_BASE = 'http://10.10.20.183:32045'

/** 文档/日志用：占位说明 */
export const SHADOW_CLASSICAL_ORIGIN = `${SHADOW_THINGS_BASE}/emq/things/{deviceSn}/shadow/classical`

/**
 * @param {string} deviceSn
 * @returns {string} 直连完整 URL
 */
export function getShadowClassicalUrl(deviceSn) {
  const sn = String(deviceSn || '').trim()
  if (!sn) return ''
  return `${SHADOW_THINGS_BASE}/emq/things/${encodeURIComponent(sn)}/shadow/classical`
}

function getShadowProxyUrl(deviceSn) {
  const sn = String(deviceSn || '').trim()
  if (!sn) return ''
  const path = `${PROXY_PREFIX}/emq/things/${encodeURIComponent(sn)}/shadow/classical`
  return new URL(path, window.location.href).href
}

function parseJsonMaybe(s) {
  if (typeof s !== 'string') return null
  const t = s.trim()
  if (!t || (t[0] !== '{' && t[0] !== '[')) return null
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

function reportedFromObject(o) {
  if (!o || typeof o !== 'object') return null
  const r = o.state?.reported
  if (r && typeof r === 'object' && !Array.isArray(r)) return r
  if (o.reported && typeof o.reported === 'object' && !Array.isArray(o.reported)) return o.reported
  return null
}

/**
 * 从接口 JSON 取出 reported（兼容 { code, msg } 且 msg 为 JSON 字符串、data 为字符串等网关包装）
 */
export function extractReported(data) {
  if (!data || typeof data !== 'object') return null

  function walk(o, depth) {
    if (depth > 12 || o == null) return null

    if (Array.isArray(o)) {
      for (const item of o) {
        const r = walk(item, depth + 1)
        if (r) return r
      }
      return null
    }

    const direct = reportedFromObject(o)
    if (direct) return direct

    if (typeof o !== 'object') return null

    const diveString = (s) => {
      const inner = parseJsonMaybe(s)
      return inner ? walk(inner, depth + 1) : null
    }

    if (typeof o.msg === 'string') {
      const r = diveString(o.msg)
      if (r) return r
    }

    const keys = ['data', 'result', 'body', 'payload', 'content', 'shadow', 'detail', 'info']
    for (const k of keys) {
      const v = o[k]
      if (v == null) continue
      if (typeof v === 'string') {
        const r = diveString(v)
        if (r) return r
      } else if (typeof v === 'object') {
        const r = walk(v, depth + 1)
        if (r) return r
      }
    }

    return null
  }

  return walk(data, 0)
}

/**
 * 接口业务层提示（仅 code + 文本 msg、且 msg 不是影子 JSON 时用于展示）
 */
export function getShadowApiEnvelopeHint(data) {
  if (!data || typeof data !== 'object') return ''
  const code = data.code
  const msg = data.msg
  if (code === undefined && msg === undefined) return ''
  const msgStr = typeof msg === 'string' ? msg : msg != null ? JSON.stringify(msg) : ''
  if (typeof code === 'number' || typeof code === 'string') {
    return `接口返回 code=${code}${msgStr ? `，msg=${msgStr.slice(0, 500)}` : ''}`
  }
  return msgStr ? `msg=${msgStr.slice(0, 500)}` : ''
}

/**
 * @param {string} _region 保留参数，与旧调用兼容（当前接口不使用）
 * @param {string} deviceSn
 */
export async function fetchDeviceShadow(_region, deviceSn) {
  const sn = String(deviceSn || '').trim()
  if (!sn) {
    throw new Error('deviceSn 不能为空')
  }

  const directUrl = getShadowClassicalUrl(sn)
  const proxyUrl = getShadowProxyUrl(sn)
  const urls = [directUrl, proxyUrl].filter(Boolean)

  let lastErr = null
  for (const fullUrl of urls) {
    try {
      const res = await fetch(fullUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      })
      const text = await res.text()
      let data
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        throw new Error(`响应非 JSON（HTTP ${res.status}）`)
      }
      if (!res.ok) {
        const msg =
          (data && (data.message || data.msg || data.error)) || text.slice(0, 300)
        throw new Error(`HTTP ${res.status}: ${msg}`)
      }
      return data
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`影子请求失败：${lastErr?.message || lastErr || '未知错误'}`)
}

export function getReported(data) {
  return extractReported(data)
}
