// Menus drawn the way Search draws its site card (SiteCard.swift, MenuMetrics): the macOS menu, on any desktop.
// Items: {id, label, enabled?, checked?, keys?, items?} or '-' for a separator, or {header}.
import { esc } from '../elements.js'
import { icon } from './icons.js'

let open = null
// Where the pointer last was: a menu without a place opens there, like a native one.
const pointer = { x: 0, y: 0 }
for (const kind of ['pointerdown', 'pointermove']) {
  window.addEventListener(kind, e => { pointer.x = e.clientX; pointer.y = e.clientY }, true)
}

function build (items, finish) {
  const el = document.createElement('div')
  el.className = 'menu'
  el.setAttribute('role', 'menu')
  el.child = null
  const openChild = (row, item) => {
    el.child?.close()
    el.child = null
    if (!item.items || item.enabled === false) return
    el.child = build(item.items, finish)
    el.child.parentMenu = el
    document.body.append(el.child)
    const r = row.getBoundingClientRect()
    place(el.child, r.right - 4, r.top - 5, r.left + 4)
  }
  for (const item of items) {
    if (item === '-') { el.insertAdjacentHTML('beforeend', '<div class="menu-rule" role="separator"></div>'); continue }
    if (item.header) { el.insertAdjacentHTML('beforeend', `<div class="menu-header" role="presentation">${esc(item.header)}</div>`); continue }
    const row = document.createElement('div')
    row.className = 'menu-row' + (item.enabled === false ? ' off' : '')
    row.setAttribute('role', 'checked' in item ? 'menuitemcheckbox' : 'menuitem')
    if ('checked' in item) row.setAttribute('aria-checked', String(!!item.checked))
    if (item.enabled === false) row.setAttribute('aria-disabled', 'true')
    if (item.items) row.setAttribute('aria-haspopup', 'menu')
    row.innerHTML = `<span class="menu-tick">${item.checked ? icon('check', 'small') : ''}</span><span class="menu-label">${esc(item.label)}</span>` +
      (item.keys ? `<span class="menu-keys">${esc(item.keys)}</span>` : '') +
      (item.items ? `<span class="menu-more">${icon('forward', 'small')}</span>` : '')
    row.activate = () => {
      if (item.enabled === false) return
      if (item.items) openChild(row, item)
      else finish(item.id)
    }
    row.addEventListener('mouseenter', () => { pick(el, row); openChild(row, item) })
    row.addEventListener('mouseleave', () => { if (!el.child) pick(el, null) })
    row.addEventListener('click', () => { if (!item.items) row.activate() })
    el.append(row)
  }
  el.addEventListener('contextmenu', e => e.preventDefault())
  el.close = () => { el.child?.close(); el.remove() }
  return el
}

function pick (el, row) {
  el.querySelector(':scope > .picked')?.classList.remove('picked')
  row?.classList.add('picked')
}

// Up and down skip what can't be chosen and wrap around, as native menus do.
function step (el, by) {
  const rows = [...el.querySelectorAll(':scope > .menu-row:not(.off)')]
  if (!rows.length) return
  const at = rows.indexOf(el.querySelector(':scope > .picked'))
  pick(el, rows[at < 0 ? (by > 0 ? 0 : rows.length - 1) : (at + by + rows.length) % rows.length])
}

// Keys go to the innermost open menu: arrows move, right or Enter opens a submenu, left closes it.
function steer (root, key, finish) {
  let el = root
  while (el.child) el = el.child
  const picked = el.querySelector(':scope > .picked')
  const opens = key === 'Enter' || key === ' ' || (key === 'ArrowRight' && picked?.getAttribute('aria-haspopup'))
  if (key === 'Escape') finish(null)
  else if (key === 'ArrowDown' || key === 'ArrowUp') step(el, key === 'ArrowDown' ? 1 : -1)
  else if (key === 'ArrowLeft' && el.parentMenu) {
    el.parentMenu.child = null
    el.close()
  } else if (opens) {
    picked?.activate()
    if (el.child) step(el.child, 1)
  } else return false
  return true
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
    // Keys only reach the menu while the window has focus, not the page. Cancelled, focus goes back where it
    // was; a chosen item's action decides (a page given focus back late would take it from a field the action
    // opened, such as a folder's name).
    const before = document.activeElement
    const finish = id => {
      open = null
      root.close()
      scrim.remove()
      document.removeEventListener('keydown', key, true)
      if (id === null && (!document.activeElement || document.activeElement === document.body)) before?.focus?.()
      resolve(id)
    }
    const key = e => { if (steer(root, e.key, finish)) { e.preventDefault(); e.stopPropagation() } }
    scrim.addEventListener('mousedown', () => finish(null))
    scrim.addEventListener('contextmenu', e => { e.preventDefault(); finish(null) })
    document.addEventListener('keydown', key, true)
    root = build(items, finish)
    root.tabIndex = -1
    document.body.append(scrim, root)
    place(root, Math.round(at?.x ?? pointer.x), Math.round(at?.y ?? pointer.y))
    root.focus({ preventScroll: true })
    open = finish
  })
}
