import assert from 'node:assert/strict'
import { parseUrlDetails } from '../src/urlParser.js'

const sample =
  'https://app-api-fat.dreo.com:8020/api/device-report/1929721128921149442/temperature/statistics?tz=Europe%2FParis&start=1783048594723&end=1783893600000&sn=1929721128921149442-2df59fa61fe85a42%3A001%3A0000000000b&gmt=GMT%2B02%3A00&timestamp=1783910368201'

const parsed = parseUrlDetails(sample)

assert.equal(parsed.protocol, 'https')
assert.equal(parsed.hostname, 'app-api-fat.dreo.com')
assert.equal(parsed.port, '8020')
assert.deepEqual(parsed.pathSegments, [
  'api',
  'device-report',
  '1929721128921149442',
  'temperature',
  'statistics'
])

const params = Object.fromEntries(parsed.queryEntries.map((entry) => [entry.key, entry]))
assert.equal(params.tz.value, 'Europe/Paris')
assert.equal(params.sn.value, '1929721128921149442-2df59fa61fe85a42:001:0000000000b')
assert.equal(params.gmt.value, 'GMT+02:00')
assert.ok(params.start.timeText)
assert.ok(params.end.timeText)
assert.ok(params.timestamp.timeText)

assert.throws(() => parseUrlDetails('not a url'), /URL 格式不正确/)

console.log('URL parser verification passed')
