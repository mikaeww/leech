// The sidebar: the essentials' tiles, the space's pinned rows and its tabs and folders under section labels, the resize edge.
import { $, h, stage } from '../elements.js'
import { icon } from '../look/icons.js'
import { reduced, settle } from '../look/motion.js'
import { blank, current, editedInPlace, L, label, layout, prefs, S, setPref, sideStyle, tabs, ui } from '../state.js'
import { clearable, clearTabs } from '../tabs/archive.js'
import { folderMenu, folderOf, renameFolder, toggleFolder } from '../tabs/groups/folders.js'
import { bareHost } from '../places/address.js'
import { relations } from '../tabs/groups/related.js'
import { paneOf, partnerOf } from '../tabs/groups/split.js'
import { gridFor, pinPlace, pinsHeight, placeOf, SIDE_STYLES, slotPlace, slotsHeight } from '../tabs/groups/tiles.js'
import { startTabEdit, tabField } from '../tabs/edit.js'
import { bindTab } from '../tabs/pointer.js'
import { newTab } from '../tabs/tabs.js'
import { arrive, fill, glyphHTML, leave, markHTML, paintSplitGrounds, shyHTML, sideEls, statusHTML } from './marks.js'
import { animate, render } from './render.js'
import { paintReading } from './strip.js'

// The column's inner padding, --s5 in styles/chrome.css.
const SIDE_PAD = 12
// A row's height and the space under it, by the sidebar's style; "New tab" takes the first, the tabs start under it.
const step = () => SIDE_STYLES[sideStyle()].step
const slotAt = i => slotPlace(i, sideStyle(), tilesRoom())
// Puts an element in its slot; what the place leaves out (left, width, height outside Tiles) the stylesheet decides.
function put (el, { top, left, width, height }) {
  el.style.top = `${top}px`
  el.style.left = left === undefined ? '' : `${left}px`
  el.style.width = width === undefined ? '' : `${width}px`
  el.style.height = height === undefined ? '' : `${height}px`
}

export const pinsBox = $('#side .pins')
const pinnedBox = $('#side .pinned')
const pinnedLabel = $('#side .pinned-label')
const rowsBox = $('#side .rows')
export const sidePill = h('div', 'pill', '<div class="read"></div>')
const pinPill = h('div', 'pill')
const pinnedPill = h('div', 'pill')
rowsBox.append(sidePill)
pinsBox.append(pinPill)
pinnedBox.append(pinnedPill)
const quiet = h('div', 'quiet', `<span class="glyph-box">${icon('plus')}</span><span class="quiet-name">New tab</span><button class="clear" title="Close every tab that isn’t pinned into the archive">Clear</button>`)
const clear = $('.clear', quiet)
quiet.addEventListener('click', e => e.target === clear ? clearTabs() : newTab())
quiet.style.top = '0'
rowsBox.append(quiet)
export const folderEls = new Map()

function renderFolderRow (f, slot) {
  let el = folderEls.get(f.id)
  if (!el) {
    el = h('div', 'folder-row entering', `<span class="chevron">${icon('forward', 'small')}</span><span class="mark">${icon('folderFill')}</span><span class="name"></span><span class="count"></span>`)
    el.dataset.folder = f.id
    el.addEventListener('click', () => toggleFolder(f.id))
    el.addEventListener('dblclick', e => { e.preventDefault(); renameFolder(f.id) })
    el.addEventListener('contextmenu', e => { e.preventDefault(); folderMenu(f.id) })
    folderEls.set(f.id, el)
    rowsBox.insertBefore(el, quiet)
    arrive(el)
  }
  put(el, slotAt(slot))
  $('.chevron', el).classList.toggle('open', f.open)
  const count = tabs.filter(t => t.folder === f.id).length
  const key = JSON.stringify([f.name, f.open, count])
  if (el.dataset.key !== key && !$('input', el)) {
    el.dataset.key = key
    $('.name', el).textContent = f.name
    $('.count', el).textContent = count
    el.title = `${f.name} — ${count} ${count === 1 ? 'tab' : 'tabs'}`
  }
}

// From the rectangle a tab had in the other group to where it is now, on the settle spring.
function glideFrom (el, from) {
  const to = el.getBoundingClientRect()
  if (!to.width || !to.height || reduced.matches) return
  el.animate([
    { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, transformOrigin: 'top left' },
    { transform: 'none', transformOrigin: 'top left' }
  ], { duration: settle.ms, easing: settle.easing })
}

// Tiles heads the column with the page on screen: its mark and title, its address to type into, the navigation.
const now = $('#side .now')
const nowLink = $('.now-link', now)
const nowHost = $('.now-host', now)
// The address is typed straight into the bar, with the tab's own suggestions under it; no dialog over the page.
nowLink.addEventListener('click', () => { if (current() && !ui.tabEdit) startTabEdit(current(), 'address', 'now') })
nowLink.addEventListener('keydown', e => { if (e.target === nowLink && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nowLink.click() } })
function renderNow () {
  const t = current()
  now.hidden = sideStyle() !== 'tiles'
  if (now.hidden) return
  const key = JSON.stringify([t?.url, t && markHTML(t)])
  if (now.dataset.key !== key) { now.dataset.key = key; $('.now-mark', now).innerHTML = t ? markHTML(t) : '' }
  $('.now-title', now).textContent = t ? label(t) : ''
  const editing = !!t && ui.tabEdit?.at === 'now' && ui.tabEdit.id === t.id
  if (editing !== !!$('.tab-field', nowLink)) nowLink.replaceChildren(editing ? tabField(t) : nowHost)
  nowLink.classList.toggle('editing', editing)
  nowHost.textContent = bareHost(t?.url || '') || 'Enter an address'
}

export function renderSide () {
  const seen = new Set()
  renderNow()
  const essentials = tabs.filter(t => t.essential)
  const pinned = tabs.filter(t => t.pin && !t.essential)
  renderPins(essentials, seen)
  renderPinnedRows(pinned, seen)
  pinnedLabel.hidden = !pinned.length
  pinnedLabel.classList.toggle('after-tiles', essentials.length > 0)
  rowsBox.classList.toggle('after-tiles', essentials.length > 0 || pinned.length > 0)
  clear.hidden = !tabs.some(clearable)
  const slots = renderRows(tabs.filter(t => !t.pin), seen)
  for (const [id, el] of sideEls) if (!seen.has(id)) { leave(el); sideEls.delete(id) }
  sidePill.hidden = !current() || !!current().pin || slots.hidden.has(S.active)
  rowsBox.style.height = `${slotsHeight(slots.count, sideStyle())}px`
  paintReading()
}

// A tab's element in the sidebar as the given kind in the given box; one that was elsewhere glides over
// from where it was.
function sideElement (t, kind, box) {
  let el = sideEls.get(t.id)
  let from = null
  if (el && (!el.classList.contains(kind) || el.parentNode !== box)) { from = el.getBoundingClientRect(); el.remove(); el = null }
  if (!el) {
    el = h('div', from ? kind : `${kind} entering`)
    bindTab(el, t, kind === 'pin' ? 'grid' : 'y')
    sideEls.set(t.id, el)
    if (box === rowsBox) rowsBox.insertBefore(el, quiet)
    else box.append(el)
    arrive(el)
  }
  return { el, from }
}

export const tilesRoom = () => prefs['sidebar.width'] - 2 * SIDE_PAD
/** The Essentials' grid for this many tiles in the sidebar's style. */
export const essentialsGrid = count => gridFor(count, tilesRoom(), SIDE_STYLES[sideStyle()].tile, SIDE_STYLES[sideStyle()].across)

function renderPins (pinned, seen) {
  layout.grid = essentialsGrid(pinned.length)
  const { cols, w: cw, h: ch } = layout.grid
  pinned.forEach((t, i) => {
    seen.add(t.id)
    const { el, from } = sideElement(t, 'pin', pinsBox)
    const { x, y } = placeOf(i, layout.grid)
    const s = Math.min(cw, ch)
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px`, height: `${ch}px` })
    if (from) glideFrom(el, from)
    el.classList.toggle('live', t.id === S.active)
    el.classList.toggle('dim', !t.web)
    fill(el, t, 'pin', () => editedInPlace(t) ? '' : glyphHTML(t, Math.min(18, Math.round(s * 18 / 34))))
    if (t.id === S.active) Object.assign(pinPill.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px`, height: `${ch}px` })
  })
  const rowsOfPins = Math.ceil(pinned.length / cols)
  pinsBox.style.height = pinned.length ? `${rowsOfPins * (ch + 4) - 4}px` : '0'
  pinPill.hidden = !current()?.essential
}

// Each loose tab's row; a folder's header takes a row of its own, a closed folder hides its tabs.
function slotRows (loose) {
  let count = 0
  const headers = new Map()
  const place = new Map()
  const hidden = new Set()
  for (const t of loose) {
    const f = folderOf(t)
    if (f && !headers.has(f.id)) {
      headers.set(f.id, count)
      renderFolderRow(f, count++)
    }
    // A closed folder's tabs tuck in behind its header.
    if (f && !f.open) { hidden.add(t.id); place.set(t.id, headers.get(f.id)) } else place.set(t.id, count++)
  }
  for (const [id, el] of folderEls) if (!headers.has(id)) { leave(el); folderEls.delete(id) }
  return { count, place, hidden }
}

// A pinned row always shows its site's mark: pinned rows are told apart by it, as tiles are.
function fillRow (el, t, pinned) {
  el.classList.toggle('live', t.id === S.active)
  el.classList.toggle('paired', !!t.split && t.split === S.active)
  el.classList.toggle('in-split', !!t.split)
  // Classic leaves the site's mark to the setting; the other styles are built around it.
  el.classList.toggle('icons', pinned || prefs.glyph === 'icons' || blank(t) || sideStyle() !== 'classic')
  el.classList.toggle('busy', t.loading || t.audible || t.muted)
  el.classList.toggle('editing', editedInPlace(t))
  const side = t.split ? (paneOf(t)[0] === t ? 'Left' : 'Right') : ''
  fill(el, t, `row${side}`, () => `${side ? `<span class="pane">${icon(`pane${side}`)}</span>` : ''}${markHTML(t)}${shyHTML(t)}<span class="title"></span>${t.loading || t.audible || t.muted ? statusHTML(t) : ''}<button class="cross" data-act="close">${icon('x', 'small')}</button>`)
  // List sets the address under the title from this.
  const title = $('.title', el)
  if (title) title.dataset.host = bareHost(t.url || '') || ''
}

function renderPinnedRows (pinned, seen) {
  pinned.forEach((t, i) => {
    seen.add(t.id)
    const { el, from } = sideElement(t, 'row', pinnedBox)
    put(el, pinPlace(i, sideStyle(), tilesRoom()))
    if (from) glideFrom(el, from)
    fillRow(el, t, true)
    el.classList.toggle('dim', !t.web)
    if (t.id === S.active) pinnedPill.style.top = `${i * step()}px`
  })
  pinnedBox.style.height = `${pinsHeight(pinned.length, sideStyle(), tilesRoom())}px`
  // Tiles' launcher lights the live pin's own square instead of sliding a pill under it.
  pinnedPill.hidden = !current()?.pin || !!current().essential || sideStyle() === 'tiles'
}

function renderRows (loose, seen) {
  const slots = slotRows(loose)
  const related = relations()
  for (const t of loose) {
    const i = slots.place.get(t.id)
    seen.add(t.id)
    const { el, from } = sideElement(t, 'row', rowsBox)
    put(el, slotAt(i))
    el.classList.toggle('folded-away', slots.hidden.has(t.id))
    el.classList.toggle('in-folder', !!t.folder)
    el.classList.toggle('related', related.has(t.id))
    if (from) glideFrom(el, from)
    fillRow(el, t, false)
    if (t.id === S.active) put(sidePill, slotAt(i))
  }
  paintSplitGrounds(rowsBox, splitPlaces(loose, slots))
  return slots
}

// Each split whose two tabs stand next to each other, one under the other or (Tiles) side by side in a row: the
// ground covers both; each tab's own glyph says its side.
function splitPlaces (loose, slots) {
  const places = new Map()
  for (const t of loose) {
    const other = partnerOf(t)
    const i = slots.place.get(t.id)
    if (!other || slots.place.get(other.id) !== i + 1 || slots.hidden.has(t.id) || slots.hidden.has(other.id)) continue
    const [a, b] = [slotAt(i), slotAt(i + 1)]
    if (sideStyle() !== 'tiles') places.set(String(t.id), { ground: { left: '0', right: '0', width: '', top: `${a.top}px`, height: `${2 * step() - 2}px` } })
    else if (a.top === b.top) places.set(String(t.id), { ground: { left: `${a.left}px`, right: 'auto', top: `${a.top}px`, width: `${b.left + b.width - a.left}px`, height: `${a.height}px` } })
  }
  return places
}

// The resize edge: 176–440 px, a double-click puts it back to 232. The edge follows the pointer once a
// frame; the page keeps the size it has at the narrowest width until release, so it is laid out once
// instead of every frame and never lags behind the column.
{
  const NARROWEST = 176
  const edge = $('#side .edge')
  let startX = 0
  let startW = 0
  let pointerX = 0
  let frame = 0
  const follow = () => {
    frame = 0
    prefs['sidebar.width'] = Math.round(Math.min(440, Math.max(NARROWEST, startW + pointerX - startX)))
    stage.style.setProperty('--held', `${prefs['sidebar.width'] - NARROWEST}px`)
    render()
  }
  const release = () => {
    if (!edge.classList.contains('held')) return
    cancelAnimationFrame(frame)
    frame = 0
    edge.classList.remove('held')
    stage.classList.remove('holding')
    L.holdPage?.(null)
    layout.resizing = false
    setPref('sidebar.width', prefs['sidebar.width'])
  }
  edge.addEventListener('pointerdown', e => {
    edge.setPointerCapture(e.pointerId)
    edge.classList.add('held')
    layout.resizing = true
    startX = pointerX = e.clientX
    startW = prefs['sidebar.width']
    stage.style.setProperty('--held', `${startW - NARROWEST}px`)
    stage.classList.add('holding')
    L.holdPage?.(NARROWEST)
  })
  edge.addEventListener('pointermove', e => {
    if (!edge.classList.contains('held')) return
    pointerX = e.clientX
    if (!frame) frame = requestAnimationFrame(follow)
  })
  edge.addEventListener('pointerup', release)
  edge.addEventListener('lostpointercapture', release)
  edge.addEventListener('dblclick', () => { animate(); setPref('sidebar.width', 232); render() })
}
