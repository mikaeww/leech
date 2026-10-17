// The island (ADR 0017): a black notch hanging from the page's top edge, moving as Coucou's does (spring.js).
// Hidden it is a sliver with no height; for a moment it grows small to show what just happened (activity.js);
// open it holds a header of views, as Coucou's, and the view chosen: Shield, Page, Sound, Tabs.
import { app, h, stage } from '../elements.js'
import { icon } from '../look/icons.js'
import { reduced } from '../look/motion.js'
import { current, ghosts, L, label, prefs, S, tabs, ui } from '../state.js'
import { focusPage } from '../tabs/views.js'
import { activityOf, finishedSince, MOMENT_MS } from './activity.js'
import { pageView } from './page.js'
import { shieldView } from './shield.js'
import { soundView } from './sound.js'
import { Tracked } from './spring.js'
import { tabsView } from './tabs.js'
import { glanceHTML, headStatus } from './words.js'

const VIEWS = [shieldView, pageView, soundView, tabsView]
// Coucou's notch at rest is 184 wide; the island grows out of it and goes back into it.
const NOTCH_W = 184
const ORDER = { hidden: 0, glance: 1, open: 2 }

const island = h('div', 'island ink-dark')
island.id = 'island'
island.setAttribute('role', 'region')
island.setAttribute('aria-label', 'Island')
const clip = h('div', 'island-clip')
const glance = h('button', 'island-layer island-glance')
glance.setAttribute('aria-expanded', 'false')
const opened = h('div', 'island-layer island-open')
const head = h('div', 'island-head')
const doors = h('div', 'island-doors')
const status = h('span', 'island-status')
const shown = h('div', 'island-shown')
head.append(doors, status)
opened.append(head, shown)
const said = h('div', 'island-said')
said.setAttribute('aria-live', 'polite')
clip.append(glance, opened)
island.append(clip, said)
stage.append(island)
// The frame just above the page's top middle: pointing there opens the island.
const reach = h('div', 'island-reach')
app.append(reach)

const width = new Tracked(NOTCH_W)
const height = new Tracked(0)
const radius = new Tracked(0)
let state = 'hidden'
let by = null
let view = 'shield'
let playing = null
let downloaded = null
let finished = null
let seen = null
let downloads = { count: 0, fraction: null }
let drawn = ''
let closing = null
let wake = null

// ---- what happened ----

/** The guard kept the page in `t` from leaving for `host` (ADR 0016): counted per page, shown for a moment. */
export function stoppedOn (t, host) {
  t.stopped = { kind: 'stopped', host, count: (t.stopped?.count || 0) + 1, at: Date.now() }
  if (t.id === S.active) said.textContent = `Stopped a redirect to ${host}`
  momentary()
}

/** `t` began to play: its title shows for a moment. */
export function started (t) {
  playing = { kind: 'playing', title: label(t), at: Date.now() }
  momentary()
}

L.onDownloadProgress((count, fraction) => {
  downloads = { count, fraction: fraction ?? null }
  renderIsland()
})
function downloadsListed (list) {
  const next = finishedSince(seen, list || [])
  seen = next.seen
  const last = next.finished.at(-1)
  if (!last) return
  finished = { name: last.name, path: last.path }
  downloaded = { kind: 'downloaded', name: last.name, at: Date.now() }
  said.textContent = `Downloaded ${last.name}`
  momentary()
}
L.downloads().then(downloadsListed)
L.onDownloads(downloadsListed)

// A moment ends by itself: the island is drawn once more when it is over.
function momentary () {
  clearTimeout(wake)
  wake = setTimeout(renderIsland, MOMENT_MS + 50)
  renderIsland()
}

// ---- open and close ----

export const islandOpen = () => state === 'open'

/** Opens the island; `how` is 'pointer' (it closes when the pointer leaves) or 'keys' (focus goes into it). */
export function openIsland (how) {
  if (!prefs.island) return
  clearTimeout(closing)
  if (by === 'keys' && how === 'pointer') return
  if (!by) view = viewFor(nowShowing()) || view
  by = how
  renderIsland()
  if (how === 'keys') doors.querySelector('[aria-pressed=true]')?.focus()
}

export function closeIsland () {
  if (!by) return
  const keys = by === 'keys'
  by = null
  renderIsland()
  if (keys) focusPage()
}

export const toggleIsland = () => by ? closeIsland() : openIsland('keys')

function leaveSoon () {
  if (by !== 'pointer') return
  clearTimeout(closing)
  closing = setTimeout(closeIsland, 250)
}
for (const el of [island, reach]) {
  el.addEventListener('pointerenter', () => openIsland('pointer'))
  el.addEventListener('pointerleave', leaveSoon)
}
glance.addEventListener('click', () => openIsland('keys'))
island.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeIsland() } })

// The view a moment belongs to opens with it.
const viewFor = now => ({ stopped: 'shield', playing: 'sound', downloaded: 'tabs', download: 'tabs' })[now?.kind]

function nowShowing () {
  const t = current()
  return activityOf({ moments: [t?.stopped, playing, downloaded], downloads, now: Date.now() })
}

// ---- drawing ----

function context () {
  return { t: current(), downloads, finished, close: closeIsland, redraw: () => { drawn = ''; renderIsland() } }
}

function drawHead (ctx, here) {
  doors.replaceChildren(...here.map(v => {
    const b = h('button', 'island-door', icon(v.glyph, 'alone'))
    b.title = v.label
    b.setAttribute('aria-pressed', String(v.id === view))
    b.addEventListener('click', () => { view = v.id; drawn = ''; renderIsland(); doors.querySelector('[aria-pressed=true]')?.focus() })
    return b
  }))
  status.textContent = headStatus(ctx, tabs.filter(t => t.space === S.space).length)
}

function drawOpen () {
  const ctx = context()
  const here = VIEWS.filter(v => v.shows(ctx))
  if (!here.some(v => v.id === view)) view = here[0].id
  drawHead(ctx, here)
  const was = shown.dataset.view
  shown.replaceChildren(here.find(v => v.id === view).fill(ctx))
  shown.dataset.view = view
  // A new view comes in as Coucou's do; the same one drawn again only changes in place.
  if (was !== view) { shown.classList.remove('arriving'); void shown.offsetWidth; shown.classList.add('arriving') }
}

// What the island looks like now, as a key: nothing is drawn again unless it changed.
function keyOf (now) {
  const t = current()
  if (state !== 'open') return JSON.stringify([state, now])
  const sounding = tabs.filter(x => x.audible || x.id === ui.media).map(x => [x.id, x.audible, x.muted, label(x)])
  return JSON.stringify([state, view, now, t?.id, t?.url, t?.ready, t?.reader, Math.round((t?.reading || 0) * 10), t?.stopped, prefs.shield,
    prefs['shield.paused'], prefs['shield.guarded'], downloads, finished, sounding, ghosts.length, tabs.length, S.active])
}

export function renderIsland () {
  island.hidden = reach.hidden = !prefs.island
  if (!prefs.island) { by = null; state = 'hidden'; return }
  const now = nowShowing()
  const next = by ? 'open' : now ? 'glance' : 'hidden'
  const before = state
  state = next
  const key = keyOf(now)
  if (key === drawn) return
  drawn = key
  island.dataset.state = state
  glance.setAttribute('aria-expanded', String(state === 'open'))
  glance.classList.toggle('on', state === 'glance')
  opened.classList.toggle('on', state === 'open')
  if (state === 'open') drawOpen()
  else if (now) glance.innerHTML = glanceHTML(now)
  glance.setAttribute('aria-label', `${glance.textContent}. Open the island`)
  move(ORDER[state] < ORDER[before])
}

// ---- motion: width, height and corner follow the state, growing on a spring and shrinking on a curve ----

const token = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0

function goal () {
  if (state === 'hidden') return { w: NOTCH_W, h: 0, r: 0 }
  // Concentric with what is inside: the cards' corner plus the padding round them.
  if (state === 'glance') return { w: Math.max(NOTCH_W, glance.offsetWidth), h: glance.offsetHeight, r: token('--r') + token('--s2') }
  return { w: opened.offsetWidth, h: opened.offsetHeight, r: token('--r') + token('--s5') }
}

let running = false
let last = 0
function move (shrinking) {
  const { w, h: high, r } = goal()
  for (const [measure, to] of [[width, w], [height, high], [radius, r]]) {
    if (reduced.matches) measure.jump(to)
    else if (shrinking) measure.curveTowards(to)
    else measure.springTo(to)
  }
  apply()
  if (running || reduced.matches) return
  running = true
  last = performance.now()
  requestAnimationFrame(frame)
}

function frame (now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  for (const measure of [width, height, radius]) measure.step(dt, now)
  apply()
  if (width.animating || height.animating || radius.animating) requestAnimationFrame(frame)
  else running = false
}

function apply () {
  const high = Math.max(0, height.value)
  island.style.setProperty('--w', `${width.value}px`)
  island.style.setProperty('--h', `${high}px`)
  island.style.setProperty('--r-hull', `${Math.max(0, Math.min(radius.value, high / 2))}px`)
  // The ears that join the hull to the page's edge are never taller than the hull.
  island.style.setProperty('--ear', `${Math.min(token('--r'), high)}px`)
}
apply()
