/** JSON 结构化对比：严格 / 非严格（对象忽略键序，数组 multiset） */

function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function sortDeep(x) {
  if (x === null || typeof x !== 'object') return x
  if (Array.isArray(x)) return x.map(sortDeep)
  const o = {}
  for (const k of Object.keys(x).sort()) {
    o[k] = sortDeep(x[k])
  }
  return o
}

function stableKey(el) {
  return JSON.stringify(sortDeep(el))
}

function arrayMultisetEqual(a, b) {
  const ma = new Map()
  const mb = new Map()
  for (const el of a) {
    const s = stableKey(el)
    ma.set(s, (ma.get(s) || 0) + 1)
  }
  for (const el of b) {
    const s = stableKey(el)
    mb.set(s, (mb.get(s) || 0) + 1)
  }
  if (ma.size !== mb.size) return false
  for (const [k, v] of ma) {
    if (mb.get(k) !== v) return false
  }
  return true
}

function multisetSummary(a, b) {
  const ma = new Map()
  const mb = new Map()
  for (const el of a) {
    const s = stableKey(el)
    ma.set(s, (ma.get(s) || 0) + 1)
  }
  for (const el of b) {
    const s = stableKey(el)
    mb.set(s, (mb.get(s) || 0) + 1)
  }
  const parts = []
  const keys = new Set([...ma.keys(), ...mb.keys()])
  for (const k of keys) {
    const ca = ma.get(k) || 0
    const cb = mb.get(k) || 0
    if (ca !== cb) {
      parts.push(`元素出现次数不同: ${k} → 左 ${ca} / 右 ${cb}`)
    }
  }
  return parts.length ? parts.join('；') : '数组 multiset 不一致'
}

function walk(a, b, path, strict, out) {
  const ta = typeOf(a)
  const tb = typeOf(b)
  if (ta !== tb) {
    out.push({
      path,
      text: `类型不同：左侧 ${ta}，右侧 ${tb}`
    })
    return
  }
  if (ta !== 'array' && ta !== 'object') {
    if (a !== b) {
      out.push({
        path,
        text: `值不同：左侧 ${JSON.stringify(a)}，右侧 ${JSON.stringify(b)}`
      })
    }
    return
  }
  if (ta === 'array') {
    if (strict) {
      if (a.length !== b.length) {
        out.push({
          path,
          text: `数组长度不同：左 ${a.length}，右 ${b.length}`
        })
      }
      const n = Math.min(a.length, b.length)
      for (let i = 0; i < n; i++) {
        walk(a[i], b[i], `${path}[${i}]`, strict, out)
      }
    } else if (!arrayMultisetEqual(a, b)) {
      out.push({
        path,
        text: `数组 multiset 不一致：${multisetSummary(a, b)}`
      })
    }
    return
  }
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (strict) {
    if (keysA.length !== keysB.length) {
      out.push({
        path,
        text: `对象键数量不同：左 ${keysA.length}，右 ${keysB.length}`
      })
    }
    const max = Math.max(keysA.length, keysB.length)
    for (let i = 0; i < max; i++) {
      if (i >= keysA.length || i >= keysB.length) {
        out.push({ path, text: `第 ${i} 位键：一侧缺少键项` })
        break
      }
      if (keysA[i] !== keysB[i]) {
        out.push({
          path,
          text: `键顺序不一致（第 ${i} 位）：左 "${keysA[i]}"，右 "${keysB[i]}"`
        })
        break
      }
    }
    const n = Math.min(keysA.length, keysB.length)
    for (let i = 0; i < n; i++) {
      if (keysA[i] === keysB[i]) {
        walk(a[keysA[i]], b[keysB[i]], `${path}.${keysA[i]}`, strict, out)
      }
    }
  } else {
    const setB = new Set(keysB)
    const setA = new Set(keysA)
    for (const k of keysA) {
      if (!setB.has(k)) {
        out.push({ path: `${path}.${k}`, text: '右侧缺少该键' })
      }
    }
    for (const k of keysB) {
      if (!setA.has(k)) {
        out.push({ path: `${path}.${k}`, text: '左侧缺少该键' })
      }
    }
    for (const k of keysA) {
      if (setB.has(k)) {
        walk(a[k], b[k], `${path}.${k}`, strict, out)
      }
    }
  }
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {{ strict: boolean }} options
 * @returns {{ equal: boolean, diffs: { path: string, text: string }[] }}
 */
export function compareJson(left, right, options) {
  const diffs = []
  walk(left, right, '$', options.strict, diffs)
  return { equal: diffs.length === 0, diffs }
}
