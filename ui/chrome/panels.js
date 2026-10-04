// The panels (settings, history, ...) and what they may do to the window.
import { changeLook } from '../look/theme.js'
import { toast } from '../page/notices.js'
import { changeHidden, startVeiling } from '../page/veil.js'
import { createPanels } from '../panels/index.js'
import { bareHost } from '../places/address.js'
import { bookmarks, configure, current, hidden, history, L, prefs, S, saveSpaces, setPref, spaces, ui } from '../state.js'
import { createSpace, leaveSpaces } from '../tabs/spaces.js'
import { open, reload } from '../tabs/tabs.js'
import { go } from '../tabs/views.js'
import { forgetDrawnTabs, markFor } from './marks.js'
import { render, toggleSidebar } from './render.js'

export const panels = createPanels({
  L, prefs, setPref, history, bookmarks, toast,
  version: L.info.version, home: L.info.home, downloadsFolder: L.info.downloads,
  markFor,
  changed: () => render(),
  currentHost: () => bareHost(current()?.url || ''),
  currentURL: () => current()?.url || '',
  startVeiling: () => startVeiling(),
  hiddenHere: () => hidden.on(bareHost(current()?.url || '')),
  hiddenSheet: except => hidden.sheet(bareHost(current()?.url || ''), except),
  changeHidden: (what, selector) => changeHidden(what, current()?.url, selector),
  peek: (css, selector) => current()?.ready && current().web.send('veil', css === null ? 'unpeek' : 'peek', css, selector),
  historyTake: list => { for (const v of list) history.take(v); history.flush() },
  setLook: look => changeLook(look),
  createSpace: (name, shares) => createSpace(name, shares),
  renameSpace: name => { const here = spaces.find(s => s.id === S.space); if (name.trim()) { here.name = name.trim(); saveSpaces(); render() } },
  reload: () => reload(),
  setSidebar: on => { if (!!prefs.sidebar !== on) toggleSidebar() },
  bookmarksChanged: () => render(),
  prefsChanged: key => {
    if (['downloads', 'downloads.ask', 'downloads.sort', 'shield', 'shield.paused', 'capture'].includes(key)) configure()
    if (key === 'sidebar.hides') ui.folded = !!prefs['sidebar.hides'] && prefs.sidebar
    if (key === 'spaces' && !prefs.spaces) leaveSpaces()
    if (key === 'glyph') forgetDrawnTabs()
    render()
  },
  openURL: (url, newTab) => {
    const t = current()
    if (newTab || !t) open(url, true)
    else go(t, url)
  }
})
