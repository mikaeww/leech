// The owner's colours (ADR 0008): the paint setting as custom properties on the root, and on each part it
// paints the ink that reads there. Nothing set leaves every stock token alone.
import { BAYER } from '../look/backdrop.js'
import { prefs, setPref } from '../state.js'
import { contrast, hexToRgb, inkFor, normalHex } from './colour.js'

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
  const list = stops.length === 1 ? `${stops[0]}, ${stops[0]}` : stops.join(', ')
  return w.shape === 'radial' ? `radial-gradient(circle at 15% 0%, ${list})` : `linear-gradient(${w.angle}deg, ${list})`
}

// The window's image (laid over the whole window, tokens.css --window), its size, and the colour under it.
function windowLook (w, stops) {
  if (w.kind === 'colour') return { colour: stops[0] }
  return (w.dither && dithered(w, stops)) || { image: gradient(w, stops), colour: stops[0] }
}

/** How a paint setting's window looks in small, for a preset's chip: always an image, never a bare colour. */
export function previewOf (saved) {
  const w = paintOf(saved).window
  if (w.kind === 'grey') return 'linear-gradient(var(--bg), var(--bg))'
  return gradient(w, w.kind === 'colour' ? w.colours.slice(0, 1) : w.colours)
}

// ---- the dithered gradient: each dot takes one of its two neighbouring stops by the Bayer threshold ----

// The dots last drawn and what they were drawn for, and the drawing under way.
let ready = { key: '', url: null }
let pending = ''

// Where a point lies along the gradient (0–1), the way CSS lays the same gradient over the window.
function position (w, x, y, width, height) {
  if (w.shape === 'radial') {
    const cx = width * 0.15
    return Math.hypot(x - cx, y) / Math.hypot(Math.max(cx, width - cx), height)
  }
  const a = w.angle * Math.PI / 180
  const length = Math.abs(width * Math.sin(a)) + Math.abs(height * Math.cos(a))
  return ((x - width / 2) * Math.sin(a) - (y - height / 2) * Math.cos(a)) / length + 0.5
}

function dithered (w, stops) {
  const dot = paintOf().dot
  const scale = devicePixelRatio || 1
  const [cols, rows] = [Math.ceil(innerWidth / dot), Math.ceil(innerHeight / dot)]
  const key = JSON.stringify([w, stops, dot, cols, rows, scale])
  if (ready.key === key) return { image: `url(${ready.url})`, size: `${cols * dot}px ${rows * dot}px`, colour: stops[0] }
  if (pending !== key) drawDots(w, stops, { dot, scale, cols, rows, key })
  // Until the dots are ready, the same gradient smooth.
  return null
}

function drawDots (w, stops, { dot, scale, cols, rows, key }) {
  pending = key
  const small = new OffscreenCanvas(cols, rows)
  const ctx = small.getContext('2d')
  const image = ctx.createImageData(cols, rows)
  const rgb = stops.map(hexToRgb)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const at = Math.min(Math.max(position(w, x * dot, y * dot, innerWidth, innerHeight), 0), 1) * (rgb.length - 1)
      const i = Math.min(Math.floor(at), Math.max(rgb.length - 2, 0))
      const chosen = rgb[at - i > BAYER[(y & 7) * 8 + (x & 7)] ? Math.min(i + 1, rgb.length - 1) : i]
      image.data.set([...chosen, 255], (y * cols + x) * 4)
    }
  }
  ctx.putImageData(image, 0, 0)
  // Drawn up to device pixels without smoothing, so the dots stay square without image-rendering on the parts.
  const big = new OffscreenCanvas(Math.round(cols * dot * scale), Math.round(rows * dot * scale))
  const bigCtx = big.getContext('2d')
  bigCtx.imageSmoothingEnabled = false
  bigCtx.drawImage(small, 0, 0, big.width, big.height)
  big.convertToBlob().then(blob => {
    if (pending !== key) return
    if (ready.url) URL.revokeObjectURL(ready.url)
    ready = { key, url: URL.createObjectURL(blob) }
    applyPaint()
  }, error => {
    // The smooth gradient stays on screen; said, so a dither that never shows has a reason in the console.
    pending = ''
    console.error('paint: the dithered window could not be drawn', error)
  })
}

// The dots are laid out for the window's size: drawn again once a resize settles.
let resizing = 0
addEventListener('resize', () => {
  clearTimeout(resizing)
  resizing = setTimeout(() => { if (paintOf().window.dither) applyPaint() }, 150)
})

applyPaint()
