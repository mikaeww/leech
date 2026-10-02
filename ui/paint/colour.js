// Colours as the paint setting holds them (#rrggbb): conversions for the picker, contrast for the ink.
// A leaf, so the unit tests load it without a window.

/** #rgb or #rrggbb, with or without the #, as lower-case #rrggbb; null for anything else. */
export function normalHex (text) {
  const bare = String(text ?? '').trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(bare)) return '#' + [...bare].map(c => c + c).join('')
  return /^[0-9a-f]{6}$/.test(bare) ? '#' + bare : null
}

export const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
export const rgbToHex = rgb => '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')

/** [hue 0–360, saturation 0–1, value 0–1] */
export function hexToHsv (hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, max ? d / max : 0, max]
}

export function hsvToHex ([h, s, v]) {
  const channel = n => {
    const k = (n + h / 60) % 6
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255
  }
  return rgbToHex([channel(5), channel(3), channel(1)])
}

/** The colour a fraction t of the way from a to b, mixed in sRGB. */
export function mix (a, b, t) {
  const [x, y] = [hexToRgb(a), hexToRgb(b)]
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t))
}

// Each channel's slope at each stop (Fritsch–Carlson): the mean of the slopes either side, zero where the
// channel turns, so the curve never overshoots a stop.
function slopes (values) {
  const d = values.slice(1).map((v, k) => v - values[k])
  const m = values.map((v, k) => k === 0 ? d[0] : k === d.length ? d[k - 1] : d[k - 1] * d[k] > 0 ? (d[k - 1] + d[k]) / 2 : 0)
  d.forEach((dk, k) => {
    const [a, b] = [m[k] / dk, m[k + 1] / dk]
    if (dk && a * a + b * b > 9) [m[k], m[k + 1]] = [3 * m[k] / Math.hypot(a, b), 3 * m[k + 1] / Math.hypot(a, b)]
  })
  return m
}

/** The colour at t (0–1) through evenly spaced stops, as [r, g, b] unrounded: a curve without a kink at a
 *  middle stop, where a CSS gradient's straight lines meet at an edge the eye sees. Two stops are a straight line. */
export function curveOf (stops) {
  const channels = [0, 1, 2].map(c => stops.map(hex => hexToRgb(hex)[c]))
  const tangents = channels.map(slopes)
  return t => {
    const at = Math.min(Math.max(t, 0), 1) * (stops.length - 1)
    const k = Math.min(Math.floor(at), Math.max(stops.length - 2, 0))
    const s = at - k
    const [h00, h10, h01, h11] = [2 * s ** 3 - 3 * s * s + 1, s ** 3 - 2 * s * s + s, 3 * s * s - 2 * s ** 3, s ** 3 - s * s]
    return channels.map((y, c) => stops.length === 1 ? y[0] : h00 * y[k] + h10 * tangents[c][k] + h01 * y[k + 1] + h11 * tangents[c][k + 1])
  }
}

/** The curve as CSS gradient stops, which CSS joins with straight lines: 33 keep them within half a level of it. */
export function curveStops (stops) {
  const curve = curveOf(stops)
  return Array.from({ length: 33 }, (_, k) => `rgb(${curve(k / 32).map(v => v.toFixed(1)).join(' ')})`).join(', ')
}

// WCAG 2.1 relative luminance and contrast ratio.
export function luminance (hex) {
  const [r, g, b] = hexToRgb(hex).map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast (a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// The two looks' primary text (--fg in tokens.css): dark text in the light look, light text in the dark one.
const INK = { light: '#171717', dark: '#ededed' }

/** Which look's ink reads better on all of these colours: 'light' (dark text) or 'dark' (light text). */
export function inkFor (colours) {
  const worst = ink => Math.min(...colours.map(c => contrast(c, ink)))
  return worst(INK.dark) > worst(INK.light) ? 'dark' : 'light'
}
