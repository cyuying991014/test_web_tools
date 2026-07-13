const TIME_KEY_HINT = /(?:^|_)(?:time|timestamp|start|end|ts)(?:$|_)/i

function decodePart(value, plusAsSpace = false) {
  try {
    const normalized = plusAsSpace ? value.replace(/\+/g, ' ') : value
    return decodeURIComponent(normalized)
  } catch {
    return value
  }
}

function maybeFormatTimestamp(key, value) {
  const raw = String(value).trim()
  if (!TIME_KEY_HINT.test(key) && !/^\d{10,13}$/.test(raw)) return ''
  if (!/^\d{10,13}$/.test(raw)) return ''
  const ms = raw.length === 13 ? Number(raw) : Number(raw) * 1000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

export function parseUrlDetails(rawInput) {
  const raw = rawInput.trim()
  if (!raw) {
    throw new Error('请输入 URL')
  }

  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('URL 格式不正确，请确认包含 http:// 或 https://')
  }

  const queryEntries = []
  const rawQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search
  if (rawQuery) {
    rawQuery.split('&').forEach((part) => {
      if (!part) return
      const equalIndex = part.indexOf('=')
      const rawKey = equalIndex >= 0 ? part.slice(0, equalIndex) : part
      const rawValue = equalIndex >= 0 ? part.slice(equalIndex + 1) : ''
      const key = decodePart(rawKey, true)
      const value = decodePart(rawValue, true)
      queryEntries.push({
        key,
        value,
        rawKey,
        rawValue,
        timeText: maybeFormatTimestamp(key, value)
      })
    })
  }

  return {
    href: url.href,
    decodedHref: decodePart(url.href),
    protocol: url.protocol.replace(/:$/, ''),
    origin: url.origin,
    host: url.host,
    hostname: url.hostname,
    port: url.port || '默认',
    pathname: url.pathname,
    pathSegments: url.pathname.split('/').filter(Boolean).map((segment) => decodePart(segment)),
    hash: url.hash ? decodePart(url.hash.slice(1)) : '',
    queryEntries
  }
}
