// Building elements, and the fixed ones index.html already holds.

export const $ = (sel, root = document) => root.querySelector(sel)

export function h (tag, cls, html) {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (html !== undefined) el.innerHTML = html
  return el
}

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export const app = $('#app')
export const strip = $('#strip')
export const run = $('#strip .run')
export const side = $('#side')
export const stage = $('#stage')
