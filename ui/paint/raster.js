// The painted window's gradient as pixels (ADR 0008): smooth, or in the coarse dots the owner can choose.
// A CSS gradient lands on whole 8-bit levels, so one spread over few levels shows as bands; drawn here, each
// pixel takes the level just under or just over the exact colour by the Bayer threshold, and the bands average out.
// A leaf, so the unit tests load it without a window.
import { BAYER } from '../look/backdrop.js'
import { hexToRgb } from './colour.js'

/** Where a CSS point lies along the gradient (0–1), the way CSS lays the same gradient over a window this size. */
export function positionOf (w, width, height) {
  if (w.shape === 'radial') {
    const [cx, radius] = [width * 0.15, Math.hypot(Math.max(width * 0.15, width * 0.85), height)]
    return (x, y) => Math.hypot(x - cx, y) / radius
  }
  const a = w.angle * Math.PI / 180
  const length = Math.abs(width * Math.sin(a)) + Math.abs(height * Math.cos(a))
  const [sx, sy] = [Math.sin(a) / length, -Math.cos(a) / length]
  return (x, y) => (x - width / 2) * sx + (y - height / 2) * sy + 0.5
}

const threshold = (x, y) => BAYER[(y & 7) * 8 + (x & 7)]

// How far along the stops a point lies (0 to stops - 1), as CSS spaces them evenly.
const along = (count, t) => Math.min(Math.max(t, 0), 1) * (count - 1)

/** The window at device pixels ({ width, height } in CSS pixels): RGBA, each channel one level off at most. */
export function smoothPixels (w, stops, { width, height, scale }) {
  const [cols, rows] = [Math.round(width * scale), Math.round(height * scale)]
  const rgb = (stops.length === 1 ? [stops[0], stops[0]] : stops).map(hexToRgb).flat()
  const [pixels, position] = [new Uint8ClampedArray(cols * rows * 4), positionOf(w, width, height)]
  for (let y = 0, o = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++, o += 4) {
      const at = along(rgb.length / 3, position((x + 0.5) / scale, (y + 0.5) / scale))
      const s = Math.min(Math.floor(at), rgb.length / 3 - 2) * 3
      const f = at - s / 3
      const d = threshold(x, y)
      pixels[o] = Math.floor(rgb[s] + (rgb[s + 3] - rgb[s]) * f + d)
      pixels[o + 1] = Math.floor(rgb[s + 1] + (rgb[s + 4] - rgb[s + 1]) * f + d)
      pixels[o + 2] = Math.floor(rgb[s + 2] + (rgb[s + 5] - rgb[s + 2]) * f + d)
      pixels[o + 3] = 255
    }
  }
  return { pixels, cols, rows }
}

/** The window in dots of `dot` CSS pixels, one per pixel here: each takes one of its two neighbouring stops. */
export function dotPixels (w, stops, { width, height, dot }) {
  const [cols, rows] = [Math.ceil(width / dot), Math.ceil(height / dot)]
  const rgb = stops.map(hexToRgb)
  const [pixels, position] = [new Uint8ClampedArray(cols * rows * 4), positionOf(w, width, height)]
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const at = along(rgb.length, position(x * dot, y * dot))
      const i = Math.min(Math.floor(at), Math.max(rgb.length - 2, 0))
      pixels.set([...rgb[at - i > threshold(x, y) ? Math.min(i + 1, rgb.length - 1) : i], 255], (y * cols + x) * 4)
    }
  }
  return { pixels, cols, rows }
}
