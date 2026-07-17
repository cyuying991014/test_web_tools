const SUPPORTED_FLAGS = new Set(['g', 'i', 'm', 's', 'u', 'y'])

function normalizeFlags(flags) {
  const value = String(flags ?? '')
  const seen = new Set()

  for (const flag of value) {
    if (!SUPPORTED_FLAGS.has(flag)) {
      throw new Error(`不支持的正则 Flag：${flag}`)
    }
    if (seen.has(flag)) {
      throw new Error(`正则 Flag 不能重复：${flag}`)
    }
    seen.add(flag)
  }

  return value
}
function createRegex(pattern, flags) {
  try {
    return new RegExp(pattern, flags)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`正则表达式无效：${detail}`)
  }
}

function advanceStringIndex(text, index, unicode) {
  if (!unicode || index + 1 >= text.length) return index + 1
  const first = text.charCodeAt(index)
  if (first < 0xd800 || first > 0xdbff) return index + 1
  const second = text.charCodeAt(index + 1)
  return second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1
}

function toMatchDetail(match) {
  return {
    index: match.index,
    endIndex: match.index + match[0].length,
    value: match[0],
    isZeroLength: match[0].length === 0,
    groups: match.slice(1).map((value, index) => ({
      index: index + 1,
      value,
      matched: value !== undefined
    })),
    namedGroups: Object.entries(match.groups ?? {}).map(([name, value]) => ({
      name,
      value,
      matched: value !== undefined
    }))
  }
}

export function debugRegex({
  pattern,
  flags = '',
  testText = '',
  replacement = '',
  maxMatches = 500
}) {
  const source = String(pattern ?? '')
  const normalizedFlags = normalizeFlags(flags)
  const text = String(testText ?? '')
  const replacementText = String(replacement ?? '')
  const limit = Number(maxMatches)

  if (source === '') throw new Error('请输入正则表达式')
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('匹配展示上限必须是正整数')
  }

  const matcher = createRegex(source, normalizedFlags)
  const matches = []
  let truncated = false

  if (matcher.global) {
    while (true) {
      const match = matcher.exec(text)
      if (match === null) break
      if (matches.length === limit) {
        truncated = true
        break
      }
      matches.push(toMatchDetail(match))
      if (match[0].length === 0) {
        matcher.lastIndex = advanceStringIndex(text, matcher.lastIndex, matcher.unicode)
      }
    }
  } else {
    const match = matcher.exec(text)
    if (match !== null) matches.push(toMatchDetail(match))
  }

  const replacementRegex = createRegex(source, normalizedFlags)
  return {
    matches,
    matchCount: matches.length,
    truncated,
    replacementResult: text.replace(replacementRegex, replacementText)
  }
}
