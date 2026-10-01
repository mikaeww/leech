// Hidden elements: rules per site, undo, restore, the sheets, and a damaged file read without throwing.
import assert from 'node:assert/strict'
import test from 'node:test'
import { Hidden } from '../ui/places/hidden.js'

const ad = { selector: '.ad', label: 'Ad', note: '300×250 · top right' }
const nav = { selector: 'nav', label: 'Navigation', note: '' }

test('a rule per selector, saved on each change, gone with its last rule', () => {
  const saved = []
  const hidden = new Hidden({}, map => saved.push(JSON.stringify(map)))
  hidden.hide('example.com', ad, 1)
  hidden.hide('example.com', ad, 2)
  hidden.hide('example.com', nav, 3)
  assert.deepEqual(hidden.on('example.com').map(e => [e.selector, e.date]), [['.ad', 1], ['nav', 3]])
  hidden.undo('example.com')
  assert.deepEqual(hidden.on('example.com').map(e => e.selector), ['.ad'])
  hidden.restore('example.com', '.ad')
  assert.deepEqual(hidden.map, {})
  assert.equal(saved.length, 5)
})

test('the sheet hides each rule and can leave one out', () => {
  const hidden = new Hidden({ 'example.com': [ad, nav] })
  assert.equal(hidden.sheet('example.com'), '.ad { display: none !important; }\nnav { display: none !important; }')
  assert.equal(hidden.sheet('example.com', '.ad'), 'nav { display: none !important; }')
  assert.equal(hidden.sheet('other.org'), '')
  assert.deepEqual(Object.keys(hidden.sheets()), ['example.com'])
  hidden.restoreAll('example.com')
  assert.deepEqual(hidden.sheets(), {})
})

test('a damaged file loses only what is damaged', () => {
  const hidden = new Hidden({ 'good.com': [ad], 'bad.com': 'nope', 'worse.com': [{ label: 'no selector' }] })
  assert.deepEqual(Object.keys(hidden.map), ['good.com'])
  assert.deepEqual(new Hidden([1, 2]).map, {})
  assert.deepEqual(new Hidden(null).map, {})
})
