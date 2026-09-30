// Spaces: separate rows of tabs, each with its own session and, if chosen, its own sign-ins.
import { panels } from '../chrome/panels.js'
import { render } from '../chrome/render.js'
import { $, run } from '../elements.js'
import { door } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { menu } from '../look/menu.js'
import { reduced } from '../look/motion.js'
import { toast } from '../page/notices.js'
import { L, makeTab, parked, prefs, S, saveSpaces, sessionName, setPref, sideMode, spaces, stowed, tab, tabs, ui } from '../state.js'
import { foldersFrom, tidy } from './groups/folders.js'
import { snapshot } from './session.js'
import { select } from './tabs.js'
import { unload } from './views.js'

const SPACE_ICONS = [['home', 'Home'], ['briefcase', 'Work'], ['code', 'Code'], ['terminal', 'Terminal'], ['sparkles', 'AI'],
  ['book', 'Reading'], ['cart', 'Shopping'], ['music', 'Music'], ['film', 'Film'], ['game', 'Games'], ['heart', 'Personal'],
  ['leaf', 'Nature'], ['plane', 'Travel'], ['camera', 'Photos'], ['palette', 'Art'], ['coffee', 'Café']]

export function rowFrom (saved, space) {
  const row = (saved?.tabs || []).map(e => makeTab({ url: e.url, title: e.title || null, pin: e.pin || null, home: e.pin ? e.url : null, name: e.name || null, folder: e.folder || null, space }))
  return row.length ? row : [makeTab({ space })]
}

const pauseMedia = 'document.querySelectorAll(\'video,audio\').forEach(m => m.pause())'
let slideDir = 0

export async function enter (id) {
  const target = spaces.find(s => s.id === id)
  if (!target || id === S.space) return
  slideDir = spaces.indexOf(target) > spaces.findIndex(s => s.id === S.space) ? 1 : -1
  L.writeNow(sessionName(S.space), snapshot())
  const carried = tabs.filter(t => t.essential)
  const stays = carried.some(t => t.id === S.active)
  for (const t of tabs) {
    if (!t.ready || t.essential) continue
    t.web.classList.add('hidden')
    t.web.executeJavaScript(pauseMedia).catch(() => {})
  }
  parked.set(S.space, { tabs: tabs.filter(t => !t.essential), active: S.active, folders: S.folders })
  let row = parked.get(id)
  parked.delete(id)
  if (!row) {
    const saved = await L.read(sessionName(id))
    const list = rowFrom(saved, id)
    row = { tabs: list, active: list[Math.min(saved?.active || 0, list.length - 1)].id, folders: foldersFrom(saved) }
  }
  tabs.splice(0, tabs.length, ...carried, ...row.tabs)
  S.folders = row.folders
  tidy()
  S.space = id
  setPref('space.current', id)
  ui.tabEdit = null
  ui.editing = false
  slide()
  // An essential on screen stays on screen: it belongs to every space.
  if (stays) select(S.active)
  else select(row.active && tab(row.active) ? row.active : row.tabs[0].id)
  toast(target.name)
}

// The row leaves the way the swipe went and the next one comes in behind it.
function slide () {
  const box = sideMode() ? $('#side .scroll') : run
  const axis = sideMode() ? 'X' : 'Y'
  const far = sideMode() ? prefs['sidebar.width'] : 52
  const from = reduced.matches ? 'none' : `translate${axis}(${slideDir * far}px)`
  box.animate([{ transform: from, opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 220, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)' })
}

export function leaveSpaces () {
  if (S.space !== 'personal') enter('personal')
  for (const [, row] of parked) row.tabs.forEach(unload)
  parked.clear()
}

export async function createSpace (name, shares) {
  const used = new Set(spaces.map(s => s.icon))
  const icon = (SPACE_ICONS.find(([i]) => !used.has(i)) || SPACE_ICONS[1])[0]
  const space = { id: crypto.randomUUID(), name: name.trim() || 'Space', icon, shares }
  spaces.push(space)
  saveSpaces()
  if (!prefs.spaces) setPref('spaces', true)
  await enter(space.id)
}

async function deleteSpace (id) {
  const space = spaces.find(s => s.id === id)
  if (!space || id === 'personal') return
  const sure = await L.confirm(`Delete “${space.name}”?`, 'Its tabs close, and its cookies and sign-ins are erased from this computer. History and bookmarks stay.', 'Delete')
  if (!sure) return
  if (S.space === id) await enter('personal')
  parked.get(id)?.tabs.forEach(unload)
  parked.delete(id)
  L.remove(sessionName(id))
  if (!space.shares) L.forgetPartition(`persist:space-${id}`)
  spaces.splice(spaces.indexOf(space), 1)
  saveSpaces()
  render()
}

async function spaceMenu (at) {
  const here = spaces.find(s => s.id === S.space)
  const i = spaces.indexOf(here)
  const chosen = await menu([
    ...spaces.map((s, n) => ({ id: `go:${s.id}`, label: s.name, checked: s.id === S.space, keys: n < 9 ? `Alt+${n + 1}` : undefined })),
    '-',
    { id: 'new', label: 'New Space…' },
    { id: 'rename', label: `Rename “${here.name}”…` },
    { id: 'icon', label: 'Icon', items: SPACE_ICONS.map(([icon, name]) => ({ id: `icon:${icon}`, label: name, checked: here.icon === icon })) },
    { id: 'left', label: 'Move Left', enabled: i > 1 },
    { id: 'right', label: 'Move Right', enabled: i > 0 && i < spaces.length - 1 },
    '-',
    { id: 'delete', label: `Delete “${here.name}”…`, enabled: here.id !== 'personal' }
  ], at)
  if (!chosen) return
  if (chosen.startsWith('go:')) return enter(chosen.slice(3))
  if (chosen.startsWith('icon:')) { here.icon = chosen.slice(5); saveSpaces(); return render() }
  if (chosen === 'new') return panels.space({ mode: 'new' })
  if (chosen === 'rename') return panels.space({ mode: 'rename', name: here.name })
  if (chosen === 'left' || chosen === 'right') {
    const j = i + (chosen === 'left' ? -1 : 1)
    ;[spaces[i], spaces[j]] = [spaces[j], spaces[i]]
    saveSpaces()
    return render()
  }
  if (chosen === 'delete') deleteSpace(here.id)
}

const dots = []
for (const where of [$('#strip'), $('#side')]) {
  const dot = door('home', 'Spaces — Alt+1–9, or two fingers across the tabs, to switch', e => {
    const r = e.currentTarget.getBoundingClientRect()
    spaceMenu({ x: Math.round(r.left), y: Math.round(r.bottom + 4) })
  })
  dot.classList.add('space-dot')
  if (where.id === 'strip') where.insertBefore(dot, run)
  else $('#side .foot-row').prepend(dot)
  dots.push(dot)
}

export function renderDots () {
  const here = spaces.find(s => s.id === S.space)
  for (const dot of dots) {
    dot.hidden = !prefs.spaces
    if (dot.dataset.icon !== here.icon) { dot.dataset.icon = here.icon; dot.innerHTML = icon(here.icon, 'alone') }
    dot.title = `${here.name} — Alt+1–9, or two fingers across the tabs, to switch`
  }
}

// Two fingers across the column (or a wheel notch over the strip) switch to the neighbouring space.
let swiped = 0
let swipeLock = 0
function swipe (e, along) {
  if (!prefs.spaces || spaces.length < 2 || stowed()) return
  if (Date.now() < swipeLock) return e.preventDefault()
  const delta = along === 'x' ? e.deltaX : e.deltaY
  if (along === 'x' && Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5) return
  e.preventDefault()
  swiped += delta
  const threshold = along === 'x' ? 50 : 31
  if (Math.abs(swiped) < threshold) { clearTimeout(swipe.reset); swipe.reset = setTimeout(() => { swiped = 0 }, 200); return }
  const i = spaces.findIndex(s => s.id === S.space) + Math.sign(swiped)
  swiped = 0
  swipeLock = Date.now() + 400
  if (spaces[i]) enter(spaces[i].id)
}
$('#side .scroll').addEventListener('wheel', e => swipe(e, 'x'), { passive: false })
run.addEventListener('wheel', e => { if (run.scrollWidth <= run.clientWidth) swipe(e, 'y') }, { passive: false })
