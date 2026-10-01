// The colour picker (ADR 0008): a swatch that opens a popover with a saturation and brightness field, a hue
// slider and a hex field. Leech draws it itself: Chromium's colour chooser isn't reachable from the interface.
import { h } from '../elements.js'
import { hexToHsv, hsvToHex, normalHex } from './colour.js'

let open = null

/** A swatch showing `value`; picking calls change(hex) on every move, so the window follows live. */
export function swatch (value, change, label) {
  const b = h('button', 'swatch')
  b.setAttribute('aria-label', label)
  const show = hex => { b.style.setProperty('--swatch', hex); b.title = `${label}: ${hex}` }
  show(value)
  b.addEventListener('click', e => {
    e.stopPropagation()
    if (open?.anchor === b) return open.close()
    pick(b, value, hex => { value = hex; show(hex); change(hex) })
  })
  return b
}

const clamp = v => Math.min(Math.max(v, 0), 1)

function build () {
  return h('div', 'picker', `<div class="picker-field" tabindex="0" role="slider" aria-label="Saturation and brightness"><span class="picker-knob"></span></div>
    <input class="range picker-hue" type="range" min="0" max="359" step="1" aria-label="Hue">
    <label class="picker-hex"><span>Hex</span><input class="plain-field" spellcheck="false" maxlength="7" aria-label="Hex colour"></label>`)
}

// The field: drag anywhere in it, or the arrow keys a hundredth at a time (Shift for a tenth).
function wireField (field, hsv, moved) {
  const at = e => {
    const r = field.getBoundingClientRect()
    hsv[1] = clamp((e.clientX - r.left) / r.width)
    hsv[2] = 1 - clamp((e.clientY - r.top) / r.height)
    moved()
  }
  field.addEventListener('pointerdown', e => { field.setPointerCapture(e.pointerId); at(e) })
  field.addEventListener('pointermove', e => { if (field.hasPointerCapture(e.pointerId)) at(e) })
  field.addEventListener('keydown', e => {
    const step = e.shiftKey ? 0.1 : 0.01
    const move = { ArrowLeft: [1, -step], ArrowRight: [1, step], ArrowUp: [2, step], ArrowDown: [2, -step] }[e.key]
    if (!move) return
    e.preventDefault()
    hsv[move[0]] = clamp(hsv[move[0]] + move[1])
    moved()
  })
}

function pick (anchor, hex, change) {
  open?.close()
  // Kept as HSV while open, so a grey or black doesn't lose the hue being worked on.
  const hsv = hexToHsv(hex)
  const el = build()
  const [field, knob, hue, text] = ['.picker-field', '.picker-knob', '.picker-hue', '.picker-hex input'].map(s => el.querySelector(s))
  const paint = from => {
    const out = hsvToHex(hsv)
    el.style.setProperty('--hue', hsvToHex([hsv[0], 1, 1]))
    el.style.setProperty('--picked', out)
    knob.style.setProperty('--x', String(hsv[1]))
    knob.style.setProperty('--y', String(1 - hsv[2]))
    // The knob's ring is dark where the field is pale, white everywhere else.
    knob.style.setProperty('--ring', hsv[2] > 0.65 && hsv[1] < 0.35 ? 'var(--field-low)' : 'var(--field-high)')
    field.setAttribute('aria-valuetext', out)
    if (from !== 'hue') hue.value = String(Math.round(hsv[0]))
    if (from !== 'text') text.value = out
    return out
  }
  wireField(field, hsv, () => change(paint('field')))
  hue.addEventListener('input', () => { hsv[0] = Number(hue.value); change(paint('hue')) })
  text.addEventListener('input', () => {
    const typed = normalHex(text.value)
    if (!typed) return
    hsv.splice(0, 3, ...hexToHsv(typed))
    change(paint('text'))
  })
  paint()
  document.body.append(el)
  place(el, anchor.getBoundingClientRect())
  const outside = e => { if (!el.contains(e.target) && e.target !== anchor) close() }
  // Escape puts the picker away, not the panel under it.
  const keys = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); anchor.focus() } }
  function close () {
    el.remove()
    document.removeEventListener('pointerdown', outside, true)
    document.removeEventListener('keydown', keys, true)
    if (open?.el === el) open = null
  }
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('keydown', keys, true)
  open = { el, anchor, close }
  field.focus()
}

// Under the swatch, its right edges lined up, kept inside the window.
function place (el, r) {
  const margin = 8
  const { width, height } = el.getBoundingClientRect()
  const left = Math.min(Math.max(r.right - width, margin), innerWidth - width - margin)
  const top = r.bottom + margin + height > innerHeight ? r.top - margin - height : r.bottom + margin
  el.style.setProperty('--picker-x', `${Math.round(left)}px`)
  el.style.setProperty('--picker-y', `${Math.round(Math.max(top, margin))}px`)
}
