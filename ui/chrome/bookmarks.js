// Bookmarks around the page: the dropdown behind the bookmark door and the bar.
import { $, esc, h } from '../elements.js'
import { icon } from '../look/icons.js'
import { menu } from '../look/menu.js'
import { toast } from '../page/notices.js'
import { isWeb } from '../places/address.js'
import { bookmarks, current, icons, label, prefs, sideMode, stowed, ui } from '../state.js'
import { open } from '../tabs/tabs.js'
import { go } from '../tabs/views.js'
import { markFor } from './marks.js'
import { panels } from './panels.js'
import { render } from './render.js'

export function bookmarkPage () {
  const t = current()
  if (!t || !isWeb(t.url)) return
  toast(bookmarks.add(t.url, label(t)) ? 'Bookmarked' : 'Already in your bookmarks')
  render()
}

function bookmarkItems (list) {
  return list.map(n => n.children
    ? { id: '', label: n.title, items: n.children.length ? bookmarkItems(n.children) : [{ id: '', label: 'Empty', enabled: false }] }
    : { id: `url:${n.url}`, label: n.title.length > 60 ? n.title.slice(0, 58) + '…' : n.title })
}

// BookmarksDropdown: 280 wide, the outline, then "Add This Page" and "Manage Bookmarks…".
let dropdown = null
const openFolders = new Set()

function closeDropdown () {
  dropdown?.remove()
  dropdown = null
  document.removeEventListener('mousedown', outsideDropdown, true)
}
function outsideDropdown (e) {
  if (!e.target.closest('.dropdown, .menu, .menu-scrim') && !e.target.closest('.door.bookmarks')) closeDropdown()
}

function outlineRows (list, depth, into, pick) {
  for (const node of list) {
    const folder = !!node.children
    const open = openFolders.has(node.id)
    const row = h('div', 'outline-row')
    row.style.setProperty('--depth', depth)
    const count = folder ? bookmarks.countIn(node) : 0
    row.innerHTML = folder
      ? `<span class="chevron${open ? ' open' : ''}">${icon('forward', 'small')}</span><span class="mark">${icon('folderFill', 'small')}</span><span class="name">${esc(node.title)}</span>${count ? `<span class="count">${count}</span>` : ''}`
      : `<span class="chevron-space"></span>${markFor(node.url, 15)}<span class="name">${esc(node.title)}</span>`
    row.addEventListener('click', () => {
      if (!folder) return pick(node.url)
      open ? openFolders.delete(node.id) : openFolders.add(node.id)
      paintDropdown()
    })
    into.append(row)
    if (folder && open) {
      if (node.children.length) outlineRows(node.children, depth + 1, into, pick)
      else into.append(emptyRow(depth + 1))
    }
  }
}

let dropdownAt = null
function paintDropdown () {
  if (!dropdown) return
  dropdown.innerHTML = ''
  if (!bookmarks.tree.length) dropdown.append(h('div', 'none', 'No bookmarks yet'))
  else {
    const box = h('div', 'outline outline-list')
    outlineRows(bookmarks.tree, 0, box, url => { closeDropdown(); go(current(), url) })
    dropdown.append(box)
  }
  const feet = h('div', 'feet')
  const foot = (glyph, label, fn) => {
    const line = h('div', 'foot-line', `${glyph ? icon(glyph) : '<span class="gap"></span>'}<span>${label}</span>`)
    line.addEventListener('click', () => { closeDropdown(); fn() })
    feet.append(line)
  }
  foot('bookmark', 'Add This Page', bookmarkPage)
  foot(null, 'Manage Bookmarks…', () => panels.open('bookmarks'))
  dropdown.append(feet)
  const { door, side } = dropdownAt
  const r = door.getBoundingClientRect()
  if (side) Object.assign(dropdown.style, { left: `${r.right + 8}px`, top: `${Math.max(8, r.bottom - dropdown.offsetHeight)}px` })
  else Object.assign(dropdown.style, { left: `${Math.max(8, r.right - 280)}px`, top: `${r.bottom + 6}px` })
}

export function bookmarksDoor (e) {
  if (dropdown) return closeDropdown()
  dropdownAt = { door: e.currentTarget, side: !!e.currentTarget.closest('#side') }
  dropdown = h('div', 'dropdown')
  $('#app').append(dropdown)
  paintDropdown()
  document.addEventListener('mousedown', outsideDropdown, true)
}

const bar = $('#bar')
let barKey = ''
export function renderBar () {
  const shown = prefs['bookmarks.bar'] && bookmarks.tree.length > 0 && !stowed() && !ui.immersed
  bar.hidden = !shown
  if (!shown) return false
  bar.style.left = `${sideMode() ? prefs['sidebar.width'] : 0}px`
  bar.style.top = `${sideMode() ? 8 : 52}px`
  const key = JSON.stringify(bookmarks.tree) + [...icons.keys()].length
  if (key === barKey) return true
  barKey = key
  bar.innerHTML = ''
  for (const node of bookmarks.tree) {
    const item = h('button', 'bar-item')
    item.innerHTML = node.children
      ? `${icon('folder')}<span class="name">${esc(node.title)}</span>${icon('down', 'small')}`
      : `${markFor(node.url, 13)}<span class="name">${esc(node.title)}</span>`
    item.title = node.url || node.title
    item.addEventListener('click', async () => {
      if (!node.children) return go(current(), node.url)
      const r = item.getBoundingClientRect()
      const chosen = await menu(node.children.length ? bookmarkItems(node.children) : [{ id: '', label: 'Empty', enabled: false }], { x: Math.round(r.left), y: Math.round(r.bottom + 2) })
      if (chosen?.startsWith('url:')) go(current(), chosen.slice(4))
    })
    item.addEventListener('auxclick', e => { if (e.button === 1 && node.url) open(node.url, false) })
    item.addEventListener('contextmenu', async e => {
      e.preventDefault()
      const chosen = await menu([...(node.url ? [{ id: 'tab', label: 'Open in New Tab' }] : []), { id: 'manage', label: 'Manage Bookmarks…' }, '-', { id: 'remove', label: 'Remove' }])
      if (chosen === 'tab') open(node.url, true)
      if (chosen === 'manage') panels.open('bookmarks')
      if (chosen === 'remove') { bookmarks.remove(node.id); render() }
    })
    bar.append(item)
  }
  return true
}

// The note in an open folder with nothing in it, indented one step under the folder.
export function emptyRow (depth) {
  const row = h('div', 'outline-empty', 'Empty')
  row.style.setProperty('--depth', depth)
  return row
}
