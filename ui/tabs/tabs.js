// Opening, closing, choosing, pinning and moving tabs.
import { animate, render } from '../chrome/render.js'
import { revealActive } from '../chrome/strip.js'
import { stopVeiling } from '../page/veil.js'
import { isWeb } from '../places/address.js'
import { blank, current, ghosts, L, makeTab, monogram, now, S, tab, tabs, ui } from '../state.js'
import { folderOf, sameGroup, tidy } from './groups/folders.js'
import { save, saveLater } from './session.js'
import { focusPage, go, unload, wake } from './views.js'

function insertAfterActive (t) {
  const i = tabs.findIndex(x => x.id === S.active)
  const loose = tabs.findIndex(x => !x.pin)
  const at = i < 0 ? tabs.length : Math.max(i + 1, loose < 0 ? tabs.length : loose)
  tabs.splice(at, 0, t)
}

export function select (id) {
  const old = current()
  if (old) old.touched = now()
  const t = tab(id)
  if (!t) return
  t.touched = now()
  S.active = id
  const holder = folderOf(t)
  if (holder && !holder.open) { holder.open = true; saveLater() }
  ui.editing = false
  ui.summoning = false
  ui.tabEdit = null
  if (ui.veiling) stopVeiling()
  wake(t)
  animate()
  render()
  revealActive()
  focusPage()
  saveLater()
}

export function newTab (shy) {
  // Also a click handler: the event it is handed says nothing about private.
  if (typeof shy !== 'boolean') shy = !!current()?.shy
  let t = tabs.find(x => blank(x) && x.shy === shy)
  // Never two blank tabs: the one there is moves to the end.
  if (t) { tabs.splice(tabs.indexOf(t), 1); t.folder = null; tidy() } else t = makeTab({ shy })
  t.opener = S.active
  tabs.push(t)
  ui.typed = ''
  select(t.id)
}

export function open (url, foreground, native) {
  const t = makeTab({ url, opener: S.active, shy: !!current()?.shy })
  // A tab Chromium already opened: its page exists, the UI only takes it in.
  t.native = native
  insertAfterActive(t)
  if (foreground) return select(t.id)
  wake(t)
  animate()
  render()
  saveLater()
}

function remember (t) {
  if (!isWeb(t.url)) return
  ghosts.push({ url: t.url, title: t.title, index: tabs.indexOf(t) })
  if (ghosts.length > 12) ghosts.shift()
}

export function closeTab (id) {
  const t = tab(id)
  if (!t) return
  if (t.pin) {
    // A pinned tab rests instead of going: it keeps its place and its address.
    unload(t)
    if (S.active === id) {
      const next = tabs.filter(x => !x.pin && x.web).sort((a, b) => b.touched - a.touched)[0]
      if (next) return select(next.id)
    }
    return render()
  }
  if (tabs.length === 1) {
    if (blank(t)) return L.window('close')
    remember(t)
    const fresh = makeTab()
    tabs.push(fresh)
    drop(t)
    return select(fresh.id)
  }
  remember(t)
  const index = tabs.indexOf(t)
  drop(t)
  if (S.active === id) {
    const next = tabs[index] || tabs[tabs.length - 1]
    const opener = t.opener && tab(t.opener)
    select((opener && index === tabs.length ? opener : next).id)
  } else {
    animate()
    render()
    saveLater()
  }
}

function drop (t) {
  unload(t)
  tabs.splice(tabs.indexOf(t), 1)
  // The last tab out takes its folder with it.
  if (t.folder && !tabs.some(x => x.folder === t.folder)) S.folders = S.folders.filter(f => f.id !== t.folder)
}

export function closeOthers (id) {
  for (const t of [...tabs]) {
    if (t.id === id) continue
    if (t.pin) unload(t)
    else { remember(t); drop(t) }
  }
  select(id)
}

export function reopen () {
  const g = ghosts.pop()
  if (!g) return
  const t = makeTab({ url: g.url, title: g.title })
  tabs.splice(Math.min(g.index, tabs.length), 0, t)
  select(t.id)
}

export function step (by) {
  if (!tabs.length) return
  const i = tabs.findIndex(t => t.id === S.active)
  select(tabs[(i + by + tabs.length) % tabs.length].id)
}

export function jump (n) {
  const t = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]
  if (t) select(t.id)
}

export function pin (t) {
  if (t.pin) return
  t.pin = monogram(t)
  // Pinned to this address: browse away inside it, a restart brings it back here.
  t.home = t.url
  tabs.splice(tabs.indexOf(t), 1)
  const loose = tabs.findIndex(x => !x.pin)
  tabs.splice(loose < 0 ? tabs.length : loose, 0, t)
  tidy()
  animate()
  render()
  save()
}

export function unpin (t) {
  if (!t.pin) return
  t.pin = null
  t.home = null
  tabs.splice(tabs.indexOf(t), 1)
  const loose = tabs.findIndex(x => !x.pin)
  tabs.splice(loose < 0 ? tabs.length : loose, 0, t)
  tidy()
  animate()
  render()
  save()
}

export function move (t, to) {
  const from = tabs.indexOf(t)
  // Pinned tabs, each folder and the loose rest never mix: a tab moves only among its own group.
  const group = tabs.filter(x => sameGroup(x, t))
  to = Math.min(Math.max(to, tabs.indexOf(group[0])), tabs.indexOf(group[group.length - 1]))
  if (to === from) return false
  tabs.splice(from, 1)
  tabs.splice(to, 0, t)
  animate()
  render()
  saveLater()
  return true
}

export function back () { return current()?.ready && current().web.goBack() }
export function forward () { return current()?.ready && current().web.goForward() }

export function reload (hard) {
  const t = current()
  if (!t || blank(t)) return
  if (t.failure || !t.ready) return go(t, t.url)
  if (t.loading) t.web.stop()
  else if (hard) t.web.reloadIgnoringCache()
  else t.web.reload()
}

export function toggleMute (t = current()) {
  if (!t) return
  t.muted = !t.muted
  if (t.ready) t.web.setAudioMuted(t.muted)
  render()
}
