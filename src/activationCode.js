const ROUNDS = 12
const ROUND_KEYS = 2 * (ROUNDS + 1)
const CK_NAME = 0x7a21c951691cd470n
const CK_KEY = -5408575981733630035n

function rotateLeft(value, distance) {
  const shift = distance & 31
  return ((value << shift) | (value >>> (32 - shift))) | 0
}

function rotateRight(value, distance) {
  const shift = distance & 31
  return ((value >>> shift) | (value << (32 - shift))) | 0
}

function lowInt32(value) {
  return Number(BigInt.asIntN(32, value))
}

function highInt32(value) {
  return Number(BigInt.asIntN(32, value >> 32n))
}

function packInt64(low, high) {
  const packed = (BigInt(low >>> 0) | (BigInt(high) << 32n))
  return BigInt.asIntN(64, packed)
}

function createCipher(key) {
  const roundKeys = new Int32Array(ROUND_KEYS)
  const keyWords = new Int32Array([lowInt32(key), highInt32(key)])

  roundKeys[0] = -1209970333
  for (let index = 1; index < ROUND_KEYS; index += 1) {
    roundKeys[index] = (roundKeys[index - 1] - 1640531527) | 0
  }

  let a = 0
  let b = 0
  let roundKeyIndex = 0
  let keyWordIndex = 0

  for (let index = 0; index < 3 * ROUND_KEYS; index += 1) {
    const sum = (a + b) | 0
    roundKeys[roundKeyIndex] = rotateLeft((roundKeys[roundKeyIndex] + sum) | 0, 3)
    a = roundKeys[roundKeyIndex]
    keyWords[keyWordIndex] = rotateLeft((keyWords[keyWordIndex] + ((a + b) | 0)) | 0, (a + b) | 0)
    b = keyWords[keyWordIndex]
    roundKeyIndex = (roundKeyIndex + 1) % ROUND_KEYS
    keyWordIndex = (keyWordIndex + 1) % keyWords.length
  }

  return {
    encrypt(input) {
      let aValue = (lowInt32(input) + roundKeys[0]) | 0
      let bValue = (highInt32(input) + roundKeys[1]) | 0

      for (let round = 1; round <= ROUNDS; round += 1) {
        aValue = (rotateLeft(aValue ^ bValue, bValue) + roundKeys[2 * round]) | 0
        bValue = (rotateLeft(bValue ^ aValue, aValue) + roundKeys[2 * round + 1]) | 0
      }

      return packInt64(aValue, bValue)
    },

    decrypt(input) {
      let aValue = lowInt32(input)
      let bValue = highInt32(input)

      for (let round = ROUNDS; round > 0; round -= 1) {
        bValue = rotateRight((bValue - roundKeys[2 * round + 1]) | 0, aValue) ^ aValue
        aValue = rotateRight((aValue - roundKeys[2 * round]) | 0, bValue) ^ bValue
      }

      bValue = (bValue - roundKeys[1]) | 0
      aValue = (aValue - roundKeys[0]) | 0
      return packInt64(aValue, bValue)
    }
  }
}

function bytesToInt64(bytes, offset) {
  let value = 0n
  for (let index = 0; index < 8; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index])
  }
  return BigInt.asIntN(64, value)
}

function writeInt64(bytes, offset, value) {
  let unsigned = BigInt.asUintN(64, value)
  for (let index = 7; index >= 0; index -= 1) {
    bytes[offset + index] = Number(unsigned & 0xffn)
    unsigned >>= 8n
  }
}

function secureRandomInt31() {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) {
    throw new Error('当前浏览器不支持安全随机数生成')
  }
  const values = new Uint32Array(1)
  cryptoApi.getRandomValues(values)
  return values[0] & 0x7fffffff
}

function calculateActivationCode(keyword, suffix) {
  const name = new TextEncoder().encode(keyword)
  if (name.length > 0xffffffff) {
    throw new Error('关键字过长')
  }

  const contentLength = name.length + 4
  const paddedLength = Math.ceil(contentLength / 8) * 8
  const input = new Uint8Array(paddedLength)
  new DataView(input.buffer).setUint32(0, name.length, false)
  input.set(name, 4)

  const nameCipher = createCipher(CK_NAME)
  const encrypted = new Uint8Array(paddedLength)
  for (let offset = 0; offset < paddedLength; offset += 8) {
    writeInt64(encrypted, offset, nameCipher.encrypt(bytesToInt64(input, offset)))
  }

  let checksum = 0
  for (const byte of encrypted) {
    const signedByte = byte > 0x7f ? byte - 0x100 : byte
    checksum = rotateLeft(checksum ^ signedByte, 3)
  }

  const prefix = checksum ^ 0x54882f8a
  const normalizedSuffix = suffix & 0x7fffffff
  let packed = BigInt(prefix) << 32n
  const suffixGroup = normalizedSuffix >>> 16
  if (suffixGroup === 0x0401 || suffixGroup === 0x0402 || suffixGroup === 0x0403) {
    packed |= BigInt(normalizedSuffix)
  } else {
    packed |= BigInt(0x01000000 | (normalizedSuffix & 0x00ffffff))
  }
  packed = BigInt.asIntN(64, packed)

  const result = createCipher(CK_KEY).decrypt(packed)
  let xorByte = 0n
  const unsignedPacked = BigInt.asUintN(64, packed)
  for (let shift = 56n; shift >= 0n; shift -= 8n) {
    xorByte ^= (unsignedPacked >> shift) & 0xffn
  }

  return `${xorByte.toString(16).padStart(2, '0')}${BigInt.asUintN(64, result).toString(16).padStart(16, '0')}`
}

export function generateActivationCode(keyword) {
  if (typeof keyword !== 'string' || keyword.trim() === '') {
    throw new Error('请输入关键字')
  }
  if (typeof TextEncoder === 'undefined' || typeof BigInt === 'undefined') {
    throw new Error('当前浏览器不支持激活码生成')
  }
  return calculateActivationCode(keyword, secureRandomInt31())
}
