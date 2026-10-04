// The pieces panels are built from: cards of lines, captions, quick buttons, the hunt field, and
// how a time is said.
import { esc, h } from '../elements.js'
import { icon } from '../look/icons.js'

export function line (title, detail, control) {
  const el = h('div', 'line', `<div class="words"><div class="name">${esc(title)}</div>${detail ? `<div class="detail">${esc(detail)}</div>` : ''}</div>`)
  if (control) el.append(control)
  return el
}

export function card (...parts) {
  const el = h('div', 'card')
  el.append(...parts.filter(Boolean))
  return el
}

export const nothing = text => card(h('div', 'nothing', esc(text)))
export const caption = text => h('div', 'caption', esc(text))

export function quick (title, fn, red = false) {
  const b = h('button', 'quick' + (red ? ' red' : ''), esc(title))
  b.addEventListener('click', e => { e.stopPropagation(); fn() })
  return b
}

export function hunt (prompt, value, change, keep) {
  const box = h('label', 'hunt', icon('search'))
  const input = h('input')
  input.placeholder = prompt
  input.value = value
  input.spellcheck = false
  input.dataset.keep = keep
  input.autofocus = true
  input.addEventListener('input', () => change(input.value))
  box.append(input)
  if (value) {
    const clear = h('button', 'clear', icon('clearFill'))
    clear.addEventListener('click', () => change(''))
    box.append(clear)
  }
  return box
}

const DAY = 86400
export function dayOf (t) {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 1000
  if (t >= start) return 'Today'
  if (t >= start - DAY) return 'Yesterday'
  return new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}
export const clock = t => new Date(t * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
export function said (t) {
  const s = t - Date.now() / 1000
  const [n, unit] = [['day', DAY], ['hour', 3600], ['minute', 60]].map(([u, size]) => [Math.round(s / size), u]).find(([n]) => Math.abs(n) >= 1) || [Math.round(s), 'second']
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' }).format(n, unit)
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']
/** A size in bytes as people say it: 1.2 MB, 840 KB. */
export function bytes (n) {
  let i = 0
  while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++ }
  return `${i && n < 10 ? n.toFixed(1) : Math.round(n)} ${UNITS[i]}`
}
