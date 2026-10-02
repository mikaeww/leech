// The colour arithmetic behind the paint setting (docs/verification/paint.md, claims 1–3, 6–9).
import assert from 'node:assert/strict'
import test from 'node:test'
import { contrast, curveOf, curveStops, hexToHsv, hexToRgb, hsvToHex, inkFor, normalHex, rgbToHex } from '../ui/paint/colour.js'
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

test('hex input', () => {
  assert.equal(normalHex('#ABC'), '#aabbcc')
  assert.equal(normalHex('045af2'), '#045af2')
  assert.equal(normalHex('#12345'), null)
})

// The stops' curve (claim 6). Channels are independent, so greys stand for every channel: all three-stop
// combinations of a 16-level grid. Oracles: the stops themselves, the slopes either side measured numerically,
// and CSS's straight line for two stops.
const GREY_STOPS = LEVELS.flatMap(a => LEVELS.flatMap(b => LEVELS.map(c => [a, b, c].map(v => rgbToHex([v, v, v])))))
const grey = (curve, t) => curve(t)[0]

test('the curve meets every stop, stays between neighbouring stops and has no kink at the middle one', () => {
  for (const stops of GREY_STOPS) {
    const [curve, y] = [curveOf(stops), stops.map(hex => hexToRgb(hex)[0])]
    y.forEach((v, k) => { if (Math.abs(grey(curve, k / 2) - v) > 1e-9) assert.fail(`${stops} misses stop ${k}`) })
    for (let i = 0; i <= 64; i++) {
      const [t, k] = [i / 64, Math.min(Math.floor(i / 32), 1)]
      const v = grey(curve, t)
      if (v < Math.min(y[k], y[k + 1]) - 1e-9 || v > Math.max(y[k], y[k + 1]) + 1e-9) assert.fail(`${stops} overshoots at ${t}`)
    }
    const [left, right] = [(grey(curve, 0.5) - grey(curve, 0.5 - 1e-6)) / 1e-6, (grey(curve, 0.5 + 1e-6) - grey(curve, 0.5)) / 1e-6]
    if (Math.abs(left - right) > 1e-2) assert.fail(`${stops} kinks at the middle stop: ${left} against ${right}`)
  }
})

test('with two stops the curve is CSS\'s straight line', () => {
  const curve = curveOf(['#103050', '#f0a020'])
  for (let i = 0; i <= 64; i++) curve(i / 64).forEach((v, c) => assert.ok(Math.abs(v - ([16, 48, 80][c] + ([240, 160, 32][c] - [16, 48, 80][c]) * i / 64)) < 1e-9))
})

test('the CSS stops stay within half a level of the curve', () => {
  for (const stops of [...GREY_STOPS.filter((_, i) => i % 7 === 0), ['#ff0000', '#00ff00', '#0000ff']]) {
    const [curve, points] = [curveOf(stops), curveStops(stops).match(/rgb\([^)]+\)/g).map(p => p.slice(4, -1).split(' ').map(Number))]
    for (let i = 0; i <= 512; i++) {
      const [at, v] = [i / 512 * 32, curve(i / 512)]
      const [k, f] = [Math.min(Math.floor(at), 31), at - Math.min(Math.floor(at), 31)]
      v.forEach((exact, c) => { if (Math.abs(points[k][c] + (points[k + 1][c] - points[k][c]) * f - exact) > 0.5) assert.fail(`${stops} at ${i / 512}`) })
    }
  }
})

// The smooth window raster (claims 7 and 8): CSS's geometry written out for the four axis-aligned angles, the
// colour from the curve above, sampled at the pixel's centre.
const STOPS = ['#000000', '#2a2a2a', '#bababa']
const exactAt = (stops, t) => curveOf(stops)(Math.min(Math.max(t, 0), 1))
const AXES = { 0: (x, y, w, h) => 1 - y / h, 90: (x, y, w) => x / w, 180: (x, y, w, h) => y / h, 270: (x, y, w) => 1 - x / w }

test('every pixel of the smooth raster is the curve\'s colour rounded down or up, at both scales', () => {
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

test('every 8x8 block of the smooth raster averages within 1/6 level of the curve', () => {
  const [width, height] = [64, 1080]
  const { pixels, cols } = smoothPixels({ shape: 'linear', angle: 180 }, STOPS, { width, height, scale: 1 })
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      let error = 0
      for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) error += pixels[(y * cols + x) * 4] - exactAt(STOPS, (y + 0.5) / height)[0]
      assert.ok(Math.abs(error / 64) <= 1 / 6, `block (${bx}, ${by}) is off by ${(error / 64).toFixed(3)}`)
    }
  }
})
