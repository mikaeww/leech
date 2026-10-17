// What the island's views are built from: tiles in a grid, rows that name a tab, a site or a file with doors
// after them, and the one way a switch's change reaches the shell.
import { render } from '../chrome/render.js'
import { esc, h } from '../elements.js'
import { icon } from '../look/icons.js'
import { settle } from '../look/motion.js'
import { configure, setPref } from '../state.js'

/** A tile: its icon over its label; `on` fills it (a mode that is on), `off` greys it out (nothing to do here). */
export function tile (glyph, label, run, { on = null, off = false } = {}) {
  const b = h('button', 'island-tile' + (on ? ' on' : ''), `${icon(glyph, 'small')}<span>${esc(label)}</span>`)
  b.disabled = off
  if (on !== null) b.setAttribute('aria-pressed', String(on))
  b.addEventListener('click', run)
  return b
}

export function tiles (...list) {
  const grid = h('div', 'island-tiles')
  grid.append(...list.filter(Boolean))
  return grid
}

/** A row: what it names (a button when it leads somewhere), then its doors. */
export function row (lead, ...doors) {
  const r = h('div', 'island-row')
  r.append(lead, ...doors.filter(Boolean))
  return r
}

export function named (html, title, run) {
  const b = h(run ? 'button' : 'span', 'island-tab', html)
  if (run) { b.title = title; b.addEventListener('click', run) }
  return b
}

/** Two or more small buttons where a line has room for one control. */
export function quicks (...list) {
  const box = h('span', 'island-quicks')
  box.append(...list.filter(Boolean))
  return box
}

// A setting the shell has to hear (its rules, the page script's sheet). The island is drawn again once the
// switch has slid, so a line that depends on it comes or goes.
export function change (key, value) {
  setPref(key, value)
  configure()
  setTimeout(render, settle.ms)
}
