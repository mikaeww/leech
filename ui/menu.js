// Menus drawn the way Search draws its site card (SiteCard.swift, MenuMetrics): the macOS menu, on any desktop.
// Items: {id, label, enabled?, checked?, keys?, items?} or '-' for a separator, or {header}.

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const chevron = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>'
const tick = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>'

let open = null
// Where the pointer last was: a menu without a place opens there, like a native one.
const pointer = { x: 0, y: 0 }
for (const kind of ['pointerdown', 'pointermove']) {
  window.addEventListener(kind, e => { pointer.x = e.clientX; pointer.y = e.clientY }, true)
}

function build (items, finish) {
  const el = document.createElement('div')
  el.className = 'menu'
  let child = null
  for (const item of items) {
    if (item === '-') { el.insertAdjacentHTML('beforeend', '<div class="menu-rule"></div>'); continue }
    if (item.header) { el.insertAdjacentHTML('beforeend', `<div class="menu-header">${esc(item.header)}</div>`); continue }
    const row = document.createElement('div')
    row.className = 'menu-row' + (item.enabled === false ? ' off' : '')
    row.innerHTML = `<span class="menu-tick">${item.checked ? tick : ''}</span><span class="menu-label">${esc(item.label)}</span>` +
      (item.keys ? `<span class="menu-keys">${esc(item.keys)}</span>` : '') +
      (item.items ? `<span class="menu-more">${chevron}</span>` : '')
    row.addEventListener('mouseenter', () => {
      child?.remove()
      child = null
      if (!item.items || item.enabled === false) return
      child = build(item.items, finish)
      document.body.append(child)
      const r = row.getBoundingClientRect()
      place(child, r.right - 4, r.top - 5, r.left + 4)
    })
    row.addEventListener('click', () => {
      if (item.enabled === false || item.items) return
      finish(item.id)
    })
    el.append(row)
  }
  el.addEventListener('contextmenu', e => e.preventDefault())
  el.close = () => { child?.close?.(); child?.remove(); el.remove() }
  return el
}

// Opens right and down from the point, flipping when the window edge is in the way.
function place (el, x, y, flipX = x) {
  const w = el.offsetWidth
  const h = el.offsetHeight
  const left = x + w > innerWidth - 6 ? Math.max(6, flipX - w) : x
  const top = y + h > innerHeight - 6 ? Math.max(6, innerHeight - 6 - h) : y
  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

/** Shows the menu at a point in the window and resolves to the chosen id, or null. */
export function menu (items, at) {
  open?.(null)
  return new Promise(resolve => {
    const scrim = document.createElement('div')
    scrim.className = 'menu-scrim'
    let root = null
    const finish = id => {
      open = null
      root.close()
      scrim.remove()
      document.removeEventListener('keydown', key, true)
      resolve(id)
    }
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null) } }
    scrim.addEventListener('mousedown', () => finish(null))
    scrim.addEventListener('contextmenu', e => { e.preventDefault(); finish(null) })
    document.addEventListener('keydown', key, true)
    root = build(items, finish)
    document.body.append(scrim, root)
    place(root, Math.round(at?.x ?? pointer.x), Math.round(at?.y ?? pointer.y))
    open = finish
  })
}

export const closeMenu = () => open?.(null)
