// What each shortcut does; main (Electron) or C++ (Chromium) decides which key is which.
import { bookmarkPage } from './chrome/bookmarks.js'
import { forgetDrawnTabs } from './chrome/marks.js'
import { panels } from './chrome/panels.js'
import { fold, render, toggleSidebar } from './chrome/render.js'
import { menu } from './look/menu.js'
import { changeLook } from './look/theme.js'
import { closeFind, findStep, openFind } from './page/find.js'
import { toast } from './page/notices.js'
import { destination, dismiss, edit, searchURL, summon } from './page/omnibox.js'
import { closePeek, float, peekView, toggleReader } from './page/peek.js'
import { card, closeCard } from './page/sitecard.js'
import { startVeiling, stopVeiling } from './page/veil.js'
import { blank, bookmarks, current, history, L, prefs, S, spaces, ui } from './state.js'
import { finishTabEdit } from './tabs/edit.js'
import { enter } from './tabs/spaces.js'
import { back, closeTab, forward, jump, newTab, open, reload, reopen, step, toggleMute } from './tabs/tabs.js'
import { focusPage, go, zoom } from './tabs/views.js'
import { createWelcome } from './welcome/index.js'

function escape () {
  if (card) return closeCard()
  if (peekView) return closePeek()
  if (panels.kind) return panels.close()
  if (ui.veiling) return stopVeiling()
  if (ui.tabEdit) return finishTabEdit(false)
  if (ui.finding) return closeFind()
  if (ui.editing) return dismiss()
  const t = current()
  if (t?.loading && t.ready) t.web.stop()
}

export const actions = {
  welcome,
  'new-tab': () => newTab(),
  'private-tab': () => newTab(true),
  reopen,
  'close-tab': () => S.active !== null && closeTab(S.active),
  edit,
  summon,
  reload: () => reload(false),
  'reload-hard': () => reload(true),
  back,
  forward,
  'next-tab': () => step(1),
  'previous-tab': () => step(-1),
  duplicate: () => current()?.url && open(current().url, true),
  'copy-address': () => { if (current()?.url) { L.copy(current().url); toast('Address copied') } },
  'paste-and-go': async () => {
    const url = destination((await L.paste()).trim())
    if (url && current()) go(current(), url)
  },
  find: openFind,
  'find-next': () => findStep(true),
  'find-previous': () => findStep(false),
  'toggle-sidebar': toggleSidebar,
  fold,
  mute: () => toggleMute(),
  'zoom-in': () => zoom(1.1),
  'zoom-out': () => zoom(1 / 1.1),
  'zoom-reset': () => zoom(null),
  inspect: () => current()?.ready && current().web.openDevTools(),
  print: () => current()?.ready && current().web.print(),
  quit: () => L.window('close'),
  settings: () => panels.toggle('settings'),
  history: () => panels.toggle('history'),
  archive: () => panels.toggle('archive'),
  downloads: () => panels.toggle('downloads'),
  bookmarks: () => panels.toggle('bookmarks'),
  bookmark: bookmarkPage,
  fullscreen: () => L.window('fullscreen'),
  'open-file': async () => {
    const file = await L.chooseFile()
    if (file) open(`file://${file}`, true)
  },
  'view-source': () => { const t = current(); if (t?.url && !t.url.startsWith('view-source:')) open(`view-source:${t.url}`, true) },
  reader: toggleReader,
  pip: float,
  veil: () => ui.veiling ? stopVeiling() : startVeiling(),
  'veil-undo': () => current() && L.veil('undo', current().url),
  hidden: () => panels.toggle('hidden'),
  passwords: () => panels.toggle('passwords'),
  escape
}
for (let n = 1; n <= 9; n++) {
  actions[`tab-${n}`] = () => jump(n)
  actions[`space-${n}`] = () => prefs.spaces && spaces[n - 1] && enter(spaces[n - 1].id)
}

L.onShortcut(action => actions[action]?.())
L.onPageMenu(async (items, x, y) => {
  const chosen = await menu(items, { x, y })
  if (chosen) L.pageMenuChosen(chosen)
})
L.onOpened?.((id, url, foreground) => open(url, foreground, id))
L.onOpenTab((url, foreground) => {
  const t = current()
  if (foreground && blank(t) && !ui.typed) return go(t, url)
  open(url, foreground)
})
L.onSearch(text => { const url = searchURL(text); if (url) open(url, true) })
L.onToast(toast)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) escape() })

function welcome () {
  createWelcome({
    setSidebar: on => { if (!!prefs.sidebar !== on) toggleSidebar() },
    setLook: look => changeLook(look),
    changed: () => { forgetDrawnTabs(); render() },
    bringBookmarks: async name => { const tree = await L.importBookmarks(name); bookmarks.take(name, tree); render(); return bookmarks.count },
    bringHistory: async name => { const list = await L.importHistory(name); for (const v of list) history.take(v); history.flush(); return list.length },
    done: signIn => { if (signIn) { const t = current(); blank(t) ? go(t, signIn) : open(signIn, true) } else focusPage() }
  })
}
