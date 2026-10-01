// The small square buttons around the tabs: navigation, sidebar, extensions, bookmarks, settings, downloads, the
// more menu.
import { $ } from '../elements.js'
import { actions } from '../keys.js'
import { door } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { menu } from '../look/menu.js'
import { isWeb } from '../places/address.js'
import { blank, current, ghosts, L, prefs, setPref, sideMode } from '../state.js'
import { back, forward, reload } from '../tabs/tabs.js'
import { bookmarksDoor } from './bookmarks.js'
import { panels } from './panels.js'
import { fold, render, toggleSidebar } from './render.js'
import { renderStrip } from './strip.js'

const helms = [...document.querySelectorAll('.helm')].map(box => {
  const doors = { back: door('back', 'Back  Ctrl+[', back), forward: door('forward', 'Forward  Ctrl+]', forward), reload: door('reload', 'Reload  Ctrl+R', () => reload()) }
  box.append(doors.back, doors.forward, doors.reload)
  return doors
})
// Where macOS keeps its traffic lights: the sidebar door. In the sidebar it folds it away; on the strip it brings the sidebar.
for (const box of document.querySelectorAll('.lead')) {
  box.append(door('sidebar', box.closest('#side') ? 'Fold the sidebar to the top  Ctrl+S' : 'Sidebar  Ctrl+S', () => prefs.sidebar ? fold() : toggleSidebar()))
}

export function renderHelm () {
  const t = current()
  const empty = blank(t)
  for (const d of helms) {
    d.back.disabled = empty || !t.canBack
    d.forward.disabled = empty || !t.canForward
    d.reload.disabled = empty
    const loading = !!t?.loading
    if (d.reload.dataset.loading !== String(loading)) {
      d.reload.dataset.loading = String(loading)
      d.reload.innerHTML = icon(loading ? 'stop' : 'reload', 'alone')
      d.reload.title = loading ? 'Stop  esc' : 'Reload  Ctrl+R'
    }
  }
}

async function moreDoor (at) {
  const chosen = await menu([
    { id: 'new-tab', label: 'New Tab', keys: 'Ctrl+T' },
    { id: 'reopen', label: 'Reopen Closed Tab', keys: 'Ctrl+Shift+T', enabled: ghosts.length > 0 },
    '-',
    { id: 'history', label: 'History', keys: 'Ctrl+H' },
    { id: 'archive', label: 'Archived Tabs' },
    { id: 'downloads', label: 'Downloads', keys: 'Ctrl+J' },
    { id: 'bookmarks', label: 'Bookmarks', keys: 'Ctrl+Shift+O' },
    { id: 'passwords', label: 'Passwords' },
    '-',
    { id: 'private-tab', label: 'New Private Tab', keys: 'Ctrl+Shift+N' },
    { id: 'new-folder', label: 'New Folder with This Tab', enabled: !!current() && !current().pin && !blank(current()) },
    { id: 'veil', label: 'Hide Something…', keys: 'Ctrl+Shift+H', enabled: !!current()?.ready },
    { id: 'hidden', label: 'Hidden on This Site…', keys: 'Ctrl+Shift+U', enabled: isWeb(current()?.url) },
    '-',
    { id: 'toggle-sidebar', label: 'Tabs in a Sidebar', checked: !!prefs.sidebar, keys: 'Ctrl+Shift+S' },
    { id: 'bar', label: 'Show Bookmarks Bar', checked: !!prefs['bookmarks.bar'] },
    '-',
    { id: 'settings', label: 'Settings…', keys: 'Ctrl+,' },
    { id: 'welcome', label: 'Welcome…' },
    { id: 'quit', label: 'Quit', keys: 'Ctrl+Q' }
  ], at)
  if (chosen === 'bar') { setPref('bookmarks.bar', !prefs['bookmarks.bar']); render() } else if (chosen) actions[chosen]?.()
}

// The Chromium build runs Chrome's extensions; their actions live behind this door, popups hanging from it.
const WEB_STORE = 'https://chromewebstore.google.com/category/extensions'
async function extensionsDoor (e) {
  const at = e.currentTarget.getBoundingClientRect()
  const list = await L.extensions()
  const chosen = await menu([
    ...(list.length ? list.map(x => ({ id: `run:${x.id}`, label: x.name })) : [{ id: 'none', label: 'No extensions yet', enabled: false }]),
    '-',
    { id: 'store', label: 'Get Extensions…' },
    { id: 'manage', label: 'Manage Extensions…' }
  ], { x: at.left, y: at.bottom + 4 })
  if (chosen?.startsWith('run:')) L.runExtension(chosen.slice(4), [Math.round(at.left), Math.round(at.top), Math.round(at.width), Math.round(at.height)])
  else if (chosen === 'store') L.openPage(WEB_STORE)
  else if (chosen === 'manage') L.openPage('chrome://extensions')
}

for (const box of [$('#strip .doors'), $('#side .foot-row')]) {
  if (L.extensions) box.append(door('puzzle', 'Extensions', extensionsDoor))
  const b = door('bookmark', 'Bookmarks', bookmarksDoor)
  b.classList.add('bookmarks')
  const gear = door('gear', 'Settings  Ctrl+,', () => panels.toggle('settings'))
  gear.classList.add('settings-door')
  box.append(b, gear)
}
// What the macOS menu bar holds: a right-click on the empty chrome, or F10.
for (const empty of [$('#strip'), $('#side .band'), $('#side .foot-row'), $('#side .scroll')]) {
  empty.addEventListener('contextmenu', e => {
    if (e.target.closest('.tab, .row, .folder-row, .pin, .door, .light, .plus, .quiet')) return
    e.preventDefault()
    moreDoor({ x: e.clientX, y: e.clientY })
  })
}

// ---- downloads door: shows once something downloads, ringed while it runs ----

const loads = []
for (const box of [$('#strip .doors'), $('#side .foot-row')]) {
  const b = door('download', 'Downloads  Ctrl+J', () => panels.toggle('downloads'))
  b.classList.add('loads-door')
  b.hidden = true
  box.prepend(b)
  loads.push(b)
}
L.onDownloadProgress((count, fraction) => {
  for (const b of loads) {
    b.hidden = false
    b.classList.toggle('running', count > 0)
    b.style.setProperty('--done', `${Math.round((fraction ?? 0) * 360)}deg`)
  }
  if (!sideMode()) renderStrip()
})
