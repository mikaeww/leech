// Colours as the paint setting holds them (#rrggbb): conversions for the picker and the gradient's curve, contrast
// for the ink.
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

// sRGB's transfer: a channel 0–255 to linear light 0–1 and back.
const linear = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
const encoded = l => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055)

/** [r, g, b] 0–255 to OKLab [L, a, b] (Ottosson 2020, as CSS Color 4 uses it). */
export function toOklab (rgb) {
  const [r, g, b] = rgb.map(linear)
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt)
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s]
}

/** OKLab [L, a, b] to [r, g, b] 0–255, unrounded, clamped to sRGB's gamut. */
export function fromOklab ([L, a, b]) {
  const [l, m, s] = [L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.2914855480 * b].map(v => v ** 3)
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(v => Math.min(255, Math.max(0, encoded(Math.min(1, Math.max(0, v))))))
}

// WCAG 2.1 relative luminance and contrast ratio.
export function luminance (hex) {
  const [r, g, b] = hexToRgb(hex).map(linear)
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
