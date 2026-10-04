// Search's panels (Plate.swift, Settings.swift, Recall.swift, Bookmarks.swift, Passwords.swift, Hidden.swift):
// one plate at a time over the page, each drawn afresh from the panel's state.
import { esc, h } from '../elements.js'
import { door } from '../look/controls.js'
import { passkeyClosed, passkeyPlate } from '../passkeys/sheet.js'
import { loadPasskeys, pinPlate } from '../passkeys/setup.js'
import { L, prefs } from '../state.js'
import { bookmarksPlate } from './bookmarks.js'
import { archivePlate } from './records/archive.js'
import { downloadsPlate } from './records/downloads.js'
import { hiddenPlate } from './hidden.js'
import { historyPlate } from './records/history.js'
import { loadVault, passwordsPlate } from './passwords.js'
import { loadChromium } from './settings/chromium.js'
import { refill, settingsPlate } from './settings/index.js'
import { spacePlate } from './space.js'

// What the window lets the panels do to it; set once by createPanels.
export let ctx = null
export const panel = {
  kind: null, plate: null, settingsPage: prefs['settings.page'] || 'general', historyQuery: '', archiveQuery: '', clearing: false,
  loot: [], isDefault: false, sources: [], vaultList: [], vaultQuery: '', openSite: null,
  shown: new Map(), adding: false, spaceDraft: null, renaming: null, openFolders: new Set(), passkey: null, passkeys: null, pinForm: null
}
let root = null

export function createPanels (windowSide) {
  ctx = windowSide
  root = h('div', '', '<div class="dim"></div>')
  root.id = 'panel'
  root.hidden = true
  document.querySelector('#app').append(root)
  root.querySelector('.dim').addEventListener('click', () => close())
  L.downloads().then(list => { panel.loot = list })
  L.onDownloads(list => { panel.loot = list; if (panel.kind === 'downloads') paint() })
  return {
    space: draft => { panel.spaceDraft = { shares: true, ...draft }; panel.kind = null; open('space') },
    open,
    close,
    toggle: which => panel.kind === which ? close() : open(which),
    get kind () { return panel.kind },
    refresh: () => panel.kind && paint()
  }
}

export function open (which) {
  // The Chromium build keeps passwords and downloads in Chromium's own pages.
  const page = L.native && { passwords: 'chrome://password-manager/passwords', downloads: 'chrome://downloads' }[which]
  if (page) return L.openPage(page)
  if (panel.kind === which) return
  panel.kind = which
  panel.clearing = false
  panel.historyQuery = ''
  panel.archiveQuery = ''
  panel.renaming = null
  root.hidden = false
  root.classList.remove('leaving')
  root.classList.add('showing')
  if (which === 'settings') loadChromium()
  if (which === 'settings' && L.passkeys) loadPasskeys()
  if (which === 'settings') L.defaultBrowser(false).then(v => { if (v !== panel.isDefault && panel.kind === 'settings') { panel.isDefault = v; refill() } })
  if (which === 'bookmarks' || which === 'history') L.importSources().then(v => { panel.sources = v; if (panel.kind === which) paint() })
  if (which === 'passwords') { panel.adding = false; loadVault() }
  paint()
  ctx.changed()
}

export function close () {
  if (!panel.kind) return
  if (panel.kind === 'hidden') ctx.peek(null)
  if (panel.kind === 'passkey') passkeyClosed()
  panel.kind = null
  root.classList.remove('showing')
  root.classList.add('leaving')
  setTimeout(() => { if (!panel.kind) { root.hidden = true; panel.plate?.remove(); panel.plate = null } }, 140)
  ctx.changed()
}

export function paint () {
  const focused = document.activeElement?.closest?.('#panel input') ? document.activeElement : null
  const caret = focused?.selectionStart
  const keep = focused?.dataset.keep
  panel.plate?.remove()
  panel.plate = ({ settings: settingsPlate, archive: archivePlate, history: historyPlate, downloads: downloadsPlate, bookmarks: bookmarksPlate, hidden: hiddenPlate, passwords: passwordsPlate, space: spacePlate, passkey: passkeyPlate, 'passkey-pin': pinPlate })[panel.kind]()
  root.classList.toggle('anchored', panel.kind === 'hidden')
  root.append(panel.plate)
  const again = keep && panel.plate.querySelector(`input[data-keep="${keep}"]`)
  if (again) { again.focus(); again.setSelectionRange(caret, caret) } else panel.plate.querySelector('input[autofocus]')?.focus()
}

// Plate: title 17 semibold with a close door, the content, and a foot under a hairline.
export function titled (title, width, parts, foot, compact = false) {
  const el = h('div', 'plate' + (compact ? ' compact' : ''))
  el.style.width = `${width}px`
  const head = h('div', 'head', `<div class="heading">${esc(title)}</div>`)
  head.append(door('close', 'Done   esc', close))
  const body = h('div', 'body')
  body.append(...parts.filter(Boolean))
  el.append(head, body)
  if (foot) {
    const f = h('div', 'foot')
    f.append(...foot.filter(Boolean))
    el.append(f)
  }
  return el
}
