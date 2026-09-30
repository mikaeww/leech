// The pointer on a tab: click, middle-click, drag to reorder; links dropped on the tabs.
import { elementFor } from '../chrome/marks.js'
import { animate } from '../chrome/render.js'
import { side, strip } from '../elements.js'
import { settle } from '../look/motion.js'
import { destination } from '../page/omnibox.js'
import { L, layout, S, sideMode, tabs, ui } from '../state.js'
import { startTabEdit, tabMenu } from './edit.js'
import { sameGroup } from './groups/folders.js'
import { save } from './session.js'
import { closeTab, move, open, select, toggleMute } from './tabs.js'

let drag = null
let suppressClick = false

function startDrag (e, t, el, axis) {
  if (e.button !== 0 || ui.tabEdit) return
  drag = { t, el, axis, x0: e.clientX, y0: e.clientY, from: tabs.indexOf(t), moved: false }
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
  const { stepX, stepY, cols } = dragSteps(drag.t)
  let delta
  if (drag.axis === 'grid') delta = Math.round(dy / stepY) * cols + Math.round(dx / stepX)
  else delta = Math.round((drag.axis === 'x' ? dx : dy) / (drag.axis === 'x' ? stepX : stepY))
  move(drag.t, drag.from + delta)
  // The held tab stays under the pointer while its slot moves beneath it.
  const shift = tabs.indexOf(drag.t) - drag.from
  let ox = 0
  let oy = 0
  if (drag.axis === 'grid') { ox = dx - (shift % cols) * stepX; oy = dy - Math.floor(shift / cols) * stepY } else if (drag.axis === 'x') ox = dx - shift * stepX
  else oy = dy - shift * stepY
  const el = elementFor(drag.t)
  if (el) {
    // Held between the first and the last slot of its group: past either end it would be cut off.
    if (drag.axis !== 'grid') {
      const group = tabs.filter(x => sameGroup(x, drag.t))
      const at = group.indexOf(drag.t)
      const step = drag.axis === 'x' ? stepX : stepY
      const held = v => Math.max(-at * step, Math.min(v, (group.length - 1 - at) * step))
      if (drag.axis === 'x') ox = held(ox)
      else oy = held(oy)
    }
    el.classList.add('carried')
    el.style.transform = `translate(${ox}px, ${oy}px)`
  }
})

window.addEventListener('pointerup', () => {
  if (!drag) return
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
