const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CHECKS = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

export function getCnIdCheckDigit(first17) {
  if (!/^\d{17}$/.test(first17)) throw new Error('身份证前17位必须为数字')
  const sum = [...first17].reduce((total, digit, index) => total + Number(digit) * ID_WEIGHTS[index], 0)
  return ID_CHECKS[sum % 11]
}

export function isValidCnId(value) {
  if (!/^\d{17}[\dX]$/.test(value)) return false
  const dateText = value.slice(6, 14)
  const year = Number(dateText.slice(0, 4))
  const month = Number(dateText.slice(4, 6))
  const day = Number(dateText.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false
  return value.at(-1) === getCnIdCheckDigit(value.slice(0, 17))
}

export function getLuhnCheckDigit(value) {
  if (!/^\d+$/.test(value)) throw new Error('Luhn 输入必须为数字')
  let sum = 0
  let shouldDouble = true
  for (let i = value.length - 1; i >= 0; i -= 1) {
    let digit = Number(value[i])
    if (shouldDouble) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    shouldDouble = !shouldDouble
  }
  return String((10 - (sum % 10)) % 10)
}

export function isValidLuhn(value) {
  if (!/^\d{2,}$/.test(value)) return false
  return getLuhnCheckDigit(value.slice(0, -1)) === value.at(-1)
}
