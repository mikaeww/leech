// Drawing the window: which of strip and sidebar shows, where the page card sits, folding.
import { $, app, side, stage, strip } from '../elements.js'
import { glide, settle } from '../look/motion.js'
import { renderOmni } from '../page/omnibox.js'
import { peekView } from '../page/peek.js'
import { accounts, accountsTab } from '../page/signins.js'
import { blank, current, L, label, layout, prefs, setPref, sideMode, stowed, tabs, ui } from '../state.js'
import { paneOf } from '../tabs/groups/split.js'
import { renderDots } from '../tabs/spaces.js'
import { reload } from '../tabs/tabs.js'
import { renderBar } from './bookmarks.js'
import { renderHelm } from './doors.js'
import { renderMedia } from './media.js'
import { sideEls, stripEls } from './marks.js'
import { panels } from './panels.js'
import { renderSide } from './sidebar.js'
import { renderStrip, revealActive } from './strip.js'

let animateTimer = null
/** The next render moves things with transitions instead of jumping. */
export function animate () {
  app.classList.add('animate')
  clearTimeout(animateTimer)
  animateTimer = setTimeout(() => app.classList.remove('animate'), Math.max(glide.ms, settle.ms) + 50)
}

// ---- rendering: the page and the frame ----

let stageInset = null
let barShown = false

// The failed page's one button loads the address again (reload goes back to the address after a failure).
$('#failure .retry').addEventListener('click', () => reload())

// Electron places a split's two webviews itself; the Chromium build shows a split on its own once the active
// tab is in one, so there only the active view is ever unhidden.
function showPages (t) {
  const pair = L.native ? null : paneOf(t)
  for (const x of tabs) {
    if (!x.web) continue
    x.web.classList.toggle('hidden', !(pair ? pair.includes(x) : x === t) || !!x.failure)
    x.web.classList.toggle('pane-a', pair?.[0] === x)
    x.web.classList.toggle('pane-b', pair?.[1] === x)
  }
  stage.classList.toggle('split', !!pair)
  if (pair) stage.style.setProperty('--ratio', String(pair[0].ratio ?? 0.5))
}

// The divider between two panes (Electron): dragged once a frame, a fifth of the stage at least either side.
{
  const edge = stage.appendChild(document.createElement('div'))
  edge.className = 'split-edge'
  let frame = 0
  let x = 0
  const follow = () => {
    frame = 0
    const pair = paneOf(current())
    const r = stage.getBoundingClientRect()
    if (!pair || !r.width) return
    pair[0].ratio = Math.min(0.8, Math.max(0.2, (x - r.left) / r.width))
    stage.style.setProperty('--ratio', String(pair[0].ratio))
  }
  edge.addEventListener('pointerdown', e => { edge.setPointerCapture(e.pointerId); edge.classList.add('held'); stage.classList.add('dragging') })
  edge.addEventListener('pointermove', e => {
    if (!edge.classList.contains('held')) return
    x = e.clientX
    if (!frame) frame = requestAnimationFrame(follow)
  })
  edge.addEventListener('lostpointercapture', () => { edge.classList.remove('held'); stage.classList.remove('dragging') })
}

function renderStage () {
  const t = current()
  showPages(t)
  const failure = $('#failure')
  failure.hidden = !t?.failure
  if (t?.failure) $('.message', failure).textContent = t.failure

  const sideOn = sideMode() && !stowed() && !ui.immersed
  const stripOn = !sideMode() && !stowed() && !ui.immersed
  // The page is a card inside the chrome: 8 of frame on every side the chrome doesn't already cover.
  const gap = stowed() || ui.immersed ? 0 : 8
  const inset = { left: sideOn ? prefs['sidebar.width'] : gap, top: (stripOn ? 52 : gap) + (barShown ? 30 : 0), right: gap, bottom: gap }
  stage.style.right = `${inset.right}px`
  stage.style.bottom = `${inset.bottom}px`
  const was = stageInset
  stageInset = inset
  if (was && was.left === inset.left && was.top === inset.top) return app.style.setProperty('--left', `${inset.left}px`)
  // The page takes its new size once and slides there from where it was, so it isn't relaid out every frame.
  stage.style.transition = 'none'
  stage.style.left = `${inset.left}px`
  stage.style.top = `${inset.top}px`
  const dx = was ? was.left - inset.left : 0
  const dy = was ? was.top - inset.top : 0
  if ((dx || dy) && !layout.resizing) {
    stage.style.transform = `translate(${dx}px, ${dy}px)`
    void stage.offsetWidth
    stage.style.transition = `transform ${glide.ms}ms ${L.slideEasing || glide.easing}`
    stage.style.transform = ''
    L.slide?.(stage, dx, dy, glide.ms)
  }
  app.style.setProperty('--left', `${inset.left}px`)
}

export function render () {
  if (wasSide !== null && wasSide !== sideMode()) {
    stripEls.forEach(el => el.remove()); stripEls.clear()
    sideEls.forEach(el => el.remove()); sideEls.clear()
  }
  wasSide = sideMode()
  app.classList.toggle('side', sideMode())
  app.classList.toggle('folded', stowed())
  app.classList.toggle('peeking', ui.peeking)
  app.classList.toggle('immersed', ui.immersed)
  app.style.setProperty('--side', `${prefs['sidebar.width']}px`)
  if (sideMode()) renderSide()
  else renderStrip()
  renderMedia()
  renderHelm()
  barShown = renderBar()
  renderDots()
  renderStage()
  renderOmni()
  if (panels.kind || ui.editing || current()?.id !== accountsTab) accounts.hidden = true
  document.title = current() ? label(current()) : 'Leech'
  L.escapable(!!(peekView || panels.kind || ui.veiling || ui.tabEdit || ui.finding || (ui.editing && !blank(current())) || current()?.loading), ui.veiling)
}

new ResizeObserver(() => { if (!sideMode()) renderStrip() }).observe(strip)

// ---- fold: Ctrl+S puts the column away; the pointer at the edge brings it back ----

let peekTimer = null
$('#fold-edge').addEventListener('mouseenter', () => {
  clearTimeout(peekTimer)
  peekTimer = setTimeout(() => { ui.peeking = true; render() }, sideMode() ? 0 : 150)
})
function retract () {
  clearTimeout(peekTimer)
  peekTimer = setTimeout(() => { if (!ui.tabEdit) { ui.peeking = false; render() } }, 300)
}
$('#fold-edge').addEventListener('mouseleave', retract)
for (const column of [side, strip]) {
  column.addEventListener('mouseenter', () => clearTimeout(peekTimer))
  column.addEventListener('mouseleave', () => { if (ui.peeking) retract() })
}

export function fold () {
  ui.folded = !ui.folded
  ui.peeking = false
  render()
}

let wasSide = null
window.addEventListener('resize', () => { if (sideMode() !== wasSide) render() })

export function toggleSidebar () {
  setPref('sidebar', !prefs.sidebar)
  ui.folded = false
  ui.peeking = false
  ui.tabEdit = null
  stripEls.forEach(el => el.remove()); stripEls.clear()
  sideEls.forEach(el => el.remove()); sideEls.clear()
  render()
  revealActive()
}
