// The owner's colours (ADR 0008): the paint setting as custom properties on the root, and on each part it
// paints the ink that reads there. Nothing set leaves every stock token alone.
import { prefs, setPref } from '../state.js'
import { contrast, curveStops, inkFor, normalHex } from './colour.js'
import { dotPixels, smoothPixels } from './raster.js'

const root = document.documentElement
const WINDOW_PARTS = ['#side', '#strip', '#bar']
export const DOT_SIZES = [2, 3, 5]
const STOCK = {
  window: { kind: 'grey', colours: ['#0b2a6f', '#045af2', '#6544ee'], shape: 'linear', angle: 160, dither: false },
  accent: null, sheet: null, dots: null, dot: 3
}

// settings.json may have been edited by hand: every colour is checked, anything else falls back to stock.
const hexes = (list, fallback) => {
  const good = Array.isArray(list) ? list.map(normalHex).filter(Boolean) : []
  return good.length ? good.slice(0, 3) : fallback
}

/** A paint setting (by default the one saved), complete and checked. */
export function paintOf (saved = prefs.paint) {
  const p = saved || {}
  const w = p.window || {}
  return {
    window: {
      kind: ['grey', 'colour', 'gradient'].includes(w.kind) ? w.kind : 'grey',
      colours: hexes(w.colours, STOCK.window.colours),
      shape: w.shape === 'radial' ? 'radial' : 'linear',
      angle: Number.isFinite(w.angle) ? ((Math.round(w.angle) % 360) + 360) % 360 : STOCK.window.angle,
      dither: !!w.dither
    },
    accent: normalHex(p.accent),
    sheet: normalHex(p.sheet),
    dots: p.dots ? hexes(p.dots, null)?.slice(0, 2) ?? null : null,
    dot: DOT_SIZES.includes(p.dot) ? p.dot : STOCK.dot
  }
}

/** Merges `change` (window fields merge one level down) into the setting, saves it and paints. */
export function setPaint (change) {
  const p = paintOf()
  setPref('paint', change === null ? null : { ...p, ...change, window: { ...p.window, ...change.window } })
  applyPaint()
}

function set (name, value) {
  if (value == null) root.style.removeProperty(name)
  else root.style.setProperty(name, value)
}

function ink (selectors, which) {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    el?.classList.toggle('ink-light', which === 'light')
    el?.classList.toggle('ink-dark', which === 'dark')
  }
}

export function applyPaint () {
  const p = paintOf()
  const w = p.window
  const painted = w.kind !== 'grey'
  const stops = w.kind === 'colour' ? w.colours.slice(0, 1) : w.colours
  root.classList.toggle('painted', painted)
  const look = painted ? windowLook(w, stops) : {}
  set('--window-image', look.image)
  set('--window-colour', look.colour)
  set('--window-size', look.size)
  set('--window-paint', painted ? gradient(w, stops) : null)
  ink(WINDOW_PARTS, painted ? inkFor(stops) : null)

  root.classList.toggle('accented', !!p.accent)
  set('--accent', p.accent)
  set('--accent-fg', p.accent && (contrast(p.accent, '#ffffff') >= contrast(p.accent, '#171717') ? '#ffffff' : '#171717'))

  root.classList.toggle('sheeted', !!p.sheet)
  set('--sheet', p.sheet)
  // Without a sheet a blank tab on a painted window shows the window, so it takes the window's ink.
  ink(['#stage'], p.sheet ? inkFor([p.sheet]) : painted ? inkFor(stops) : null)
  // The address field wears the window's colours when there are any, else it reads on the sheet.
  ink(['#omni'], painted ? inkFor(stops) : p.sheet ? inkFor([p.sheet]) : null)

  root.classList.toggle('dotted', !!p.dots)
  set('--dots-a', p.dots?.[0])
  set('--dots-b', p.dots?.[1] || p.dots?.[0])
  set('--dot-size', p.dot === STOCK.dot ? null : String(p.dot))
}

function gradient (w, stops) {
  const list = stops.length === 1 ? `${stops[0]}, ${stops[0]}` : curveStops(stops)
  return w.shape === 'radial' ? `radial-gradient(circle at 15% 0%, ${list})` : `linear-gradient(${w.angle}deg, ${list})`
}

// The window's image (laid over the whole window, tokens.css --window), its size, and the colour under it.
function windowLook (w, stops) {
  if (w.kind === 'colour') return { colour: stops[0] }
  return rastered(w, stops) || { image: gradient(w, stops), colour: stops[0] }
}

/** How a paint setting's window looks in small, for a preset's chip: always an image, never a bare colour. */
export function previewOf (saved) {
  const w = paintOf(saved).window
  if (w.kind === 'grey') return 'linear-gradient(var(--bg), var(--bg))'
  return gradient(w, w.kind === 'colour' ? w.colours.slice(0, 1) : w.colours)
}

// ---- the gradient as pixels (raster.js): smooth, or in dots ----

// The pixels last drawn and what they were drawn for, and the drawing under way.
let ready = { key: '', url: null }
let pending = ''

function rastered (w, stops) {
  const dot = w.dither ? paintOf().dot : 0
  const area = { width: innerWidth, height: innerHeight, scale: devicePixelRatio || 1, dot }
  const key = JSON.stringify([w, stops, area])
  const size = dot ? `${Math.ceil(innerWidth / dot) * dot}px ${Math.ceil(innerHeight / dot) * dot}px` : `${innerWidth}px ${innerHeight}px`
  if (ready.key === key) return { image: `url(${ready.url})`, size, colour: stops[0] }
  if (pending !== key) draw(w, stops, area, key)
  // Until the pixels are ready, the same gradient as CSS draws it.
  return null
}

function canvasOf ({ pixels, cols, rows }) {
  const canvas = new OffscreenCanvas(cols, rows)
  canvas.getContext('2d').putImageData(new ImageData(pixels, cols, rows), 0, 0)
  return canvas
}

// Dots are drawn up to device pixels without smoothing, so they stay square without image-rendering on the parts.
function scaledUp (small, factor) {
  const big = new OffscreenCanvas(Math.round(small.width * factor), Math.round(small.height * factor))
  const ctx = big.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, big.width, big.height)
  return big
}

function draw (w, stops, area, key) {
  pending = key
  // ponytail: drawn on the main thread, ~35 ms at 1080p and ~120 ms at 2x; a worker once that stutters.
  const big = area.dot ? scaledUp(canvasOf(dotPixels(w, stops, area)), area.dot * area.scale) : canvasOf(smoothPixels(w, stops, area))
  big.convertToBlob().then(blob => {
    if (pending !== key) return
    if (ready.url) URL.revokeObjectURL(ready.url)
    ready = { key, url: URL.createObjectURL(blob) }
    applyPaint()
  }, error => {
    // The CSS gradient stays on screen; said, so pixels that never show have a reason in the console.
    pending = ''
    console.error('paint: the window\'s pixels could not be drawn', error)
  })
}

// The pixels are laid out for the window's size: drawn again once a resize settles.
let resizing = 0
addEventListener('resize', () => {
  clearTimeout(resizing)
  resizing = setTimeout(() => { if (paintOf().window.kind === 'gradient') applyPaint() }, 150)
})

applyPaint()
