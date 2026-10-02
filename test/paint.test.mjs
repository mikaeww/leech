// The colour arithmetic behind the paint setting (docs/verification/paint.md, claims 1–3, 6, 7).
import assert from 'node:assert/strict'
import test from 'node:test'
import { along, contrast, hexToHsv, hexToRgb, hsvToHex, inkFor, normalHex, rgbToHex } from '../ui/paint/colour.js'
import { PRESETS } from '../ui/paint/presets.js'
import { smoothPixels } from '../ui/paint/raster.js'

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

// The smooth window raster (claims 6 and 7). The oracle is CSS's own rule, written out here for the four
// axis-aligned angles: evenly spaced stops, mixed in sRGB, sampled at the pixel's centre.
const STOPS = ['#000000', '#2a2a2a', '#bababa']
const exactAt = (stops, t) => {
  const rgb = stops.map(hexToRgb)
  const at = Math.min(Math.max(t, 0), 1) * (rgb.length - 1)
  const i = Math.min(Math.floor(at), rgb.length - 2)
  return rgb[i].map((v, c) => v + (rgb[i + 1][c] - v) * (at - i))
}
const AXES = { 0: (x, y, w, h) => 1 - y / h, 90: (x, y, w) => x / w, 180: (x, y, w, h) => y / h, 270: (x, y, w) => 1 - x / w }

test('every pixel of the smooth raster is the exact colour rounded down or up, at both scales', () => {
  for (const stops of [STOPS, ...PRESETS.filter(([, p]) => p?.window.kind === 'gradient').map(([, p]) => p.window.colours)]) {
    for (const [angle, t] of Object.entries(AXES)) {
      for (const scale of [1, 2]) {
        const { pixels, cols, rows } = smoothPixels({ shape: 'linear', angle: Number(angle) }, stops, { width: 96, height: 72, scale })
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const exact = exactAt(stops, t((x + 0.5) / scale, (y + 0.5) / scale, 96, 72))
            exact.forEach((v, c) => { if (!(Math.abs(pixels[(y * cols + x) * 4 + c] - v) < 1)) assert.fail(`${stops} ${angle}° @${scale}x (${x}, ${y})`) })
          }
        }
      }
    }
  }
})

test('every 8x8 block of the smooth raster averages within 1/8 level of the exact colours', () => {
  const [width, height] = [64, 1080]
  const { pixels, cols } = smoothPixels({ shape: 'linear', angle: 180 }, STOPS, { width, height, scale: 1 })
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      let error = 0
      for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) error += pixels[(y * cols + x) * 4] - exactAt(STOPS, (y + 0.5) / height)[0]
      assert.ok(Math.abs(error / 64) <= 1 / 8, `block (${bx}, ${by}) is off by ${(error / 64).toFixed(3)}`)
    }
  }
})
