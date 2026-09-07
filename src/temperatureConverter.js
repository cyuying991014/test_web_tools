const DIRECTIONS = new Set(['c-to-f', 'f-to-c'])

export function convertTemperature(value, direction) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error('请输入温度')
  if (!DIRECTIONS.has(direction)) throw new Error('转换方向无效')

  const number = Number(text)
  if (!Number.isFinite(number)) throw new Error('请输入合法的温度数字')

  return direction === 'c-to-f' ? number * 9 / 5 + 32 : (number - 32) * 5 / 9
}

export function formatTemperature(value) {
  return Number(value.toFixed(6)).toString()
}
