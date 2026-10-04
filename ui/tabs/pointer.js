// The pointer on a tab: click, middle-click, drag to reorder; links dropped on the tabs.
import { elementFor } from '../chrome/marks.js'
import { animate } from '../chrome/render.js'
import { pinsBox, tilesRoom } from '../chrome/sidebar.js'
import { side, strip } from '../elements.js'
import { settle } from '../look/motion.js'
import { destination } from '../page/omnibox.js'
import { L, layout, S, sideMode, tabs, ui } from '../state.js'
import { startTabEdit, tabMenu } from './edit.js'
import { addEssential, canBeEssential } from './groups/essentials.js'
import { putInFolder, sameGroup } from './groups/folders.js'
import { gridFor, heldOffset, placeOf, tileUnder } from './groups/tiles.js'
import { save } from './session.js'
import { closeTab, move, open, select, toggleMute } from './tabs.js'

let drag = null
let suppressClick = false

function startDrag (e, t, el, axis) {
  if (e.button !== 0 || ui.tabEdit) return
  drag = { t, el, axis, x0: e.clientX, y0: e.clientY, from: tabs.indexOf(t), moved: false }
}

// The folder header or chip under the pointer, for a loose tab carried onto it.
function folderUnder (e) {
  if (!drag?.moved || drag.t.pin) return null
  const el = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.dataset?.folder)
  return el && el.dataset.folder !== drag.t.folder ? el : null
}

// The Essentials' tiles, for a tab carried up onto them in the sidebar; with none yet, the first rows' top edge.
function tilesUnder (e) {
  if (!drag?.moved || !canBeEssential(drag.t) || !sideMode()) return null
  const tiles = pinsBox.getBoundingClientRect()
  const column = side.getBoundingClientRect()
  const over = e.clientX >= column.left && e.clientX <= column.right && e.clientY <= Math.max(tiles.bottom, tiles.top + 12)
  return over ? pinsBox : null
}

const landingUnder = e => folderUnder(e) || tilesUnder(e)

function markLanding (el) {
  if (drag.landing === el) return
  drag.landing?.classList.remove('landing')
  drag.landing = el
  el?.classList.add('landing')
  // The free tile the tab will take, drawn over whatever is below so nothing moves while it is held.
  if (el === pinsBox) {
    const count = tabs.filter(t => t.essential).length
    const grid = gridFor(count + 1, tilesRoom())
    const { x, y } = placeOf(count, grid)
    for (const [name, v] of Object.entries({ x, y, w: grid.w, h: grid.h })) pinsBox.style.setProperty(`--free-${name}`, `${v}px`)
  }
}

// In the grid the tile under the pointer is the target; the held tile stays under the pointer.
function carryInGrid (dx, dy) {
  const { stepX, stepY, cols } = dragSteps(drag.t)
  const group = tabs.filter(x => x.essential)
  const base = tabs.indexOf(group[0])
  const from = drag.from - base
  move(drag.t, base + tileUnder({ from, count: group.length, cols, dx, dy, stepX, stepY }))
  return heldOffset({ from, to: tabs.indexOf(drag.t) - base, cols, dx, dy, stepX, stepY })
}

// In a row or column, held between the first and the last slot of its group: past either end it would be cut off.
function carryInLine (dx, dy) {
  const { stepX, stepY } = dragSteps(drag.t)
  const horizontal = drag.axis === 'x'
  const step = horizontal ? stepX : stepY
  const d = horizontal ? dx : dy
  move(drag.t, drag.from + Math.round(d / step))
  const group = tabs.filter(x => sameGroup(x, drag.t))
  const at = group.indexOf(drag.t)
  const held = Math.max(-at * step, Math.min(d - (tabs.indexOf(drag.t) - drag.from) * step, (group.length - 1 - at) * step))
  return horizontal ? { x: held, y: 0 } : { x: 0, y: held }
}

window.addEventListener('pointermove', e => {
  if (!drag) return
  const dx = e.clientX - drag.x0
  const dy = e.clientY - drag.y0
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < 5) return
    drag.moved = true
    drag.el.classList.add('carried')
  }
  const { x, y } = drag.axis === 'grid' ? carryInGrid(dx, dy) : carryInLine(dx, dy)
  const el = elementFor(drag.t)
  if (el) {
    el.classList.add('carried')
    el.style.transform = `translate(${x}px, ${y}px)`
  }
  markLanding(landingUnder(e))
})

window.addEventListener('pointerup', e => {
  if (!drag) return
  const into = landingUnder(e)
  markLanding(null)
  const el = elementFor(drag.t)
  if (drag.moved) {
    suppressClick = true
    setTimeout(() => { suppressClick = false }, 0)
    animate()
    if (el) {
      el.classList.remove('carried')
      el.classList.add('settling')
      el.style.transform = ''
      setTimeout(() => el.classList.remove('settling'), settle.ms)
    }
    if (into === pinsBox) addEssential(drag.t)
    else if (into) putInFolder(drag.t, into.dataset.folder)
    save()
  }
  drag = null
})

function dragSteps (t) {
  if (!sideMode()) return { stepX: (t.pin ? 30 : layout.looseWidth) + 2, stepY: 1, cols: 1 }
  if (t.essential) return { stepX: layout.grid.w + 4, stepY: layout.grid.h + 4, cols: layout.grid.cols }
  return { stepX: 1, stepY: 30, cols: 1 }
}

export function bindTab (el, t, axis) {
  el.addEventListener('pointerdown', e => startDrag(e, t, el, axis))
  el.addEventListener('click', e => {
    if (suppressClick) return
    const act = e.target.closest('[data-act]')?.dataset.act
    if (act === 'close') return closeTab(t.id)
    if (act === 'mute') return toggleMute(t)
    if (e.target.closest('.tab-field')) return
    if (S.active !== t.id) return select(t.id)
    if (t.pin) return
    startTabEdit(t, 'address')
  })
  el.addEventListener('dblclick', () => { if (t.pin && S.active === t.id) startTabEdit(t, 'pin') })
  el.addEventListener('auxclick', e => { if (e.button === 1) closeTab(t.id) })
  el.addEventListener('contextmenu', e => { e.preventDefault(); tabMenu(t) })
  el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault() })
}

// ---- dropping a link or words on the tabs opens them ----

for (const target of [strip, side]) {
  target.addEventListener('dragover', e => { e.preventDefault(); target.classList.add('landing') })
  target.addEventListener('dragleave', () => target.classList.remove('landing'))
  target.addEventListener('drop', e => {
    e.preventDefault()
    target.classList.remove('landing')
    const text = (e.dataTransfer.getData('text/uri-list').split('\n').find(l => l && !l.startsWith('#')) || e.dataTransfer.getData('text/plain')).trim()
    const url = e.dataTransfer.files[0] ? `file://${L.pathOf?.(e.dataTransfer.files[0]) || ''}` : destination(text)
    if (url && url !== 'file://') open(url, true)
  })
}
