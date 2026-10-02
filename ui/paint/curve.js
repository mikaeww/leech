// The path a painted gradient takes through its stops. A CSS gradient spaces stops evenly and joins them with
// straight lines in sRGB, so lightness changes at a different speed in each stretch and kinks at a middle stop:
// the eye reads zones. Here the stops sit as far apart as they look (distance in OKLab) and a curve without a kink
// joins them in OKLab, so the window changes at one even, perceived speed. A leaf, so the unit tests load it.
import { fromOklab, hexToRgb, toOklab } from './colour.js'

/** Where each stop sits (0–1): as far along as the perceived distance to it, evenly if all stops are one colour. */
export function positionsOf (labs) {
  const steps = labs.slice(1).map((lab, k) => Math.hypot(...lab.map((v, c) => v - labs[k][c])))
  const total = steps.reduce((sum, d) => sum + d, 0)
  if (!total) return labs.map((_, k) => labs.length > 1 ? k / (labs.length - 1) : 0)
  return labs.map((_, k) => steps.slice(0, k).reduce((sum, d) => sum + d, 0) / total)
}

// One channel's slope at each stop (Fritsch–Carlson): the slopes either side weighed by their stretch, zero where
// the channel turns, limited so the curve never overshoots a stop.
function slopes (y, x) {
  const h = x.slice(1).map((v, k) => v - x[k])
  const d = h.map((hk, k) => hk ? (y[k + 1] - y[k]) / hk : 0)
  const m = y.map((_, k) => {
    if (k === 0) return d[0] ?? 0
    if (k === d.length) return d[k - 1]
    return d[k - 1] * d[k] > 0 ? (h[k] * d[k - 1] + h[k - 1] * d[k]) / (h[k - 1] + h[k]) : 0
  })
  d.forEach((dk, k) => {
    const [a, b] = [m[k] / dk, m[k + 1] / dk]
    if (dk && a * a + b * b > 9) [m[k], m[k + 1]] = [3 * m[k] / Math.hypot(a, b), 3 * m[k + 1] / Math.hypot(a, b)]
  })
  return m
}

/** The colour at t (0–1) along the stops, as OKLab [L, a, b]. */
export function labCurveOf (stops) {
  // A stop repeating the one before adds no distance; kept, its empty stretch would flatten the slope beside it.
  const labs = stops.map(hex => toOklab(hexToRgb(hex))).filter((lab, k, all) => k === 0 || lab.some((v, c) => v !== all[k - 1][c]))
  const x = positionsOf(labs)
  const channels = [0, 1, 2].map(c => labs.map(lab => lab[c]))
  const tangents = channels.map(y => slopes(y, x))
  return t => {
    if (labs.length === 1) return labs[0]
    const u = Math.min(Math.max(t, 0), 1)
    let k = 0
    while (k < labs.length - 2 && u > x[k + 1]) k++
    const h = x[k + 1] - x[k]
    const s = h ? (u - x[k]) / h : 0
    const [h00, h10, h01, h11] = [2 * s ** 3 - 3 * s * s + 1, s ** 3 - 2 * s * s + s, 3 * s * s - 2 * s ** 3, s ** 3 - s * s]
    return channels.map((y, c) => h00 * y[k] + h10 * h * tangents[c][k] + h01 * y[k + 1] + h11 * h * tangents[c][k + 1])
  }
}

/** The colour at t (0–1) along the stops, as [r, g, b] 0–255 unrounded. */
export function curveOf (stops) {
  const curve = labCurveOf(stops)
  return t => fromOklab(curve(t))
}

/** The curve as CSS gradient stops, for a gradient interpolated `in oklab`: 65 keep the presets within a level of it. */
export function curveStops (stops) {
  const curve = labCurveOf(stops)
  return Array.from({ length: 65 }, (_, k) => `oklab(${curve(k / 64).map(v => v.toFixed(5)).join(' ')})`).join(', ')
}
