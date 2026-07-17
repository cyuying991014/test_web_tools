export const RANDOM_VERSION = 'sfc32-v1'

function hashSeed(seed) {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (const char of String(seed)) {
    const code = char.codePointAt(0)
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
}

export function createRandom(seed) {
  let [a, b, c, d] = hashSeed(seed)
  const next = () => {
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    const t = (a + b + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = ((c << 21) | (c >>> 11))
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
  return {
    version: RANDOM_VERSION,
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) throw new Error('随机整数范围无效')
      return min + Math.floor(next() * (max - min + 1))
    },
    bool(rate = 0.5) {
      return next() < rate
    },
    pick(items) {
      if (!Array.isArray(items) || items.length === 0) throw new Error('随机候选列表不能为空')
      return items[Math.floor(next() * items.length)]
    },
    shuffle(items) {
      const output = [...items]
      for (let i = output.length - 1; i > 0; i -= 1) {
        const j = this.int(0, i)
        ;[output[i], output[j]] = [output[j], output[i]]
      }
      return output
    }
  }
}

export function createAutoSeed() {
  const values = new Uint32Array(4)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('')
}
