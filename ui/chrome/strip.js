// The strip: tabs across the top, a chip before each folder's tabs, the sliding pill, the plus.
import { $, h, run, strip } from '../elements.js'
import { icon } from '../look/icons.js'
import { blank, current, layout, prefs, S, sideMode, tab, tabs, ui } from '../state.js'
import { folderMenu, toggleFolder } from '../tabs/groups/folders.js'
import { bindTab } from '../tabs/pointer.js'
import { newTab } from '../tabs/tabs.js'
import { arrive, elementFor, fill, glyphHTML, leave, markHTML, shyHTML, slotHTML, stripEls } from './marks.js'
import { sidePill } from './sidebar.js'

const TAB_WIDTH = 186
const TAB_MIN = 36
const TITLED = 80
const GAP = 2
const PIN_WIDTH = 30
const PLUS_WIDTH = 30
const SPLIT = 8

const stripPill = h('div', 'pill', '<div class="read"></div>')
run.append(stripPill)

const plus = h('button', 'plus', icon('plus', 'alone'))
plus.title = 'New Tab  Ctrl+T'
plus.addEventListener('click', newTab)
run.append(plus)

export const folderChips = new Map()

function chipFor (f) {
  let el = folderChips.get(f.id)
  if (!el) {
    el = h('button', 'folder-chip entering', `${icon('folderFill', 'small')}<span class="name"></span><span class="count"></span>`)
    el.dataset.folder = f.id
    el.addEventListener('click', () => toggleFolder(f.id))
    el.addEventListener('contextmenu', e => { e.preventDefault(); folderMenu(f.id) })
    folderChips.set(f.id, el)
    run.insertBefore(el, plus)
    arrive(el)
  }
  const count = tabs.filter(t => t.folder === f.id).length
  const key = JSON.stringify([f.name, f.open, count])
  if (el.dataset.key !== key && !$('input', el)) {
    el.dataset.key = key
    $('.name', el).textContent = f.name
    // A folded chip says how many tabs it holds; an open one shows them.
    $('.count', el).textContent = f.open ? '' : String(count)
    el.title = `${f.name} — ${count} ${count === 1 ? 'tab' : 'tabs'}`
    el.classList.toggle('open', f.open)
  }
  return el
}

// Each folder's chip, measured once per render; the tabs of a folded folder take no room.
function chipsOf () {
  const chips = new Map()
  for (const f of S.folders) if (tabs.some(t => t.folder === f.id && !t.pin)) chips.set(f.id, chipFor(f))
  for (const [id, el] of folderChips) if (!chips.has(id)) { leave(el); folderChips.delete(id) }
  let room = 0
  for (const el of chips.values()) room += el.offsetWidth + GAP
  return { chips, room }
}

export function renderStrip () {
  const width = strip.clientWidth
  const folders = chipsOf()
  const folded = t => t.folder && !S.folders.find(f => f.id === t.folder)?.open
  const dot = $('#strip .space-dot')
  const far = $('#strip .helm').offsetWidth + 8 + GAP + $('#strip .doors').offsetWidth
  const dotWidth = dot && !dot.hidden ? dot.offsetWidth + GAP : 0
  const lead = 12 + $('#strip .lead').offsetWidth + GAP
  const room = Math.max(0, width - lead - dotWidth - 12 - PLUS_WIDTH - far - 3 * GAP)
  const pinned = tabs.filter(t => t.pin).length
  const loose = tabs.filter(t => !t.pin && !folded(t)).length
  const split = pinned && tabs.length > pinned ? SPLIT : 0
  layout.looseWidth = loose === 0 ? TAB_WIDTH
    : Math.min(TAB_WIDTH, Math.max(TAB_MIN, (room - split - folders.room - pinned * PIN_WIDTH - Math.max(0, pinned + loose - 1) * GAP) / loose))
  const editWidth = Math.min(340, width - 60)
  let x = 0
  const seen = new Set()
  const placed = new Set()
  for (const t of tabs) {
    seen.add(t.id)
    // Pinned tabs and the rest are two groups, told apart by the space between them.
    if (!t.pin && split && x === pinned * (PIN_WIDTH + GAP)) x += split
    const chip = t.folder && folders.chips.get(t.folder)
    if (chip && !placed.has(t.folder)) {
      placed.add(t.folder)
      chip.style.left = `${x}px`
      x += chip.offsetWidth + GAP
    }
    const editing = ui.tabEdit?.id === t.id && ui.tabEdit.kind !== 'pin'
    const w = t.pin ? PIN_WIDTH : editing ? Math.max(layout.looseWidth, editWidth) : layout.looseWidth
    // A folded folder's tabs tuck in behind its chip.
    const hidden = folded(t)
    const el = stripElement(t)
    el.classList.toggle('folded-away', !!hidden)
    paintTab(el, t, { x: hidden ? x - GAP - w : x, w, editing })
    if (hidden) continue
    if (t.id === S.active) {
      stripPill.style.left = `${x}px`
      stripPill.style.width = `${w}px`
    }
    x += w + GAP
  }
  for (const [id, el] of stripEls) if (!seen.has(id)) { leave(el); stripEls.delete(id) }
  stripPill.hidden = !tab(S.active) || !!folded(tab(S.active))
  plus.style.left = `${x}px`
  const content = x + PLUS_WIDTH
  // The run keeps its room; shrinking it with the tabs clipped them while they slid.
  run.style.width = `${room + PLUS_WIDTH + GAP}px`
  run.classList.toggle('overflowing', content > room + PLUS_WIDTH + GAP + 0.5)
  paintReading()
}

function stripElement (t) {
  let el = stripEls.get(t.id)
  if (!el) {
    el = h('div', 'tab entering')
    bindTab(el, t, 'x')
    stripEls.set(t.id, el)
    run.insertBefore(el, plus)
    arrive(el)
  }
  return el
}

function paintTab (el, t, { x, w, editing }) {
  el.classList.toggle('live', t.id === S.active)
  el.classList.toggle('pinned', !!t.pin)
  el.classList.toggle('compact', !t.pin && !editing && w < TITLED)
  el.classList.toggle('icons', prefs.glyph === 'icons' || blank(t))
  el.classList.toggle('loading', t.loading)
  el.classList.toggle('asleep', !t.web)
  el.classList.toggle('editing', editing)
  el.style.left = `${x}px`
  el.style.width = `${w}px`
  if (t.pin) fill(el, t, 'pin', () => ui.tabEdit?.id === t.id ? '' : glyphHTML(t))
  else fill(el, t, 'titled', () => `${markHTML(t)}${shyHTML(t)}<span class="title"></span>${slotHTML(t)}`)
}

export function revealActive () {
  const el = elementFor(current() || {})
  if (!el) return
  if (sideMode()) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  else if (run.scrollWidth > run.clientWidth) run.scrollTo({ left: el.offsetLeft - run.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' })
}

run.addEventListener('wheel', e => {
  if (run.scrollWidth <= run.clientWidth) return
  run.scrollLeft += e.deltaY + e.deltaX
  e.preventDefault()
}, { passive: false })

export function paintReading () {
  const t = current()
  const show = prefs['tabs.reading'] && t && !t.pin && !blank(t)
  for (const pill of [stripPill, sidePill]) {
    const compact = pill === stripPill && layout.looseWidth < TITLED
    pill.firstChild.style.width = show && !compact ? `${t.reading * 100}%` : '0'
  }
}
