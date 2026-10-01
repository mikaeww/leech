// The colour arithmetic behind the paint setting (docs/verification/paint.md, claims 1–3).
import assert from 'node:assert/strict'
import test from 'node:test'
import { along, contrast, hexToHsv, hsvToHex, inkFor, normalHex, rgbToHex } from '../ui/paint/colour.js'

const LEVELS = Array.from({ length: 16 }, (_, i) => i * 17)
const GRID = LEVELS.flatMap(r => LEVELS.flatMap(g => LEVELS.map(b => rgbToHex([r, g, b]))))

test('hex to HSV and back is exact on a 4096-colour grid', () => {
  for (const hex of GRID) assert.equal(hsvToHex(hexToHsv(hex)), hex)
})

test('HSV to hex always gives #rrggbb, also at the edges', () => {
  for (const h of [0, 59.9, 60, 180, 359.99, 360]) for (const s of [0, 0.5, 1]) for (const v of [0, 0.5, 1]) assert.match(hsvToHex([h, s, v]), /^#[0-9a-f]{6}$/)
})

test('contrast is the WCAG ratio and symmetric', () => {
  assert.equal(contrast('#000000', '#ffffff'), 21)
  assert.equal(contrast('#045af2', '#045af2'), 1)
  for (let i = 0; i < GRID.length; i += 97) assert.equal(contrast(GRID[i], '#336699'), contrast('#336699', GRID[i]))
})

test('the ink for greys switches once, from light text to dark', () => {
  const inks = Array.from({ length: 256 }, (_, v) => inkFor([rgbToHex([v, v, v])]))
  const switched = inks.indexOf('light')
  assert.ok(switched > 0 && inks.slice(0, switched).every(i => i === 'dark') && inks.slice(switched).every(i => i === 'light'), `one switch at ${switched}`)
})

test('the ink judges the worst of several colours', () => {
  assert.equal(inkFor(['#ffffff', '#f0f0f0']), 'light')
  assert.equal(inkFor(['#000000', '#1a1a40']), 'dark')
})

test('hex input and gradient stops', () => {
  assert.equal(normalHex('#ABC'), '#aabbcc')
  assert.equal(normalHex('045af2'), '#045af2')
  assert.equal(normalHex('#12345'), null)
  assert.equal(along(['#000000', '#ffffff'], 0.5), '#808080')
  assert.equal(along(['#ff0000', '#00ff00', '#0000ff'], 1), '#0000ff')
  assert.equal(along(['#ff0000', '#00ff00', '#0000ff'], 0.5), '#00ff00')
})
