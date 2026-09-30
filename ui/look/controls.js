// The controls every surface is built from: square doors, switches, segmented choices, text buttons.
import { esc, h } from '../elements.js'
import { icon } from './icons.js'

export function door (name, title, fn) {
  const b = h('button', 'door', icon(name))
  b.title = title
  b.addEventListener('click', fn)
  return b
}

// Flips itself first, so the knob slides; whoever listens hears about it after.
export function toggle (on, change) {
  const b = h('button', 'switch' + (on ? ' on' : ''), '<span class="knob-dot"></span>')
  b.setAttribute('role', 'switch')
  b.setAttribute('aria-checked', String(on))
  b.addEventListener('click', () => {
    on = !on
    b.classList.toggle('on', on)
    b.setAttribute('aria-checked', String(on))
    change(on)
  })
  return b
}

export function segmented (options, value, change, wide = false) {
  const el = h('div', 'segmented' + (wide ? ' wide' : ''))
  const knob = h('span', 'chosen')
  el.append(knob)
  const slide = b => { knob.style.left = `${b.offsetLeft}px`; knob.style.width = `${b.offsetWidth}px` }
  for (const [id, title] of options) {
    const b = h('button', id === value ? 'on' : '', esc(title))
    b.addEventListener('click', () => {
      if (id === value) return
      value = id
      el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b))
      slide(b)
      change(id)
    })
    el.append(b)
    if (id === value) requestAnimationFrame(() => { knob.style.transition = 'none'; slide(b); requestAnimationFrame(() => { knob.style.transition = '' }) })
  }
  return el
}

// A text button; the one primary action of a place is filled.
export function action (title, fn, primary = false) {
  const b = h('button', 'action' + (primary ? ' primary' : ''), esc(title))
  b.addEventListener('click', fn)
  return b
}
