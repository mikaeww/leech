// The console's one-line values, against what the DevTools protocol sends for each kind.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preview } from '../ui/dev/tools/values.js'

test('plain values', () => {
  assert.equal(preview({ type: 'string', value: 'hi' }), 'hi')
  assert.equal(preview({ type: 'number', value: 3 }), '3')
  assert.equal(preview({ type: 'number', unserializableValue: 'NaN' }), 'NaN')
  assert.equal(preview({ type: 'undefined' }), 'undefined')
  assert.equal(preview({ type: 'object', subtype: 'null', value: null }), 'null')
  assert.equal(preview({ type: 'boolean', value: false }), 'false')
  assert.equal(preview(undefined), 'undefined')
})

test('objects, arrays and functions', () => {
  const obj = { type: 'object', className: 'Object', description: 'Object', preview: { type: 'object', overflow: false, properties: [{ name: 'a', type: 'number', value: '1' }, { name: 's', type: 'string', value: 'x' }, { name: 'o', type: 'object', value: 'Object' }] } }
  assert.equal(preview(obj), '{a: 1, s: "x", o: Object}')
  const arr = { type: 'object', subtype: 'array', className: 'Array', description: 'Array(3)', preview: { type: 'object', subtype: 'array', overflow: true, properties: [{ name: '0', type: 'number', value: '1' }] } }
  assert.equal(preview(arr), 'Array(3) [1, …]')
  assert.equal(preview({ type: 'function', description: 'function f(a) {\n  return a\n}' }), 'function f(a) {')
  assert.equal(preview({ type: 'object', subtype: 'node', description: 'div#main', preview: { subtype: 'node', properties: [] } }), 'div#main')
  assert.equal(preview({ type: 'object', className: 'Map', description: 'Map(0)', preview: { type: 'object', subtype: 'map', properties: [] } }), 'Map {}')
})
