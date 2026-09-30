// The sidebar: the essentials' tiles, the space's pinned rows, a line, its tabs and folders, the resize edge.
import { $, h, stage } from '../elements.js'
import { icon } from '../look/icons.js'
import { reduced, settle } from '../look/motion.js'
import { blank, current, L, layout, prefs, S, setPref, tabs, ui } from '../state.js'
import { folderMenu, folderOf, renameFolder, toggleFolder } from '../tabs/groups/folders.js'
import { bindTab } from '../tabs/pointer.js'
import { newTab } from '../tabs/tabs.js'
import { arrive, fill, glyphHTML, leave, markHTML, shyHTML, sideEls, statusHTML } from './marks.js'
import { animate, render } from './render.js'
import { paintReading } from './strip.js'

// The column's inner padding, --s5 in styles/chrome.css.
const SIDE_PAD = 12
// A row is --tab-h with 2 between; "New tab" takes the first one, the tabs start under it.
const ROW = 30
const FIRST = 1

const pinsBox = $('#side .pins')
const pinnedBox = $('#side .pinned')
const divider = $('#side .divider')
const rowsBox = $('#side .rows')
export const sidePill = h('div', 'pill', '<div class="read"></div>')
const pinPill = h('div', 'pill')
const pinnedPill = h('div', 'pill')
rowsBox.append(sidePill)
pinsBox.append(pinPill)
pinnedBox.append(pinnedPill)
const quiet = h('div', 'quiet', `<span class="glyph-box">${icon('plus')}</span><span>New tab</span>`)
quiet.addEventListener('click', newTab)
quiet.style.top = '0'
rowsBox.append(quiet)
export const folderEls = new Map()

function renderFolderRow (f, slot) {
  let el = folderEls.get(f.id)
  if (!el) {
    el = h('div', 'folder-row entering', `<span class="chevron">${icon('forward', 'small')}</span><span class="mark">${icon('folderFill')}</span><span class="name"></span>`)
    el.dataset.folder = f.id
    el.addEventListener('click', () => toggleFolder(f.id))
    el.addEventListener('dblclick', e => { e.preventDefault(); renameFolder(f.id) })
    el.addEventListener('contextmenu', e => { e.preventDefault(); folderMenu(f.id) })
    folderEls.set(f.id, el)
    rowsBox.insertBefore(el, quiet)
    arrive(el)
  }
  el.style.top = `${(slot + FIRST) * ROW}px`
  $('.chevron', el).classList.toggle('open', f.open)
  const count = tabs.filter(t => t.folder === f.id).length
  const key = JSON.stringify([f.name, f.open, count])
  if (el.dataset.key !== key && !$('input', el)) {
    el.dataset.key = key
    $('.name', el).textContent = f.name
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

export function renderSide () {
  const seen = new Set()
  const essentials = tabs.filter(t => t.essential)
  const pinned = tabs.filter(t => t.pin && !t.essential)
  renderPins(essentials, seen)
  renderPinnedRows(pinned, seen)
  pinnedBox.classList.toggle('after-tiles', essentials.length > 0 && pinned.length > 0)
  divider.hidden = !essentials.length && !pinned.length
  const slots = renderRows(tabs.filter(t => !t.pin), seen)
  for (const [id, el] of sideEls) if (!seen.has(id)) { leave(el); sideEls.delete(id) }
  sidePill.hidden = !current() || !!current().pin || slots.hidden.has(S.active)
  sidePill.style.left = '0'
  sidePill.style.right = '0'
  sidePill.style.width = 'auto'
  rowsBox.style.height = `${(slots.count + FIRST) * ROW - 2}px`
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

function renderPins (pinned, seen) {
  const cols = Math.max(3, Math.floor((pinned.length + 1) / 2))
  const cw = Math.max(20, (prefs['sidebar.width'] - 2 * SIDE_PAD - (cols - 1) * 4) / cols)
  const ch = Math.min(34, cw)
  layout.grid = { cols, w: cw, h: ch }
  pinned.forEach((t, i) => {
    seen.add(t.id)
    const { el, from } = sideElement(t, 'pin', pinsBox)
    const x = (i % cols) * (cw + 4)
    const y = Math.floor(i / cols) * (ch + 4)
    const s = Math.min(cw, ch)
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px`, height: `${ch}px` })
    if (from) glideFrom(el, from)
    el.classList.toggle('live', t.id === S.active)
    el.classList.toggle('dim', !t.web)
    fill(el, t, 'pin', () => ui.tabEdit?.id === t.id ? '' : glyphHTML(t, Math.round(s * 18 / 34)))
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
  el.classList.toggle('icons', pinned || prefs.glyph === 'icons' || blank(t))
  el.classList.toggle('busy', t.loading || t.audible || t.muted)
  el.classList.toggle('editing', ui.tabEdit?.id === t.id)
  fill(el, t, 'row', () => `${markHTML(t)}${shyHTML(t)}<span class="title"></span>${t.loading || t.audible || t.muted ? statusHTML(t) : ''}<button class="cross" data-act="close">${icon('x', 'small')}</button>`)
}

function renderPinnedRows (pinned, seen) {
  pinned.forEach((t, i) => {
    seen.add(t.id)
    const { el, from } = sideElement(t, 'row', pinnedBox)
    el.style.top = `${i * ROW}px`
    if (from) glideFrom(el, from)
    fillRow(el, t, true)
    el.classList.toggle('dim', !t.web)
    if (t.id === S.active) pinnedPill.style.top = `${i * ROW}px`
  })
  pinnedBox.style.height = pinned.length ? `${pinned.length * ROW - 2}px` : '0'
  pinnedPill.hidden = !current()?.pin || !!current().essential
}

function renderRows (loose, seen) {
  const slots = slotRows(loose)
  for (const t of loose) {
    const i = slots.place.get(t.id)
    seen.add(t.id)
    const { el, from } = sideElement(t, 'row', rowsBox)
    el.style.top = `${(i + FIRST) * ROW}px`
    el.classList.toggle('folded-away', slots.hidden.has(t.id))
    el.classList.toggle('in-folder', !!t.folder)
    if (from) glideFrom(el, from)
    fillRow(el, t, false)
    if (t.id === S.active) sidePill.style.top = `${(i + FIRST) * ROW}px`
  }
  return slots
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
