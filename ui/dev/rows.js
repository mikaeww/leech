// The pieces the Dev UI's tools are built from: a bar of controls, chips that switch, a field that keeps its
// text across a redraw, lines of names and values, and the empty state that says why it is empty.
import { esc, h } from '../elements.js'

export function bar (...parts) {
  const el = h('div', 'dev-bar')
  el.append(...parts.filter(Boolean))
  return el
}

export function chip (label, on, fn) {
  const b = h('button', 'dev-chip' + (on ? ' on' : ''), esc(label))
  b.setAttribute('aria-pressed', String(!!on))
  b.addEventListener('click', fn)
  return b
}

// `keep` names the field, so a redraw puts the caret back where it was.
export function field (placeholder, value, change, keep, cls = '') {
  const input = h('input', 'dev-field ' + cls)
  input.placeholder = placeholder
  input.value = value
  input.spellcheck = false
  input.dataset.keep = keep
  input.addEventListener('input', () => change(input.value))
  return input
}

export function button (label, fn, primary = false) {
  const b = h('button', 'dev-button' + (primary ? ' primary' : ''), esc(label))
  b.addEventListener('click', e => { e.stopPropagation(); fn() })
  return b
}

/** A titled block of name and value lines; values are monospace and selectable. */
export function pairs (title, entries) {
  const el = h('section', 'dev-pairs', `<div class="dev-caption">${esc(title)}</div>`)
  if (!entries.length) el.append(h('div', 'dev-pair none', 'None'))
  for (const [name, value] of entries) el.append(h('div', 'dev-pair', `<span class="key">${esc(name)}</span><span class="value">${esc(value)}</span>`))
  return el
}

export const caption = text => h('div', 'dev-caption', esc(text))
export const empty = text => h('div', 'dev-empty', esc(text))

/** A scrolling list; the column keeps where it was scrolled across redraws by its `keep` name. */
export function scroller (keep, ...parts) {
  const el = h('div', 'dev-scroll')
  el.dataset.keep = keep
  el.append(...parts.filter(Boolean))
  return el
}
