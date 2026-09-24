import { glide, settle } from './motion.js'
import { toURL, pretty, bareHost, isWeb } from './address.js'
import * as engine from './engine.js'
import { History, completion } from './history.js'
import { icon } from './icons.js'
import { Bookmarks } from './bookmarks.js'
import { createPanels } from './panels.js'
import { READER } from './reader.js'
import { menu } from './menu.js'

const L = window.leech
const $ = (sel, root = document) => root.querySelector(sel)
const h = (tag, cls, html) => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (html !== undefined) el.innerHTML = html
  return el
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const now = () => Date.now() / 1000

const app = $('#app')
const strip = $('#strip')
const run = $('#strip .run')
const side = $('#side')
const stage = $('#stage')
const omni = $('#omni')
const omniInput = $('#omni input')
const omniField = $('#omni .field')
const omniList = $('#omni .list')

// ---- state ----

const [savedPrefs, savedSession, savedHistory, savedIcons, savedBookmarks, savedSpaces] =
  await Promise.all([L.read('settings'), L.read('session'), L.read('history'), L.read('icons'), L.read('bookmarks'), L.read('spaces')])

const prefs = {
  look: 'light',
  sidebar: false,
  'sidebar.width': 232,
  'sidebar.hides': false,
  glyph: 'letters',
  'search.engine': 'google',
  'search.custom': '',
  'tabs.reading': true,
  'links.show': false,
  'links.peek': false,
  'bookmarks.bar': false,
  downloads: '',
  'downloads.ask': false,
  shield: true,
  'shield.paused': [],
  capture: {},
  'passwords.save': true,
  'passwords.fill': true,
  'passwords.never': [],
  'tabs.sleep': true,
  spaces: false,
  ...savedPrefs
}
// The same brands navigator.userAgentData gives pages, so the header and the scripts agree.
const brands = navigator.userAgentData.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ')
const configure = () => L.configure({ downloads: prefs.downloads, ask: prefs['downloads.ask'], shield: prefs.shield, paused: prefs['shield.paused'], capture: prefs.capture, brands })
configure()
const setPref = (key, value) => { prefs[key] = value; L.write('settings', prefs) }

const history = new History(savedHistory || [], (list, sync) => sync ? L.writeNow('history', list) : L.write('history', list))
const icons = new Map(Object.entries(savedIcons || {}))
const bookmarks = new Bookmarks(savedBookmarks || [], tree => L.write('bookmarks', tree))
// A remembered icon that no longer loads gives way to the letter, and is forgotten.
document.addEventListener('error', e => {
  const img = e.target
  if (img.tagName !== 'IMG' || !img.closest('.mark, .glyph')) return
  for (const [host, src] of icons) if (src === img.src) icons.delete(host)
  for (const t of tabs) if (t.favicon === img.src) t.favicon = null
  L.write('icons', Object.fromEntries(icons))
  const holder = img.closest('.mark, .glyph')
  holder.classList.remove('has-icon')
  holder.textContent = '•'
}, true)

// Spaces: separate rows of tabs; the first is always there and keeps session.json and the shared cookie jar.
const spaces = Array.isArray(savedSpaces) ? savedSpaces.filter(s => s.id !== 'personal') : []
spaces.unshift({ id: 'personal', name: 'Personal', icon: 'home', shares: true, ...(savedSpaces || []).find(s => s.id === 'personal') })
let spaceId = prefs.spaces && spaces.some(s => s.id === prefs['space.current']) ? prefs['space.current'] : 'personal'
const parked = new Map()
const sessionName = id => id === 'personal' ? 'session' : `session-${id}`
const partitionOf = id => spaces.find(s => s.id === id)?.shares === false ? `persist:space-${id}` : 'persist:leech'
const saveSpaces = () => L.write('spaces', spaces)

const tabs = []
const ghosts = []
let active = null
let nextId = 1
const ui = {
  editing: false, summoning: false, cycling: false,
  typed: '', offers: [], ending: null, picked: null, shortened: false,
  folded: !!prefs['sidebar.hides'] && prefs.sidebar, peeking: false, immersed: false,
  finding: false, tabEdit: null
}

// Below 700 wide there is no room for a column: the tabs go across the top until the window grows again.
const NARROW = 700
const sideMode = () => !!prefs.sidebar && innerWidth >= NARROW

const tab = id => tabs.find(t => t.id === id)
const current = () => tab(active)
const blank = t => !t || !t.url
const label = t => t.name || (t.title && t.title.trim()) || (t.url ? pretty(t.url) : 'New Tab')
const monogram = t => (bareHost(t.url || '') || '').charAt(0).toUpperCase() || '•'
const favicon = t => t.favicon || icons.get(bareHost(t.url || '') || '') || null

function makeTab (fields = {}) {
  return { id: nextId++, url: null, title: null, favicon: null, loading: false, canBack: false, canForward: false,
    pin: null, name: null, failure: null, muted: false, audible: false, reading: 0, touched: now(),
    web: null, ready: false, opener: null, shy: false, signin: null, hasForm: false, picture: null, space: spaceId, ...fields }
}

// ---- motion ----

let animateTimer = null
/** The next render moves things with transitions instead of jumping. */
function animate () {
  app.classList.add('animate')
  clearTimeout(animateTimer)
  animateTimer = setTimeout(() => app.classList.remove('animate'), Math.max(glide.ms, settle.ms) + 50)
}

// ---- web views ----

const FAILURES = {
  '-105': 'No site at that address.', '-137': 'No site at that address.',
  '-106': 'No connection.', '-21': 'No connection.',
  '-7': 'The site took too long to answer.', '-118': 'The site took too long to answer.',
  '-102': 'The site refused the connection.'
}
const failureText = code => FAILURES[code] || (code <= -200 && code > -300 ? 'The connection isn’t secure.' : 'The page didn’t load.')

function view (t) {
  if (t.web) return t.web
  const w = document.createElement('webview')
  // A private tab gets a cookie jar of its own, in memory, gone when the tab closes.
  w.setAttribute('partition', t.shy ? `leech-private-${t.id}` : partitionOf(t.space))
  w.setAttribute('allowpopups', '')
  // Chromium's own PDF viewer is a plugin.
  w.setAttribute('plugins', '')
  w.setAttribute('preload', new URL('guest.js', location.href).href)
  w.setAttribute('webpreferences', 'contextIsolation=yes, plugins=yes')
  w.className = 'hidden'
  const on = (event, fn) => w.addEventListener(event, e => { if (tab(t.id)) fn(e) })
  const nav = () => {
    t.canBack = w.canGoBack()
    t.canForward = w.canGoForward()
  }
  on('dom-ready', () => {
    const first = !t.ready
    t.ready = true
    nav()
    w.send('prefs', { peek: prefs['links.peek'] })
    if (first) {
      w.setAudioMuted(t.muted)
      applyZoom(t)
    }
  })
  on('did-start-loading', () => { t.loading = true; render() })
  on('did-stop-loading', () => { t.loading = false; if (t.ready) nav(); uncover(t); render() })
  on('page-title-updated', e => {
    t.title = e.title
    if (t.url) history.retitle(t.url, e.title)
    render()
  })
  on('page-favicon-updated', e => {
    // Only an icon that actually loads: a missing favicon.ico would show as a broken image.
    const src = e.favicons[0]
    if (!src) return
    const probe = new Image()
    probe.onload = () => {
      t.favicon = src
      const host = bareHost(t.url || '')
      if (host && !t.shy && icons.get(host) !== src) {
        icons.set(host, src)
        L.write('icons', Object.fromEntries(icons))
      }
      render()
    }
    probe.src = src
  })
  on('did-navigate', e => {
    const hostChanged = bareHost(e.url) !== bareHost(t.url || '')
    t.url = e.url
    t.failure = null
    t.reading = 0
    t.hasForm = false
    t.reader = false
    if (t.id === accountsTab) accounts.hidden = true
    if (hostChanged) t.favicon = null
    nav()
    applyZoom(t)
    render()
    saveLater()
  })
  on('did-navigate-in-page', e => {
    if (!e.isMainFrame) return
    t.url = e.url
    nav()
    render()
    saveLater()
  })
  on('did-finish-load', () => {
    if (t.url && !t.shy) history.record(t.url, t.title || '')
    signInSettles(t)
  })
  on('did-fail-load', e => {
    // -3 is an aborted load (a new navigation, a download): not a failure.
    if (!e.isMainFrame || e.errorCode === -3) return
    t.url = e.validatedURL || t.url
    t.failure = failureText(e.errorCode)
    render()
  })
  on('ipc-message', e => {
    if (e.channel === 'scroll') {
      const reading = Math.round(e.args[0] * 100) / 100
      if (reading !== t.reading) { t.reading = reading; if (t.id === active) paintReading() }
    } else if (e.channel === 'unsaved') t.answer?.(e.args[0])
    else if (e.channel === 'veil') veiled(t, e.args[0])
    else if (e.channel === 'forms') formSaid(t, e.args[0])
    else if (e.channel === 'peek') peek(e.args[0])
  })
  on('media-started-playing', () => { t.audible = true; render() })
  on('media-paused', () => { t.audible = false; render() })
  on('enter-html-full-screen', () => { ui.immersed = true; render() })
  on('leave-html-full-screen', () => { ui.immersed = false; render() })
  on('found-in-page', e => { if (e.result.finalUpdate) $('#find').classList.toggle('missed', e.result.matches === 0 && !!$('#find input').value) })
  on('update-target-url', e => { if (t.id === active) hoverLink(e.url) })
  on('close', () => closeTab(t.id))
  t.web = w
  stage.insertBefore(w, $('#failure'))
  return w
}

function wake (t) {
  if (t.web || !t.url) return
  const w = view(t)
  w.src = t.url
  if (t.picture) cover(t)
}

function go (t, url) {
  t.failure = null
  t.url = url
  if (!t.web) wake(t)
  else if (t.ready) t.web.loadURL(url).catch(() => {})
  else t.web.src = url
  ui.editing = false
  render()
  focusPage()
  saveLater()
}

function unload (t) {
  if (!t.web) return
  t.web.remove()
  t.web = null
  t.ready = false
  t.loading = false
  t.audible = false
}

function applyZoom (t) {
  const host = bareHost(t.url || '')
  if (t.ready && host) t.web.setZoomFactor(prefs[`zoom.${host}`] || 1)
}

function zoom (factor) {
  const t = current()
  if (!t?.ready) return
  const level = factor ? Math.min(3, Math.max(0.4, t.web.getZoomFactor() * factor)) : 1
  t.web.setZoomFactor(level)
  const host = !t.shy && bareHost(t.url || '')
  if (host) {
    if (Math.abs(level - 1) < 0.01) { delete prefs[`zoom.${host}`]; L.write('settings', prefs) } else setPref(`zoom.${host}`, level)
  }
  toast(`${Math.round(level * 100)}%`)
}

function focusPage () {
  requestAnimationFrame(() => {
    const t = current()
    if (ui.editing || blank(t) || ui.tabEdit) omniInput.focus()
    else t.web?.focus()
  })
}

// ---- tabs ----

function insertAfterActive (t) {
  const i = tabs.findIndex(x => x.id === active)
  const loose = tabs.findIndex(x => !x.pin)
  const at = i < 0 ? tabs.length : Math.max(i + 1, loose < 0 ? tabs.length : loose)
  tabs.splice(at, 0, t)
}

function select (id) {
  const old = current()
  if (old) old.touched = now()
  const t = tab(id)
  if (!t) return
  t.touched = now()
  active = id
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

function newTab (shy = !!current()?.shy) {
  let t = tabs.find(x => blank(x) && x.shy === shy)
  // Never two blank tabs: the one there is moves to the end.
  if (t) tabs.splice(tabs.indexOf(t), 1)
  else t = makeTab({ shy })
  tabs.push(t)
  ui.typed = ''
  select(t.id)
}

function open (url, foreground) {
  const t = makeTab({ url, opener: active, shy: !!current()?.shy })
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

function closeTab (id) {
  const t = tab(id)
  if (!t) return
  if (t.pin) {
    // A pinned tab rests instead of going: it keeps its place and its address.
    unload(t)
    if (active === id) {
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
  if (active === id) {
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
}

function closeOthers (id) {
  for (const t of [...tabs]) {
    if (t.id === id) continue
    if (t.pin) unload(t)
    else { remember(t); drop(t) }
  }
  select(id)
}

function reopen () {
  const g = ghosts.pop()
  if (!g) return
  const t = makeTab({ url: g.url, title: g.title })
  tabs.splice(Math.min(g.index, tabs.length), 0, t)
  select(t.id)
}

function step (by) {
  if (!tabs.length) return
  const i = tabs.findIndex(t => t.id === active)
  select(tabs[(i + by + tabs.length) % tabs.length].id)
}

function jump (n) {
  const t = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]
  if (t) select(t.id)
}

function pin (t) {
  if (t.pin) return
  t.pin = monogram(t)
  tabs.splice(tabs.indexOf(t), 1)
  const loose = tabs.findIndex(x => !x.pin)
  tabs.splice(loose < 0 ? tabs.length : loose, 0, t)
  animate()
  render()
  save()
}

function unpin (t) {
  if (!t.pin) return
  t.pin = null
  tabs.splice(tabs.indexOf(t), 1)
  const loose = tabs.findIndex(x => !x.pin)
  tabs.splice(loose < 0 ? tabs.length : loose, 0, t)
  animate()
  render()
  save()
}

function move (t, to) {
  const from = tabs.indexOf(t)
  const pinned = tabs.filter(x => x.pin).length
  // Pinned and loose tabs never mix.
  to = t.pin ? Math.min(Math.max(to, 0), pinned - 1) : Math.min(Math.max(to, pinned), tabs.length - 1)
  if (to === from) return false
  tabs.splice(from, 1)
  tabs.splice(to, 0, t)
  animate()
  render()
  saveLater()
  return true
}

const back = () => current()?.ready && current().web.goBack()
const forward = () => current()?.ready && current().web.goForward()

function reload (hard) {
  const t = current()
  if (!t || blank(t)) return
  if (t.failure || !t.ready) return go(t, t.url)
  if (t.loading) t.web.stop()
  else if (hard) t.web.reloadIgnoringCache()
  else t.web.reload()
}

function toggleMute (t = current()) {
  if (!t) return
  t.muted = !t.muted
  if (t.ready) t.web.setAudioMuted(t.muted)
  render()
}

// ---- search and addresses ----

const searchURL = text => engine.searchURL(text, engine.template(prefs['search.engine'], prefs['search.custom']))
const destination = text => toURL(text) || searchURL(text)

// ---- the omnibox ----

function edit () {
  ui.summoning = false
  ui.tabEdit = null
  const t = current()
  ui.typed = t?.url || ''
  ui.offers = []
  ui.ending = null
  ui.picked = null
  ui.editing = true
  render()
  omniInput.value = ui.typed
  omniInput.focus()
  omniInput.select()
}

function summon () {
  if (ui.summoning && ui.editing) {
    // Ctrl+K again while Ctrl is held steps down; letting go of Ctrl takes the pick.
    ui.cycling = true
    return walk(1)
  }
  ui.summoning = true
  ui.editing = true
  ui.tabEdit = null
  ui.typed = ''
  omniInput.value = ''
  guess()
  render()
  omniInput.focus()
}

function dismiss () {
  ui.summoning = false
  ui.cycling = false
  // A blank tab has nothing behind the field to go back to.
  if (blank(current())) return
  ui.editing = false
  ui.typed = ''
  ui.offers = []
  render()
  focusPage()
}

function guess () {
  const typed = ui.typed
  if (ui.summoning) {
    ui.offers = openPages(typed)
    ui.picked = ui.offers.length ? 0 : null
    ui.ending = null
    return
  }
  if (!typed.trim()) {
    ui.offers = []
    ui.ending = null
    ui.picked = null
    return
  }
  const list = history.suggestions(typed, 3)
  if (!toURL(typed)) {
    const url = searchURL(typed)
    if (url) list.push({ key: typed, title: engine.name(prefs['search.engine'], prefs['search.custom']), url, kind: 'search' })
  }
  ui.offers = list
  ui.ending = completion(typed, list)
  ui.picked = null
}

function openPages (typed) {
  const needle = typed.trim().toLowerCase()
  return tabs
    .filter(t => t.id !== active && !blank(t))
    .filter(t => !needle || label(t).toLowerCase().includes(needle) || pretty(t.url).includes(needle))
    .sort((a, b) => b.touched - a.touched)
    .slice(0, needle ? 3 : 6)
    .map(t => ({ key: label(t), title: pretty(t.url), url: t.url, kind: 'open', tab: t.id }))
}

function writeField () {
  const ending = ui.shortened ? null : ui.ending
  omniInput.value = ui.typed + (ending || '')
  if (ending) omniInput.setSelectionRange(ui.typed.length, omniInput.value.length)
}

omniInput.addEventListener('input', () => {
  // With an ending selected, the typed part is what comes before the selection.
  ui.typed = omniInput.value
  omniField.classList.remove('refused')
  guess()
  if (ui.shortened) ui.ending = null
  writeField()
  ui.shortened = false
  renderOmni()
})

omniInput.addEventListener('keydown', e => {
  const atEnd = omniInput.selectionEnd === omniInput.value.length
  if (e.key === 'Enter') submit()
  else if (e.key === 'ArrowDown') walk(1)
  else if (e.key === 'ArrowUp') walk(-1)
  else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) acceptEnding()
  else if (e.key === 'ArrowRight' && atEnd && ui.ending) acceptEnding()
  else if (e.key === 'Escape') ui.picked !== null ? (ui.picked = null, renderOmni()) : dismiss()
  else {
    if (e.key === 'Backspace' || e.key === 'Delete') ui.shortened = true
    return
  }
  e.preventDefault()
})

document.addEventListener('keyup', e => {
  if (e.key === 'Control' && ui.cycling) {
    ui.cycling = false
    submit()
  }
})

function acceptEnding () {
  if (!ui.ending) return
  ui.typed += ui.ending
  guess()
  ui.ending = null
  omniInput.value = ui.typed
  renderOmni()
}

function walk (by) {
  const n = ui.offers.length
  if (!n) return
  if (ui.picked === null) ui.picked = by > 0 ? 0 : n - 1
  else {
    const next = ui.picked + by
    ui.picked = next < 0 || next >= n ? null : next
  }
  renderOmni()
}

function take (offer) {
  ui.summoning = false
  ui.typed = ''
  ui.picked = null
  ui.offers = []
  if (offer.tab && tab(offer.tab)) return select(offer.tab)
  const t = current()
  if (t) go(t, offer.url)
}

/** Return: a picked row wins, then what the field was finishing, then what was typed. */
function submit () {
  const picked = ui.picked !== null && ui.offers[ui.picked]
  if (picked) return take(picked)
  const typed = ui.typed
  if (ui.summoning) {
    ui.summoning = false
    if (!typed.trim()) return dismiss()
  }
  const url = ui.ending ? toURL(typed + ui.ending) : destination(typed)
  if (!url) {
    omniField.classList.remove('refused')
    void omniField.offsetWidth
    omniField.classList.add('refused')
    return
  }
  ui.typed = ''
  ui.offers = []
  ui.ending = null
  const t = current()
  if (t) go(t, url)
}

$('#omni .scrim').addEventListener('click', dismiss)

// ---- tab editing in place ----

function startTabEdit (t, kind) {
  const draft = kind === 'name' ? label(t) : kind === 'pin' ? t.pin : (t.url ? pretty(t.url) : '')
  ui.tabEdit = { id: t.id, kind, draft }
  ui.editing = false
  animate()
  render()
  const input = $('.tab-field')
  if (input) { input.focus(); input.select() }
  if (kind === 'address' && !blank(t)) setTimeout(() => siteCard(t, input), 30)
}

function finishTabEdit (commit) {
  const e = ui.tabEdit
  if (!e) return
  closeCard()
  const t = tab(e.id)
  const input = $('.tab-field')
  const draft = input ? input.value : e.draft
  ui.tabEdit = null
  if (commit && t) {
    if (e.kind === 'name') {
      t.name = draft.trim() && draft.trim() !== t.title ? draft.trim() : null
      save()
    } else if (e.kind === 'pin') {
      const letter = [...draft.trim()][0]
      if (letter) { t.pin = letter.toUpperCase(); save() }
    } else if (draft.trim() && draft !== e.draft) {
      const url = destination(draft)
      if (url) go(t, url)
    }
  }
  animate()
  render()
  focusPage()
}

function tabField (t) {
  const input = h('input', 'tab-field')
  input.value = ui.tabEdit.draft
  input.spellcheck = false
  if (ui.tabEdit.kind === 'pin') input.maxLength = 2
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finishTabEdit(true)
    else if (e.key === 'Escape') finishTabEdit(false)
    else if (e.key === 'Tab') { e.preventDefault(); finishTabEdit(true) }
    else return
    e.preventDefault()
  })
  input.addEventListener('input', () => { ui.tabEdit && (ui.tabEdit.draft = input.value) })
  input.addEventListener('blur', () => setTimeout(() => ui.tabEdit?.id === t.id && finishTabEdit(ui.tabEdit.kind !== 'address'), 0))
  return input
}

async function tabMenu (t) {
  const items = [
    ...(t.pin ? [{ id: 'letter', label: 'Change Letter' }, { id: 'unpin', label: 'Unpin' }] : [{ id: 'pin', label: 'Pin', enabled: !blank(t) }]),
    '-',
    { id: 'rename', label: 'Rename' },
    { id: 'duplicate', label: 'Duplicate', enabled: !blank(t) },
    { id: 'copy', label: 'Copy Address', enabled: !blank(t) },
    { id: 'markdown', label: 'Copy as Markdown Link', enabled: !blank(t) },
    { id: 'mute', label: t.muted ? 'Unmute Tab' : 'Mute Tab' },
    '-',
    { id: 'close', label: 'Close Tab' },
    { id: 'others', label: 'Close Other Tabs', enabled: tabs.length > 1 },
    { id: 'reopen', label: 'Reopen Closed Tab', enabled: ghosts.length > 0 }
  ]
  const chosen = await menu(items)
  if (!tab(t.id)) return
  const md = s => s.replace(/[\\[\]]/g, m => '\\' + m)
  ;({
    pin: () => pin(t),
    unpin: () => unpin(t),
    letter: () => { if (active !== t.id) select(t.id); startTabEdit(t, 'pin') },
    rename: () => { if (active !== t.id) select(t.id); startTabEdit(t, 'name') },
    duplicate: () => open(t.url, true),
    copy: () => { L.copy(t.url); toast('Address copied') },
    markdown: () => { L.copy(`[${md(label(t))}](${t.url})`); toast('Link copied') },
    mute: () => toggleMute(t),
    close: () => closeTab(t.id),
    others: () => closeOthers(t.id),
    reopen
  })[chosen]?.()
}

// ---- dragging to reorder ----

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
  if (drag.axis === 'grid') { ox = dx - (shift % cols) * stepX; oy = dy - Math.floor(shift / cols) * stepY }
  else if (drag.axis === 'x') ox = dx - shift * stepX
  else oy = dy - shift * stepY
  const el = elementFor(drag.t)
  if (el) {
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
      el.style.transform = ''
    }
    save()
  }
  drag = null
})

function dragSteps (t) {
  if (!sideMode()) return { stepX: (t.pin ? 30 : looseWidth) + 2, stepY: 1, cols: 1 }
  if (t.pin) return { stepX: grid.w + 4, stepY: grid.h + 4, cols: grid.cols }
  return { stepX: 1, stepY: 30, cols: 1 }
}

// ---- rendering: the strip ----

const TAB_WIDTH = 186
const TAB_MIN = 36
const TITLED = 80
const GAP = 2
const PIN_WIDTH = 30
const PLUS_WIDTH = 30
let looseWidth = TAB_WIDTH
const stripEls = new Map()
const sideEls = new Map()
const stripPill = h('div', 'pill', '<div class="read"></div>')
run.append(stripPill)
const plus = h('button', 'plus', icon('plus', 10, 1.5))
plus.title = 'New Tab  Ctrl+T'
plus.addEventListener('click', newTab)
run.append(plus)

function elementFor (t) {
  return (sideMode() ? sideEls : stripEls).get(t.id)
}

function markHTML (t, size = 15) {
  const src = favicon(t)
  if (src) return `<span class="mark has-icon" style="width:${size}px;height:${size}px"><img src="${esc(src)}" alt=""></span>`
  return `<span class="mark" style="width:${size}px;height:${size}px;font-size:${(size * 0.56).toFixed(1)}px;border-radius:${(size * 0.22).toFixed(1)}px">${esc(monogram(t))}</span>`
}

function glyphHTML (t, size = 16) {
  const src = prefs.glyph === 'icons' && favicon(t)
  if (src) return `<span class="glyph"><img src="${esc(src)}" alt="" style="width:${size}px;height:${size}px"></span>`
  return `<span class="glyph" style="font-size:${(size * 12 / 16).toFixed(1)}px">${esc(t.pin || monogram(t))}</span>`
}

const shyHTML = t => t.shy ? `<span class="shy" title="Private">${icon('eyeOff', 9, 1.3)}</span>` : ''

function statusHTML (t) {
  const speaker = !t.loading && (t.muted || t.audible)
  return `<span class="slot">${speaker
    ? `<button class="speaker" data-act="mute" title="${t.muted ? 'Unmute Tab' : 'Mute Tab'}">${icon(t.muted ? 'muted' : 'speaker', 8, 1.2)}</button>`
    : RING}</span>`
}

const RING = '<span class="ring"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.3" fill="none" stroke="currentColor" stroke-opacity="0.7" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="21.2 27.1" transform="rotate(-90 5 5)"/></svg></span>'

function slotHTML (t) {
  const speaker = t.muted || t.audible
    ? `<button class="speaker" data-act="mute" title="${t.muted ? 'Unmute Tab' : 'Mute Tab'}">${icon(t.muted ? 'muted' : 'speaker', 8, 1.2)}</button>`
    : ''
  const ring = t.loading && !speaker ? `<span class="ring"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.3" fill="none" stroke="currentColor" stroke-opacity="0.7" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="21.2 27.1" transform="rotate(-90 5 5)"/></svg></span>` : ''
  return `<span class="slot">${ring}${speaker}<button class="cross" data-act="close" title="Close Tab  Ctrl+W">${icon('x', 8, 1.5)}</button></span>`
}

function bindTab (el, t, axis) {
  el.addEventListener('pointerdown', e => startDrag(e, t, el, axis))
  el.addEventListener('click', e => {
    if (suppressClick) return
    const act = e.target.closest('[data-act]')?.dataset.act
    if (act === 'close') return closeTab(t.id)
    if (act === 'mute') return toggleMute(t)
    if (e.target.closest('.tab-field')) return
    if (active !== t.id) return select(t.id)
    if (t.pin) return
    startTabEdit(t, 'address')
  })
  el.addEventListener('dblclick', () => { if (t.pin && active === t.id) startTabEdit(t, 'pin') })
  el.addEventListener('auxclick', e => { if (e.button === 1) closeTab(t.id) })
  el.addEventListener('contextmenu', e => { e.preventDefault(); tabMenu(t) })
  el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault() })
}

/** Rebuilds a tab's insides only when what it shows changes shape; the title is patched in place. */
function fill (el, t, shape, build) {
  const editing = ui.tabEdit?.id === t.id
  const key = JSON.stringify([shape, editing, t.loading, t.audible, t.muted, favicon(t), t.pin, prefs.glyph, !!t.web, t.url && monogram(t)])
  if (el.dataset.key !== key) {
    el.dataset.key = key
    el.innerHTML = build()
    if (editing) {
      const title = el.querySelector('.title')
      if (title) title.replaceWith(tabField(t))
      else el.append(tabField(t))
    }
  }
  const title = el.querySelector('.title')
  if (title && title.textContent !== label(t)) title.textContent = label(t)
  el.title = label(t)
}

function renderStrip () {
  const width = strip.clientWidth
  const dot = $('#strip .space-dot')
  const far = $('#strip .helm').offsetWidth + 8 + GAP + $('#strip .doors').offsetWidth
  const dotWidth = dot && !dot.hidden ? dot.offsetWidth + GAP : 0
  const lead = 12 + $('#strip .lead').offsetWidth + GAP
  const room = Math.max(0, width - lead - dotWidth - 12 - PLUS_WIDTH - far - 3 * GAP)
  const pinned = tabs.filter(t => t.pin).length
  const loose = tabs.length - pinned
  looseWidth = loose === 0 ? TAB_WIDTH
    : Math.min(TAB_WIDTH, Math.max(TAB_MIN, (room - pinned * PIN_WIDTH - Math.max(0, tabs.length - 1) * GAP) / loose))
  const editWidth = Math.min(340, width - 60)
  let x = 0
  const seen = new Set()
  for (const t of tabs) {
    seen.add(t.id)
    let el = stripEls.get(t.id)
    if (!el) {
      el = h('div', 'tab entering')
      bindTab(el, t, 'x')
      stripEls.set(t.id, el)
      run.insertBefore(el, plus)
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')))
    }
    const editing = ui.tabEdit?.id === t.id && ui.tabEdit.kind !== 'pin'
    const w = t.pin ? PIN_WIDTH : editing ? Math.max(looseWidth, editWidth) : looseWidth
    const compact = !t.pin && !editing && w < TITLED
    el.classList.toggle('live', t.id === active)
    el.classList.toggle('pinned', !!t.pin)
    el.classList.toggle('compact', compact)
    el.classList.toggle('icons', prefs.glyph === 'icons' && !blank(t))
    el.classList.toggle('loading', t.loading)
    el.classList.toggle('asleep', !t.web)
    el.classList.toggle('editing', editing)
    el.style.left = `${x}px`
    el.style.width = `${w}px`
    if (t.pin) {
      fill(el, t, 'pin', () => ui.tabEdit?.id === t.id ? '' : glyphHTML(t))
    } else {
      fill(el, t, 'titled', () => `${markHTML(t)}${shyHTML(t)}<span class="title"></span>${slotHTML(t)}`)
    }
    if (t.id === active) {
      stripPill.style.left = `${x}px`
      stripPill.style.width = `${w}px`
    }
    x += w + GAP
  }
  for (const [id, el] of stripEls) if (!seen.has(id)) { el.remove(); stripEls.delete(id) }
  stripPill.hidden = !tab(active)
  plus.style.left = `${x}px`
  const content = x + PLUS_WIDTH
  run.style.width = `${Math.min(content, room + PLUS_WIDTH + GAP)}px`
  paintReading()
}

function revealActive () {
  const el = elementFor(current() || {})
  if (!el) return
  if (sideMode()) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  else if (run.scrollWidth > run.clientWidth) run.scrollTo({ left: el.offsetLeft - run.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' })
}

run.addEventListener('wheel', e => {
  if (run.scrollWidth <= run.clientWidth) return
  run.scrollLeft += e.deltaY + e.deltaX
  e.preventDefault()
}, { passive: false })

function paintReading () {
  const t = current()
  const show = prefs['tabs.reading'] && t && !t.pin && !blank(t)
  for (const pill of [stripPill, sidePill]) {
    const compact = pill === stripPill && looseWidth < TITLED
    pill.firstChild.style.width = show && !compact ? `${t.reading * 100}%` : '0'
  }
}

// ---- rendering: the sidebar ----

const pinsBox = $('#side .pins')
const rowsBox = $('#side .rows')
const sidePill = h('div', 'pill', '<div class="read"></div>')
const pinPill = h('div', 'pill')
rowsBox.append(sidePill)
pinsBox.append(pinPill)
const quiet = h('div', 'quiet', `<span class="glyph-box">${icon('plus', 10, 1.6)}</span><span>New tab</span>`)
quiet.addEventListener('click', newTab)
rowsBox.append(quiet)
let grid = { cols: 3, w: 20, h: 20 }

function renderSide () {
  const width = prefs['sidebar.width']
  const pinned = tabs.filter(t => t.pin)
  const loose = tabs.filter(t => !t.pin)
  const cols = Math.max(3, Math.floor((pinned.length + 1) / 2))
  const cw = Math.max(20, (width - 20 - (cols - 1) * 4) / cols)
  const ch = Math.min(34, cw)
  grid = { cols, w: cw, h: ch }
  const seen = new Set()
  pinned.forEach((t, i) => {
    seen.add(t.id)
    let el = sideEls.get(t.id)
    if (el && !el.classList.contains('pin')) { el.remove(); el = null }
    if (!el) {
      el = h('div', 'pin entering')
      bindTab(el, t, 'grid')
      sideEls.set(t.id, el)
      pinsBox.append(el)
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')))
    }
    const x = (i % cols) * (cw + 4)
    const y = Math.floor(i / cols) * (ch + 4)
    const s = Math.min(cw, ch)
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px`, height: `${ch}px`, borderRadius: `${(s * 9 / 34).toFixed(1)}px` })
    el.classList.toggle('live', t.id === active)
    el.classList.toggle('dim', !t.web)
    fill(el, t, 'pin', () => ui.tabEdit?.id === t.id ? '' : glyphHTML(t, Math.round(s * 16 / 34)))
    if (t.id === active) Object.assign(pinPill.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px`, height: `${ch}px` })
  })
  const rowsOfPins = Math.ceil(pinned.length / cols)
  pinsBox.style.height = pinned.length ? `${rowsOfPins * (ch + 4) - 4}px` : '0'
  pinsBox.style.marginBottom = pinned.length ? '10px' : '0'
  pinPill.hidden = !current()?.pin
  loose.forEach((t, i) => {
    seen.add(t.id)
    let el = sideEls.get(t.id)
    if (el && !el.classList.contains('row')) { el.remove(); el = null }
    if (!el) {
      el = h('div', 'row entering')
      bindTab(el, t, 'y')
      sideEls.set(t.id, el)
      rowsBox.insertBefore(el, quiet)
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')))
    }
    el.style.top = `${i * 30}px`
    el.classList.toggle('live', t.id === active)
    el.classList.toggle('icons', prefs.glyph === 'icons' && !blank(t))
    el.classList.toggle('busy', t.loading || t.audible || t.muted)
    el.classList.toggle('editing', ui.tabEdit?.id === t.id)
    fill(el, t, 'row', () => `${markHTML(t)}${shyHTML(t)}<span class="title"></span>${t.loading || t.audible || t.muted ? statusHTML(t) : ''}<button class="cross" data-act="close" title="Close Tab">${icon('x', 8, 1.6)}</button>`)
    if (t.id === active) sidePill.style.top = `${i * 30}px`
  })
  for (const [id, el] of sideEls) if (!seen.has(id)) { el.remove(); sideEls.delete(id) }
  sidePill.hidden = !current() || !!current().pin
  sidePill.style.left = '0'
  sidePill.style.right = '0'
  sidePill.style.width = 'auto'
  quiet.style.top = `${loose.length * 30}px`
  quiet.style.position = 'absolute'
  rowsBox.style.height = `${(loose.length + 1) * 30}px`
  paintReading()
}

// The resize edge: 176–440 px, a double-click puts it back to 232.
{
  const edge = $('#side .edge')
  let startX = 0
  let startW = 0
  edge.addEventListener('pointerdown', e => {
    edge.setPointerCapture(e.pointerId)
    edge.classList.add('held')
    startX = e.clientX
    startW = prefs['sidebar.width']
  })
  edge.addEventListener('pointermove', e => {
    if (!edge.classList.contains('held')) return
    prefs['sidebar.width'] = Math.round(Math.min(440, Math.max(176, startW + e.clientX - startX)))
    render()
  })
  edge.addEventListener('pointerup', () => { edge.classList.remove('held'); setPref('sidebar.width', prefs['sidebar.width']) })
  edge.addEventListener('dblclick', () => { animate(); setPref('sidebar.width', 232); render() })
}

// ---- doors ----

function door (name, title, fn) {
  const b = h('button', 'door', icon(name, 11, 1.5))
  b.title = title
  b.addEventListener('click', fn)
  return b
}

const helms = [...document.querySelectorAll('.helm')].map(box => {
  const doors = { back: door('back', 'Back  Ctrl+[', back), forward: door('forward', 'Forward  Ctrl+]', forward), reload: door('reload', 'Reload  Ctrl+R', () => reload()) }
  box.append(doors.back, doors.forward, doors.reload)
  return doors
})
// Where macOS keeps its traffic lights: the sidebar door. In the sidebar it folds it away; on the strip it brings the sidebar.
for (const box of document.querySelectorAll('.lead')) {
  box.append(door('sidebar', 'Sidebar  Ctrl+S', () => sideMode() ? fold() : toggleSidebar()))
}

function renderHelm () {
  const t = current()
  const empty = blank(t)
  for (const d of helms) {
    d.back.disabled = empty || !t.canBack
    d.forward.disabled = empty || !t.canForward
    d.reload.disabled = empty
    const loading = !!t?.loading
    if (d.reload.dataset.loading !== String(loading)) {
      d.reload.dataset.loading = String(loading)
      d.reload.innerHTML = icon(loading ? 'stop' : 'reload', 11, 1.5)
      d.reload.title = loading ? 'Stop  esc' : 'Reload  Ctrl+R'
    }
  }
}

// ---- rendering: the page and the frame ----

let stageInset = null
let barShown = false
let insetTimer = null

function renderStage () {
  const t = current()
  for (const x of tabs) if (x.web) x.web.classList.toggle('hidden', x !== t || !!x.failure)
  const failure = $('#failure')
  failure.hidden = !t?.failure
  if (t?.failure) $('.message', failure).textContent = t.failure

  const sideOn = sideMode() && !ui.folded && !ui.immersed
  const stripOn = !sideMode() && !ui.folded && !ui.immersed
  const inset = { left: sideOn ? prefs['sidebar.width'] : 0, top: (stripOn ? 52 : 0) + (barShown ? 30 : 0) }
  const apply = () => { stage.style.left = `${inset.left}px`; stage.style.top = `${inset.top}px` }
  // When the chrome grows the page keeps its size until the slide ends, so it isn't relaid out every frame.
  const grows = stageInset && (inset.left > stageInset.left || inset.top > stageInset.top)
  clearTimeout(insetTimer)
  if (grows) insetTimer = setTimeout(apply, glide.ms)
  else apply()
  stageInset = inset
  app.style.setProperty('--left', `${inset.left}px`)
}

let omniShown = false
function renderOmni () {
  const t = current()
  const show = ui.editing || blank(t)
  omni.classList.toggle('blank', blank(t))
  if (show !== omniShown) {
    omniShown = show
    omni.classList.remove('showing', 'leaving')
    if (show) {
      omni.hidden = false
      omni.classList.add('showing')
      if (blank(t)) omniInput.value = ui.typed
    } else {
      omni.classList.add('leaving')
      setTimeout(() => { if (!omniShown) omni.hidden = true }, 140)
    }
  }
  omniList.hidden = !show || !ui.offers.length
  omniList.innerHTML = ''
  ui.offers.forEach((offer, i) => {
    const row = h('div', 'offer' + (ui.picked === i ? ' picked' : ''))
    const lead = offer.kind === 'search' ? `<span class="glass">${icon('search', 10, 1.4)}</span>` : offer.kind === 'open' ? '<span class="dot"></span>' : ''
    row.innerHTML = `${lead}<span class="key">${esc(offer.key)}</span>${offer.title ? `<span class="title">${esc(offer.title)}</span>` : ''}`
    row.addEventListener('mousedown', e => e.preventDefault())
    row.addEventListener('click', () => take(offer))
    omniList.append(row)
  })
}

function render () {
  wasSide = sideMode()
  app.classList.toggle('side', sideMode())
  app.classList.toggle('folded', ui.folded)
  app.classList.toggle('peeking', ui.peeking)
  app.classList.toggle('immersed', ui.immersed)
  app.style.setProperty('--side', `${prefs['sidebar.width']}px`)
  if (sideMode()) renderSide()
  else renderStrip()
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

function fold () {
  ui.folded = !ui.folded
  ui.peeking = false
  render()
}

let wasSide = null
window.addEventListener('resize', () => {
  if (sideMode() === wasSide) return
  wasSide = sideMode()
  stripEls.forEach(el => el.remove()); stripEls.clear()
  sideEls.forEach(el => el.remove()); sideEls.clear()
  render()
})

function toggleSidebar () {
  setPref('sidebar', !prefs.sidebar)
  ui.folded = false
  ui.peeking = false
  ui.tabEdit = null
  stripEls.forEach(el => el.remove()); stripEls.clear()
  sideEls.forEach(el => el.remove()); sideEls.clear()
  render()
  revealActive()
}

// ---- find ----

const findBox = $('#find')
const findInput = $('#find input')
$('#find .up').innerHTML = icon('up', 9, 1.6)
$('#find .down').innerHTML = icon('down', 9, 1.6)
$('#find .close').innerHTML = icon('x', 9, 1.6)

function openFind () {
  const t = current()
  if (!t?.ready || t.failure) return
  ui.finding = true
  findBox.hidden = false
  findInput.focus()
  findInput.select()
  render()
}

function closeFind () {
  if (!ui.finding) return
  ui.finding = false
  findBox.hidden = true
  findBox.classList.remove('missed')
  current()?.ready && current().web.stopFindInPage('clearSelection')
  render()
  focusPage()
}

function findStep (forward) {
  const t = current()
  if (!ui.finding) return openFind()
  if (t?.ready && findInput.value) t.web.findInPage(findInput.value, { forward, findNext: true })
}

findInput.addEventListener('input', () => {
  const t = current()
  if (!t?.ready) return
  if (findInput.value) t.web.findInPage(findInput.value)
  else { t.web.stopFindInPage('clearSelection'); findBox.classList.remove('missed') }
})
findInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') findStep(!e.shiftKey)
  else if (e.key === 'Escape') closeFind()
  else return
  e.preventDefault()
})
$('#find .up').addEventListener('click', () => findStep(false))
$('#find .down').addEventListener('click', () => findStep(true))
$('#find .close').addEventListener('click', closeFind)

// ---- toast ----

let toastTimer = null
function toast (text) {
  const el = $('#toast')
  el.textContent = text
  el.hidden = false
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.animation = ''
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.hidden = true }, 1700)
}

// ---- panels, bookmarks, and the bits around the page ----

const markFor = (url, size) => markHTML({ url, favicon: null }, size)
const panels = createPanels({
  L, prefs, setPref, history, bookmarks, toast,
  version: L.info.version, home: L.info.home, downloadsFolder: L.info.downloads,
  markFor,
  changed: () => render(),
  currentHost: () => bareHost(current()?.url || ''),
  currentURL: () => current()?.url || '',
  startVeiling: () => startVeiling(),
  peek: (css, selector) => current()?.ready && current().web.send('veil', css === null ? 'unpeek' : 'peek', css, selector),
  historyTake: list => { for (const v of list) history.take(v); history.flush() },
  createSpace: (name, shares) => createSpace(name, shares),
  renameSpace: name => { const here = spaces.find(s => s.id === spaceId); if (name.trim()) { here.name = name.trim(); saveSpaces(); render() } },
  reload: () => reload(),
  setSidebar: on => { if (!!prefs.sidebar !== on) toggleSidebar() },
  bookmarksChanged: () => render(),
  prefsChanged: key => {
    if (['downloads', 'downloads.ask', 'shield', 'shield.paused', 'capture'].includes(key)) configure()
    if (key === 'sidebar.hides') ui.folded = !!prefs['sidebar.hides'] && prefs.sidebar
    if (key === 'spaces' && !prefs.spaces) leaveSpaces()
    if (key === 'glyph') { stripEls.forEach(el => { el.dataset.key = '' }); sideEls.forEach(el => { el.dataset.key = '' }) }
    render()
  },
  openURL: (url, newTab) => {
    const t = current()
    if (newTab || !t) open(url, true)
    else go(t, url)
  }
})

function bookmarkPage () {
  const t = current()
  if (!t || !isWeb(t.url)) return
  toast(bookmarks.add(t.url, label(t)) ? 'Bookmarked' : 'Already in your bookmarks')
  render()
}

function bookmarkItems (list) {
  return list.map(n => n.children
    ? { id: '', label: n.title, items: n.children.length ? bookmarkItems(n.children) : [{ id: '', label: 'Empty', enabled: false }] }
    : { id: `url:${n.url}`, label: n.title.length > 60 ? n.title.slice(0, 58) + '…' : n.title })
}

// BookmarksDropdown: 280 wide, the outline, then "Add This Page" and "Manage Bookmarks…".
let dropdown = null
const openFolders = new Set()

function closeDropdown () {
  dropdown?.remove()
  dropdown = null
  document.removeEventListener('mousedown', outsideDropdown, true)
}
function outsideDropdown (e) {
  if (!e.target.closest('.dropdown, .menu, .menu-scrim') && !e.target.closest('.door.bookmarks')) closeDropdown()
}

function outlineRows (list, depth, into, pick) {
  for (const node of list) {
    const folder = !!node.children
    const open = openFolders.has(node.id)
    const row = h('div', 'outline-row')
    row.style.paddingLeft = `${depth * 18 + 10}px`
    const count = folder ? bookmarks.countIn(node) : 0
    row.innerHTML = folder
      ? `<span class="chevron${open ? ' open' : ''}">${icon('forward', 9, 2)}</span><span class="mark">${icon('folderFill', 9, 1)}</span><span class="name">${esc(node.title)}</span>${count ? `<span class="count">${count}</span>` : ''}`
      : `<span class="chevron-space"></span>${markFor(node.url, 15)}<span class="name">${esc(node.title)}</span>`
    row.addEventListener('click', () => {
      if (!folder) return pick(node.url)
      open ? openFolders.delete(node.id) : openFolders.add(node.id)
      paintDropdown()
    })
    into.append(row)
    if (folder && open) {
      if (node.children.length) outlineRows(node.children, depth + 1, into, pick)
      else into.append(Object.assign(h('div', 'outline-empty', 'Empty'), { style: `padding-left:${(depth + 1) * 18 + 26}px` }))
    }
  }
}

let dropdownAt = null
function paintDropdown () {
  if (!dropdown) return
  dropdown.innerHTML = ''
  if (!bookmarks.tree.length) dropdown.append(h('div', 'none', 'No bookmarks yet'))
  else {
    const box = h('div', 'outline outline-list')
    outlineRows(bookmarks.tree, 0, box, url => { closeDropdown(); go(current(), url) })
    dropdown.append(box)
  }
  const feet = h('div', 'feet')
  const foot = (glyph, label, fn) => {
    const line = h('div', 'foot-line', `${glyph ? icon(glyph, 11, 1.5) : '<span class="gap"></span>'}<span>${label}</span>`)
    line.addEventListener('click', () => { closeDropdown(); fn() })
    feet.append(line)
  }
  foot('bookmark', 'Add This Page', bookmarkPage)
  foot(null, 'Manage Bookmarks…', () => panels.open('bookmarks'))
  dropdown.append(feet)
  const { door, side } = dropdownAt
  const r = door.getBoundingClientRect()
  if (side) Object.assign(dropdown.style, { left: `${r.right + 8}px`, top: `${Math.max(8, r.bottom - dropdown.offsetHeight)}px` })
  else Object.assign(dropdown.style, { left: `${Math.max(8, r.right - 280)}px`, top: `${r.bottom + 6}px` })
}

function bookmarksDoor (e) {
  if (dropdown) return closeDropdown()
  dropdownAt = { door: e.currentTarget, side: !!e.currentTarget.closest('#side') }
  dropdown = h('div', 'dropdown')
  $('#app').append(dropdown)
  paintDropdown()
  document.addEventListener('mousedown', outsideDropdown, true)
}

async function moreDoor (at) {
  const chosen = await menu([
    { id: 'new-tab', label: 'New Tab', keys: 'Ctrl+T' },
    { id: 'reopen', label: 'Reopen Closed Tab', keys: 'Ctrl+Shift+T', enabled: ghosts.length > 0 },
    '-',
    { id: 'history', label: 'History', keys: 'Ctrl+H' },
    { id: 'downloads', label: 'Downloads', keys: 'Ctrl+J' },
    { id: 'bookmarks', label: 'Bookmarks', keys: 'Ctrl+Shift+O' },
    { id: 'passwords', label: 'Passwords' },
    '-',
    { id: 'private-tab', label: 'New Private Tab', keys: 'Ctrl+Shift+N' },
    { id: 'veil', label: 'Hide Something…', keys: 'Ctrl+Shift+H', enabled: !!current()?.ready },
    { id: 'hidden', label: 'Hidden on This Site…', keys: 'Ctrl+Shift+U', enabled: isWeb(current()?.url) },
    '-',
    { id: 'toggle-sidebar', label: 'Tabs in a Sidebar', checked: !!prefs.sidebar, keys: 'Ctrl+Shift+S' },
    { id: 'bar', label: 'Show Bookmarks Bar', checked: !!prefs['bookmarks.bar'] },
    '-',
    { id: 'settings', label: 'Settings…', keys: 'Ctrl+,' },
    { id: 'quit', label: 'Quit', keys: 'Ctrl+Q' }
  ])
  if (chosen === 'bar') { setPref('bookmarks.bar', !prefs['bookmarks.bar']); render() } else if (chosen) actions[chosen]?.()
}

for (const box of [$('#strip .doors'), $('#side .foot-row')]) {
  const b = door('bookmark', 'Bookmarks', bookmarksDoor)
  b.classList.add('bookmarks')
  const gear = door('gear', 'Settings  Ctrl+,', () => panels.toggle('settings'))
  gear.classList.add('settings-door')
  box.append(b, gear)
}
// What the macOS menu bar holds: a right-click on the empty chrome, or F10.
for (const empty of [$('#strip'), $('#side .band'), $('#side .foot-row'), $('#side .scroll')]) {
  empty.addEventListener('contextmenu', e => {
    if (e.target.closest('.tab, .row, .pin, .door, .light, .plus, .quiet')) return
    e.preventDefault()
    moreDoor({ x: e.clientX, y: e.clientY })
  })
}

const bar = $('#bar')
let barKey = ''
function renderBar () {
  const shown = prefs['bookmarks.bar'] && bookmarks.tree.length > 0 && !ui.folded && !ui.immersed
  bar.hidden = !shown
  if (!shown) return false
  bar.style.left = `${sideMode() ? prefs['sidebar.width'] : 0}px`
  bar.style.top = `${sideMode() ? 0 : 52}px`
  const key = JSON.stringify(bookmarks.tree) + [...icons.keys()].length
  if (key === barKey) return true
  barKey = key
  bar.innerHTML = ''
  for (const node of bookmarks.tree) {
    const item = h('button', 'bar-item')
    item.innerHTML = node.children
      ? `${icon('folder', 10.5, 1.3)}<span class="name">${esc(node.title)}</span>${icon('down', 7.5, 1.6)}`
      : `${markFor(node.url, 13)}<span class="name">${esc(node.title)}</span>`
    item.title = node.url || node.title
    item.addEventListener('click', async () => {
      if (!node.children) return go(current(), node.url)
      const r = item.getBoundingClientRect()
      const chosen = await menu(node.children.length ? bookmarkItems(node.children) : [{ id: '', label: 'Empty', enabled: false }], { x: Math.round(r.left), y: Math.round(r.bottom + 2) })
      if (chosen?.startsWith('url:')) go(current(), chosen.slice(4))
    })
    item.addEventListener('auxclick', e => { if (e.button === 1 && node.url) open(node.url, false) })
    item.addEventListener('contextmenu', async e => {
      e.preventDefault()
      const chosen = await menu([...(node.url ? [{ id: 'tab', label: 'Open in New Tab' }] : []), { id: 'manage', label: 'Manage Bookmarks…' }, '-', { id: 'remove', label: 'Remove' }])
      if (chosen === 'tab') open(node.url, true)
      if (chosen === 'manage') panels.open('bookmarks')
      if (chosen === 'remove') { bookmarks.remove(node.id); render() }
    })
    bar.append(item)
  }
  return true
}

const bubble = $('#bubble')
let bubbleTimer = null
function hoverLink (url) {
  clearTimeout(bubbleTimer)
  if (!prefs['links.show'] || !url) {
    bubbleTimer = setTimeout(() => { bubble.hidden = true }, 120)
    return
  }
  bubble.textContent = url.replace(/^https?:\/\/(www\.)?/, '')
  bubble.hidden = false
}

const asks = $('#asks')
L.onAsk((id, host, thing) => {
  const el = h('div', 'ask capture', `${icon(/micro/.test(thing) ? 'mic' : 'camera', 11, 1.5)}<span>${esc(host)} wants to use your ${esc(thing)}</span>`)
  const answer = allow => { L.answer(id, allow); el.remove() }
  const allow = h('button', 'allow', 'Allow')
  const deny = h('button', 'deny', 'Don’t allow')
  allow.addEventListener('click', () => answer(true))
  deny.addEventListener('click', () => answer(false))
  el.append(allow, deny)
  asks.insertBefore(el, hint)
})
L.onRemember((key, allow) => { prefs.capture = { ...prefs.capture, [key]: allow }; setPref('capture', prefs.capture) })

// ---- hiding things on a page ----

const hint = h('div', 'hint', 'Click anything to hide it&nbsp;&nbsp;&nbsp;Ctrl+Z undo&nbsp;&nbsp;&nbsp;esc done')
hint.hidden = true
$('#asks').append(hint)

function startVeiling () {
  const t = current()
  if (!t?.ready || !isWeb(t.url)) return
  panels.close()
  ui.veiling = true
  t.web.send('veil', 'on')
  hint.hidden = false
  render()
  t.web.focus()
}

function stopVeiling () {
  ui.veiling = false
  hint.hidden = true
  for (const t of tabs) if (t.ready) t.web.send('veil', 'off')
  render()
}

function veiled (t, said) {
  if (said.trouble) return toast('That one can’t be hidden')
  L.veil('hide', t.url, said)
}

// ---- sign-ins: offered a place in the keyring once they worked, filled from a list under the box ----

function formSaid (t, said) {
  if (said.kind === 'form') t.hasForm = true
  if (said.kind === 'submit' && !t.shy && prefs['passwords.save']) {
    t.signin = { url: t.url, user: said.user, password: said.password, at: Date.now() }
  }
  if (said.kind === 'settled') offerToSave(t)
  if (said.kind === 'focus' && t.id === active) accountsFor(t, said.rect)
}

// A sign-in counts as working once the page moved on and no password box came back.
function signInSettles (t) {
  if (!t.signin) return
  setTimeout(() => { if (!t.hasForm) offerToSave(t) }, 1500)
}

async function offerToSave (t) {
  const s = t.signin
  t.signin = null
  if (!s || Date.now() - s.at > 45000) return
  const host = bareHost(s.url)
  if (!host || prefs['passwords.never'].includes(host)) return
  const question = await L.vault('question', host, s.user, s.password)
  if (!question) return
  const words = question === 'update' ? `Update the password for ${esc(s.user)} on ${esc(host)}?`
    : s.user ? `Save the password for ${esc(s.user)} on ${esc(host)}?` : `Save this password for ${esc(host)}?`
  const el = h('div', 'ask', `<span>${words}</span>`)
  const button = (label, cls, fn) => { const b = h('button', cls, label); b.addEventListener('click', () => { el.remove(); fn() }); el.append(b) }
  button(question === 'update' ? 'Update' : 'Save', 'allow', async () => {
    const result = await L.vault('save', host, s.user, s.password)
    toast(result === 'refused' ? 'The keyring refused it' : `Password ${result === 'updated' ? 'updated' : 'saved'} for ${host}`)
  })
  button('Not now', 'deny', () => {})
  if (question !== 'update') button('Never here', 'deny', () => setPref('passwords.never', [...prefs['passwords.never'], host].sort()))
  $('#asks').insertBefore(el, hint)
}

const accounts = h('div', 'accounts')
accounts.hidden = true
$('#app').append(accounts)
let accountsTimer = null
// Refocusing the box after a fill would bring the list straight back.
let accountsQuietUntil = 0
let accountsTab = null

async function accountsFor (t, rect) {
  clearTimeout(accountsTimer)
  if (!rect || !prefs['passwords.fill'] || t.shy || Date.now() < accountsQuietUntil) {
    accountsTimer = setTimeout(() => { accounts.hidden = true }, 200)
    return
  }
  const logins = await L.vault('matching', bareHost(t.url))
  if (!logins.length || t.id !== active || panels.kind || Date.now() < accountsQuietUntil) { accounts.hidden = true; return }
  accountsTab = t.id
  const box = t.web.getBoundingClientRect()
  const zoom = t.web.getZoomFactor()
  accounts.style.left = `${box.left + rect.x * zoom}px`
  accounts.style.top = `${box.top + (rect.y + rect.h) * zoom + 6}px`
  accounts.style.width = `${Math.max(240, Math.min(360, rect.w * zoom))}px`
  accounts.innerHTML = ''
  for (const login of logins) {
    const row = h('button', 'account', `<span class="badge">${esc((login.user || login.host).charAt(0).toUpperCase())}</span><span class="who"><span class="user">${esc(login.user || 'No name')}</span><span class="host">${esc(login.host)}</span></span>`)
    row.addEventListener('mousedown', e => e.preventDefault())
    row.addEventListener('click', async () => {
      accounts.hidden = true
      accountsQuietUntil = Date.now() + 1000
      const password = await L.vault('reveal', login.host, login.user)
      if (password !== null && t.ready) t.web.send('fill', login.user, password)
      t.web.focus()
    })
    accounts.append(row)
  }
  accounts.append(h('div', 'from', `${icon('key', 9, 1.5)}<span>From your keyring</span>`))
  accounts.hidden = false
}

// ---- sleep: tabs left alone for half an hour give their memory back ----

const SLEEP_AFTER = () => prefs['sleep.after'] || 1800

function stays (t) {
  const opener = current()?.opener
  return t.id === active || t.pin || !t.web || !t.ready || t.loading || t.audible || t.id === opener || t.signin
}

function hasUnsaved (t) {
  return new Promise(resolve => {
    const done = v => { t.answer = null; resolve(v) }
    t.answer = done
    t.web.send('unsaved?')
    setTimeout(() => t.answer === done && done(true), 1000)
  })
}

const within = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))])

async function sleepTab (t) {
  if (t.falling || stays(t)) return
  t.falling = true
  try {
    if (await hasUnsaved(t) || stays(t)) return
    // A page that isn't on screen may never hand over a picture; it sleeps without one then.
    const picture = await within(L.snapshot(t.web.getWebContentsId()), 1500)
    if (stays(t)) return
    // ponytail: waking reloads the address, so back/forward is lost; webviews can't take history back
    // (navigationHistory.restore needs a page that never loaded, and a webview only attaches with a src).
    t.picture = picture
    unload(t)
    render()
  } finally {
    t.falling = false
  }
}

// Checked every minute, or more often when the hidden sleep.after setting is short.
;(function check () {
  if (prefs['tabs.sleep']) {
    const due = now() - SLEEP_AFTER()
    const all = tabs.concat(...[...parked.values()].map(r => r.tabs))
    all.filter(t => t.touched < due && !stays(t)).sort((a, b) => a.touched - b.touched).forEach(sleepTab)
  }
  setTimeout(check, Math.min(60, Math.max(5, SLEEP_AFTER() / 4)) * 1000)
})()

// The picture a tab fell asleep on, over the page until it has drawn again.
const coverEl = h('img', 'cover')
coverEl.hidden = true
stage.append(coverEl)
let coverTimer = null
function cover (t) {
  if (t.id !== active || !t.picture) return
  coverEl.src = t.picture
  coverEl.hidden = false
  coverEl.classList.remove('going')
  clearTimeout(coverTimer)
  coverTimer = setTimeout(() => uncover(t), 4000)
}
function uncover (t) {
  t.picture = null
  if (coverEl.hidden) return
  coverEl.classList.add('going')
  setTimeout(() => { coverEl.hidden = true }, 200)
}

// ---- spaces ----

const SPACE_ICONS = [['home', 'Home'], ['briefcase', 'Work'], ['code', 'Code'], ['terminal', 'Terminal'], ['sparkles', 'AI'],
  ['book', 'Reading'], ['cart', 'Shopping'], ['music', 'Music'], ['film', 'Film'], ['game', 'Games'], ['heart', 'Personal'],
  ['leaf', 'Nature'], ['plane', 'Travel'], ['camera', 'Photos'], ['palette', 'Art'], ['coffee', 'Café']]

function rowFrom (saved, space) {
  const row = (saved?.tabs || []).map(e => makeTab({ url: e.url, title: e.title || null, pin: e.pin || null, name: e.name || null, space }))
  return row.length ? row : [makeTab({ space })]
}

const pauseMedia = "document.querySelectorAll('video,audio').forEach(m => m.pause())"
let slideDir = 0

async function enter (id) {
  const target = spaces.find(s => s.id === id)
  if (!target || id === spaceId) return
  slideDir = spaces.indexOf(target) > spaces.findIndex(s => s.id === spaceId) ? 1 : -1
  L.writeNow(sessionName(spaceId), snapshot())
  for (const t of tabs) {
    if (!t.ready) continue
    t.web.classList.add('hidden')
    t.web.executeJavaScript(pauseMedia).catch(() => {})
  }
  parked.set(spaceId, { tabs: [...tabs], active })
  let row = parked.get(id)
  parked.delete(id)
  if (!row) {
    const saved = await L.read(sessionName(id))
    const list = rowFrom(saved, id)
    row = { tabs: list, active: list[Math.min(saved?.active || 0, list.length - 1)].id }
  }
  tabs.splice(0, tabs.length, ...row.tabs)
  spaceId = id
  setPref('space.current', id)
  ui.tabEdit = null
  ui.editing = false
  slide()
  select(row.active && tab(row.active) ? row.active : tabs[0].id)
  toast(target.name)
}

// The row leaves the way the swipe went and the next one comes in behind it.
function slide () {
  const box = sideMode() ? $('#side .scroll') : run
  const axis = sideMode() ? 'X' : 'Y'
  const far = sideMode() ? prefs['sidebar.width'] : 52
  box.animate([{ transform: `translate${axis}(${slideDir * far}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 220, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)' })
}

function leaveSpaces () {
  if (spaceId !== 'personal') enter('personal')
  for (const [, row] of parked) row.tabs.forEach(unload)
  parked.clear()
}

async function createSpace (name, shares) {
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
  if (spaceId === id) await enter('personal')
  parked.get(id)?.tabs.forEach(unload)
  parked.delete(id)
  L.remove(sessionName(id))
  if (!space.shares) L.forgetPartition(`persist:space-${id}`)
  spaces.splice(spaces.indexOf(space), 1)
  saveSpaces()
  render()
}

async function spaceMenu (at) {
  const here = spaces.find(s => s.id === spaceId)
  const i = spaces.indexOf(here)
  const chosen = await menu([
    ...spaces.map((s, n) => ({ id: `go:${s.id}`, label: s.name, checked: s.id === spaceId, keys: n < 9 ? `Alt+${n + 1}` : undefined })),
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

function renderDots () {
  const here = spaces.find(s => s.id === spaceId)
  for (const dot of dots) {
    dot.hidden = !prefs.spaces
    if (dot.dataset.icon !== here.icon) { dot.dataset.icon = here.icon; dot.innerHTML = icon(here.icon, 12, 1.4) }
    dot.title = `${here.name} — Alt+1–9, or two fingers across the tabs, to switch`
  }
}

// Two fingers across the column (or a wheel notch over the strip) switch to the neighbouring space.
let swiped = 0
let swipeLock = 0
function swipe (e, along) {
  if (!prefs.spaces || spaces.length < 2 || ui.folded) return
  if (Date.now() < swipeLock) return e.preventDefault()
  const delta = along === 'x' ? e.deltaX : e.deltaY
  if (along === 'x' && Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5) return
  e.preventDefault()
  swiped += delta
  const threshold = along === 'x' ? 50 : 31
  if (Math.abs(swiped) < threshold) { clearTimeout(swipe.reset); swipe.reset = setTimeout(() => { swiped = 0 }, 200); return }
  const i = spaces.findIndex(s => s.id === spaceId) + Math.sign(swiped)
  swiped = 0
  swipeLock = Date.now() + 400
  if (spaces[i]) enter(spaces[i].id)
}
$('#side .scroll').addEventListener('wheel', e => swipe(e, 'x'), { passive: false })
run.addEventListener('wheel', e => { if (run.scrollWidth <= run.clientWidth) swipe(e, 'y') }, { passive: false })

// ---- reading mode, the floating video, and a peek at a link ----

async function toggleReader () {
  const t = current()
  if (!t?.ready || t.failure) return
  if (t.reader) { t.reader = false; return t.web.reload() }
  const said = await t.web.executeJavaScript(READER).catch(() => 'none')
  if (said === 'read') t.reader = true
  else toast('Nothing to read on this page')
}

// Chromium's own picture-in-picture window; on Wayland the compositor decides whether it stays on top.
const FLOAT = `(async () => {
  if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'back' }
  const videos = [...document.querySelectorAll('video')].filter(v => v.readyState > 0 && !v.disablePictureInPicture)
  const playing = videos.filter(v => !v.paused)
  const pick = (playing.length ? playing : videos).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
  if (!pick) return 'none'
  await pick.requestPictureInPicture()
  return 'floating'
})()`

async function float () {
  const t = current()
  if (!t?.ready) return
  const said = await t.web.executeJavaScript(FLOAT, true).catch(() => 'none')
  if (said === 'none') toast('Nothing is playing here')
}

const peekBox = h('div', 'peek', '<div class="peek-dim"></div><div class="peek-frame"><div class="peek-page"></div><div class="peek-doors"></div></div>')
peekBox.hidden = true
$('#app').append(peekBox)
let peekView = null

function peek (url) {
  closePeek()
  peekView = document.createElement('webview')
  peekView.setAttribute('partition', current()?.shy ? `leech-private-${current().id}` : partitionOf(spaceId))
  peekView.setAttribute('allowpopups', '')
  peekView.setAttribute('preload', new URL('guest.js', location.href).href)
  peekView.src = url
  $('.peek-page', peekBox).append(peekView)
  Object.assign(peekBox.style, { left: stage.style.left, top: stage.style.top })
  peekBox.hidden = false
  ui.peeking = false
  render()
}

function closePeek () {
  if (!peekView) return
  peekView.remove()
  peekView = null
  peekBox.hidden = true
  render()
}

// Keeps the peeked page as a tab after the current one; it loads again there.
function expandPeek () {
  if (!peekView) return
  const url = peekView.getURL?.() || peekView.src
  closePeek()
  open(url, true)
}

$('.peek-dim', peekBox).addEventListener('click', closePeek)
{
  const knob = (name, title, fn) => { const b = h('button', 'knob', icon(name, 11, 1.8)); b.title = title; b.addEventListener('click', fn); return b }
  $('.peek-doors', peekBox).append(knob('x', 'Close (esc)', closePeek), knob('expand', 'Open as a tab', expandPeek))
}

// ---- the site card: under the address being edited, as in SiteCard.swift ----

let card = null
function closeCard () {
  card?.remove()
  card = null
}

function siteCard (t, field) {
  closeCard()
  if (!field || ui.tabEdit?.id !== t.id) return
  const original = field.value
  const url = t.url || ''
  const safe = url.startsWith('https:') && !t.failure
  const site = bareHost(url) || (url.startsWith('file:') ? 'File' : url.split(':')[0])
  card = h('div', 'menu site-card')
  const row = (label, keys, fn, more = false) => {
    const r = h('div', 'menu-row', `<span class="menu-label">${esc(label)}</span>${keys ? `<span class="menu-keys">${esc(keys)}</span>` : ''}${more ? `<span class="menu-more">${icon('forward', 10, 2.4)}</span>` : ''}`)
    r.addEventListener('mousedown', e => e.preventDefault())
    r.addEventListener('click', fn)
    card.append(r)
  }
  const front = () => {
    card.innerHTML = `<div class="menu-header">${esc(site)}</div>`
    if (/^https?:/.test(url)) row(safe ? 'Connection is secure' : 'Connection is not secure', '', connection, true)
    row('Copy Address', 'Ctrl+Alt+C', () => { L.copy(url); toast('Address copied'); finishTabEdit(false) })
    card.insertAdjacentHTML('beforeend', '<div class="menu-rule"></div>')
    row('Print…', 'Ctrl+P', () => { finishTabEdit(false); actions.print() })
    const zoomRow = h('div', 'menu-row zoom-row', `<span class="menu-label">Zoom</span>`)
    const level = h('button', 'zoom-level', `${Math.round((t.ready ? t.web.getZoomFactor() : 1) * 100)}%`)
    const step = (glyph, title, f) => { const b = h('button', 'zoom-step', icon(glyph, 10, 2)); b.title = title; b.addEventListener('click', () => { zoom(f); level.textContent = `${Math.round(t.web.getZoomFactor() * 100)}%` }); return b }
    level.addEventListener('click', () => { zoom(null); level.textContent = '100%' })
    zoomRow.append(step('minimize', 'Zoom Out  Ctrl+-', 1 / 1.1), level, step('plus', 'Zoom In  Ctrl++', 1.1))
    zoomRow.addEventListener('mousedown', e => e.preventDefault())
    card.append(zoomRow)
  }
  const connection = () => {
    card.innerHTML = `<div class="menu-header">${esc(site)}</div><div class="card-detail">${safe
      ? 'Your information (for example, passwords or credit card numbers) is private when it is sent to this site.'
      : 'Don’t enter passwords or credit card numbers here: anything sent to this site can be read on the way.'}</div><div class="menu-rule"></div>`
    row('Back', '', front)
  }
  front()
  $('#app').append(card)
  const r = field.getBoundingClientRect()
  card.style.left = `${Math.max(6, r.left - 12)}px`
  card.style.top = `${r.bottom + 12}px`
  // Typing an address puts the card away, as in the original.
  field.addEventListener('input', () => { if (field.value !== original) closeCard() }, { once: true })
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

// ---- F11: the window takes the screen and the tabs fold away until the pointer reaches the edge ----

let foldedBefore = false
L.onFullscreen(on => {
  if (on) { foldedBefore = ui.folded; ui.folded = true } else ui.folded = foldedBefore
  ui.peeking = false
  render()
})

// ---- keys ----

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

const actions = {
  'new-tab': () => newTab(),
  'private-tab': () => newTab(true),
  reopen,
  'close-tab': () => active !== null && closeTab(active),
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
L.onPageMenu(async (items, x, y, contentsId) => {
  const view = [...tabs.map(t => t.web), peekView].find(w => w && w.getWebContentsId?.() === contentsId)
  const box = view?.getBoundingClientRect() || { left: 0, top: 0 }
  const chosen = await menu(items, { x: box.left + x, y: box.top + y })
  if (chosen) L.pageMenuChosen(chosen)
})
L.onOpenTab((url, foreground) => {
  const t = current()
  if (foreground && blank(t) && !ui.typed) return go(t, url)
  open(url, foreground)
})
L.onSearch(text => { const url = searchURL(text); if (url) open(url, true) })
L.onToast(toast)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) escape() })

// ---- session ----

function snapshot () {
  const list = tabs.filter(t => isWeb(t.url) && !t.shy)
  const out = list.map(t => {
    const entry = { url: t.url }
    if (t.title) entry.title = t.title
    if (t.pin) entry.pin = t.pin
    if (t.name) entry.name = t.name
    return entry
  })
  return { tabs: out, active: Math.max(0, list.findIndex(t => t.id === active)) }
}

let saveTimer = null
function saveLater () {
  if (saveTimer) return
  saveTimer = setTimeout(() => { saveTimer = null; save() }, 1200)
}
function save () { L.write(sessionName(spaceId), snapshot()) }

L.onFlush(() => {
  L.writeNow(sessionName(spaceId), snapshot())
  history.flush(true)
})

const firstSession = spaceId === 'personal' ? savedSession : await L.read(sessionName(spaceId))
tabs.push(...rowFrom(firstSession, spaceId))
render()
select(tabs[Math.min(firstSession?.active || 0, tabs.length - 1)].id)
