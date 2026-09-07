import assert from 'node:assert/strict'
import { convertTemperature, formatTemperature } from '../src/temperatureConverter.js'

assert.equal(formatTemperature(convertTemperature('0', 'c-to-f')), '32')
assert.equal(formatTemperature(convertTemperature('100', 'c-to-f')), '212')
assert.equal(formatTemperature(convertTemperature('32', 'f-to-c')), '0')
assert.equal(formatTemperature(convertTemperature('98.6', 'f-to-c')), '37')
assert.equal(formatTemperature(convertTemperature('-40', 'c-to-f')), '-40')
assert.equal(formatTemperature(convertTemperature('-40', 'f-to-c')), '-40')
assert.throws(() => convertTemperature('', 'c-to-f'), /请输入温度/)
assert.throws(() => convertTemperature('abc', 'c-to-f'), /合法的温度数字/)
assert.throws(() => convertTemperature('20', 'invalid'), /转换方向无效/)

console.log('Temperature converter verification passed')
