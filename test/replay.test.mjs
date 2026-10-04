// Sending a request again: forbidden headers stay out, a body only where the method may carry one; curl quotes safely.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { curlOf, replayScript } from '../ui/dev/tools/replay.js'

const initOf = script => JSON.parse(/^fetch\(".*?", (.*)\)\.then/.exec(script)[1])

test('a replay keeps only headers fetch may set', () => {
  const init = initOf(replayScript({ method: 'POST', url: 'https://a/x', headers: { Cookie: 'a=1', 'Content-Type': 'application/json', Host: 'a', 'sec-ch-ua': 'x', ':authority': 'a', 'X-Token': 't' }, body: '{}' }))
  assert.deepEqual(init, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': 't' }, credentials: 'include', body: '{}' })
  assert.equal(initOf(replayScript({ method: 'GET', url: 'https://a/', body: 'ignored' })).body, undefined)
})

test('curl quotes what the shell would split or run', () => {
  assert.equal(curlOf({ method: 'GET', url: 'https://a/?q=1&b=2', requestHeaders: { ':path': '/', Accept: '*/*' } }), 'curl \'https://a/?q=1&b=2\' -H \'Accept: */*\'')
  assert.equal(curlOf({ method: 'POST', url: 'https://a/', requestHeaders: {} }, 'it\'s $(id)'), 'curl \'https://a/\' -X POST --data-raw \'it\'\\\'\'s $(id)\'')
})
