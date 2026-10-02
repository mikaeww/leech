// The path a painted gradient takes through its stops (docs/verification/paint.md, claims 6 and 9).
import assert from 'node:assert/strict'
import test from 'node:test'
import { fromOklab, hexToRgb, rgbToHex, toOklab } from '../ui/paint/colour.js'
import { curveOf, curveStops, labCurveOf, positionsOf } from '../ui/paint/curve.js'
import { PRESETS } from '../ui/paint/presets.js'

const LEVELS = Array.from({ length: 16 }, (_, i) => i * 17)
// Channels of the curve are independent, so greys stand for its behaviour: every three-stop combination of 16 greys.
const GREY_STOPS = LEVELS.flatMap(a => LEVELS.flatMap(b => LEVELS.map(c => [a, b, c].map(v => rgbToHex([v, v, v])))))
const ONE_WAY = GREY_STOPS.filter(s => { const [a, b, c] = s.map(hex => hexToRgb(hex)[0]); return (a <= b && b <= c) || (a >= b && b >= c) })
const lightness = (curve, t) => curve(t)[0]
const near = (a, b, within) => Math.abs(a - b) <= within

test('OKLab matches Ottosson\'s published values and returns to the same sRGB colour within a thousandth of a level', () => {
  toOklab([255, 0, 0]).forEach((v, c) => assert.ok(near(v, [0.627955, 0.224863, 0.125846][c], 1e-5), `red ${c}`))
  toOklab([255, 255, 255]).forEach((v, c) => assert.ok(near(v, [1, 0, 0][c], 1e-4), `white ${c}`))
  for (const r of LEVELS) for (const g of LEVELS) for (const b of LEVELS) fromOklab(toOklab([r, g, b])).forEach((v, c) => { if (!near(v, [r, g, b][c], 1e-3)) assert.fail(`${[r, g, b]} returns as ${v}`) })
})

// Every 37th three-stop combination of 64 colours (four levels per channel), checked in each OKLab channel.
const COLOURS = [0, 85, 170, 255].flatMap(r => [0, 85, 170, 255].flatMap(g => [0, 85, 170, 255].map(b => rgbToHex([r, g, b]))))
const COLOUR_STOPS = COLOURS.flatMap(a => COLOURS.flatMap(b => COLOURS.map(c => [a, b, c]))).filter((_, i) => i % 37 === 0)

test('the curve meets every stop and stays between the stops either side, in every OKLab channel', () => {
  for (const stops of [...GREY_STOPS, ...COLOUR_STOPS]) {
    const labs = stops.map(hex => toOklab(hexToRgb(hex)))
    const [curve, x] = [labCurveOf(stops), positionsOf(labs)]
    labs.forEach((lab, k) => lab.forEach((v, c) => { if (!near(curve(x[k])[c], v, 1e-9)) assert.fail(`${stops} misses stop ${k}`) }))
    for (let i = 0; i <= 64; i++) {
      const [t, k] = [i / 64, i / 64 > x[1] ? 1 : 0]
      curve(t).forEach((v, c) => {
        if (!(v >= Math.min(labs[k][c], labs[k + 1][c]) - 1e-9 && v <= Math.max(labs[k][c], labs[k + 1][c]) + 1e-9)) assert.fail(`${stops} overshoots in channel ${c} at ${t}`)
      })
    }
  }
})

test('the perceived lightness of a grey gradient running one way changes at one speed throughout', () => {
  for (const stops of ONE_WAY) {
    const curve = labCurveOf(stops)
    const [from, to] = [lightness(curve, 0), lightness(curve, 1)]
    for (let i = 0; i <= 64; i++) if (!near(lightness(curve, i / 64), from + (to - from) * i / 64, 1e-9)) assert.fail(`${stops} at ${i / 64}`)
  }
})

test('the curve has the same slope either side of the middle stop', () => {
  for (const stops of GREY_STOPS) {
    const [curve, at] = [labCurveOf(stops), positionsOf(stops.map(hex => toOklab(hexToRgb(hex))))[1]]
    if (at < 1e-3 || at > 1 - 1e-3) continue
    const [left, right] = [(lightness(curve, at) - lightness(curve, at - 1e-7)) / 1e-7, (lightness(curve, at + 1e-7) - lightness(curve, at)) / 1e-7]
    if (!near(left, right, 1e-4 * Math.max(1, Math.abs(left)))) assert.fail(`${stops} kinks at ${at}: ${left} against ${right}`)
  }
})

test('with two stops the curve is a straight line in OKLab, as CSS draws a gradient `in oklab`', () => {
  const [a, b] = [toOklab([16, 48, 80]), toOklab([240, 160, 32])]
  const curve = labCurveOf(['#103050', '#f0a020'])
  for (let i = 0; i <= 64; i++) curve(i / 64).forEach((v, c) => assert.ok(near(v, a[c] + (b[c] - a[c]) * i / 64, 1e-12)))
})

// What a browser draws for curveStops: straight lines in OKLab between the points, turned into sRGB.
function cssWorst (stops) {
  const [curve, points] = [curveOf(stops), curveStops(stops).match(/oklab\([^)]+\)/g).map(p => p.slice(6, -1).split(' ').map(Number))]
  let worst = 0
  for (let i = 0; i <= 1024; i++) {
    const at = i / 1024 * (points.length - 1)
    const k = Math.min(Math.floor(at), points.length - 2)
    const drawn = fromOklab(points[k].map((v, c) => v + (points[k + 1][c] - v) * (at - k)))
    curve(i / 1024).forEach((v, c) => { worst = Math.max(worst, Math.abs(drawn[c] - v)) })
  }
  return worst
}

test('the CSS stand-ins stay within a level of the curve for the presets, a twentieth for greys running one way', () => {
  for (const stops of [['#000000', '#2a2a2a', '#bababa'], ...PRESETS.filter(([, p]) => p?.window.kind === 'gradient').map(([, p]) => p.window.colours)]) assert.ok(cssWorst(stops) <= 1, `${stops}: ${cssWorst(stops)}`)
  for (const stops of ONE_WAY.filter((_, i) => i % 5 === 0)) assert.ok(cssWorst(stops) <= 0.05, `${stops}: ${cssWorst(stops)}`)
})
