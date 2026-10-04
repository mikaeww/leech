// The Chromium build's window.leech: calls go to C++ through chrome.send, events come back through
// leechEvent. Pages are real Chromium tabs; a <leech-view> in the stage stands where one should be.

const calls = new Map()
let nextCall = 0
window.leechReply = (id, result) => { calls.get(id)?.(result); calls.delete(id) }
const call = (method, ...args) => new Promise(resolve => {
  const id = ++nextCall
  calls.set(id, resolve)
  chrome.send('leech', [id, method, ...args])
})

const listeners = new Map()
const on = name => fn => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn) }
window.leechEvent = (name, args) => { for (const fn of listeners.get(name) || []) fn(...args) }

const views = new Map()
let nextView = 0

class LeechView extends HTMLElement {
  bind (id) {
    this.tab = id || `v${++nextView}`
    this.created = !!id
    this.state = { canGoBack: false, canGoForward: false, url: '' }
    this.zoom = 1
    views.set(this.tab, this)
    // A tab that exists already: one Chromium opened, or one that slept. A discarded one loads again from its history.
    if (id) this.run('wake')
  }

  run (what, ...args) { return this.created ? call('tab', this.tab, what, ...args) : Promise.resolve(null) }

  set src (url) {
    if (!this.created) {
      this.created = true
      this.state.url = url
      call('tab-create', this.tab, url, false)
    } else if (url !== this.state.url) this.loadURL(url)
  }

  get src () { return this.state.url }
  getURL () { return this.state.url }
  getWebContentsId () { return this.tab }
  canGoBack () { return this.state.canGoBack }
  canGoForward () { return this.state.canGoForward }
  loadURL (url) { this.state.url = url; return this.run('loadURL', url) }
  stop () { this.run('stop') }
  reload () { this.run('reload') }
  reloadIgnoringCache () { this.run('reloadIgnoringCache') }
  goBack () { this.run('goBack') }
  goForward () { this.run('goForward') }
  setAudioMuted (muted) { this.run('setAudioMuted', !!muted) }
  getZoomFactor () { return this.zoom }
  setZoomFactor (factor) { this.zoom = factor; this.run('setZoomFactor', factor) }
  executeJavaScript (code) { return this.run('executeJavaScript', code) }
  findInPage (text, options = {}) { this.run('findInPage', text, { forward: options.forward !== false, findNext: !!options.findNext }) }
  stopFindInPage () { this.run('stopFindInPage') }
  print () { this.run('print') }
  openDevTools () { this.run('openDevTools') }
  focus () { this.run('focus') }
  // To the page script (guest/page.js) in the page's isolated world; nothing hears it before the page commits.
  send (channel, ...args) { this.run('executeJavaScript', `globalThis.leechHost?.hear(${JSON.stringify(channel)}, ${JSON.stringify(args)})`) }

  remove () {
    this.run('close')
    views.delete(this.tab)
    super.remove()
  }

  /** Chromium discards the tab and keeps it, back and forward included; the element goes until wake binds it again. */
  sleep () {
    this.run('sleep')
    views.delete(this.tab)
    super.remove()
  }
}
customElements.define('leech-view', LeechView)

on('tab')((id, type, data) => {
  const view = views.get(id)
  if (!view) return
  // Only a navigation says where back and forward go; other events carry no such field.
  if ('canGoBack' in data) view.state.canGoBack = data.canGoBack
  if ('canGoForward' in data) view.state.canGoForward = data.canGoForward
  if (data.url && data.isMainFrame) view.state.url = data.url
  if (type === 'close') views.delete(id)
  view.dispatchEvent(Object.assign(new Event(type), data))
})

// Where the page goes, and whether the UI is over it: sent whenever it changes, every frame.
const HOLDING = '.menu-scrim, #panel:not([hidden]), #welcome, #omni:not([hidden]):not(.blank), #failure:not([hidden]), #side .edge.held, .peek:not([hidden])'
const ISLANDS = '#find:not([hidden]), .site-card:not([hidden]), #asks > :not([hidden]), #app.folded #fold-edge, #app.peeking #side, #app.peeking #strip, .card, .popover'
let shown = null
let sent = ''
let gliding = null
let held = null
// Where the stage is laid out, without its transform: a glide is Chromium's to animate, not a new
// place every frame.
const place = stage => [stage.offsetLeft, stage.offsetTop, stage.offsetWidth, stage.offsetHeight]
// While the sidebar's edge is dragged the page stays laid out from the narrowest edge; the stage's hole
// shows what the column doesn't cover.
function holdRect (stage) {
  if (held === null) return null
  const [x, y, w, h] = place(stage)
  return [held, y, x + w - held, h]
}
function watchStage () {
  const stage = document.getElementById('stage')
  const view = stage?.querySelector(':scope > leech-view:not(.hidden)')
  const tab = view?.created ? view.tab : null
  if (tab !== shown) { shown = tab; call('tab-show', tab) }
  stage?.classList.toggle('showing', !!tab)
  const box = r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]
  if (gliding && performance.now() >= gliding.until) gliding = null
  // The peek's page sits in its frame's hole, moving with the frame's arrival.
  const hole = document.querySelector('.peek:not([hidden]) .peek-page')
  const state = {
    peek: hole ? box(hole.getBoundingClientRect()) : [0, 0, 0, 0],
    peekRadius: hole ? parseFloat(getComputedStyle(hole).borderTopLeftRadius) || 0 : 0,
    rect: tab ? (holdRect(stage) || (gliding ? box(stage.getBoundingClientRect()) : place(stage))) : [0, 0, 0, 0],
    holding: !!document.querySelector(HOLDING),
    islands: [...document.querySelectorAll(ISLANDS)].map(el => box(el.getBoundingClientRect()))
  }
  const json = JSON.stringify(state)
  if (json !== sent) { sent = json; call('stage', state) }
  requestAnimationFrame(watchStage)
}

// Focus inside the UI's document means nothing to Chromium until the UI's view holds focus too;
// and while it doesn't, focus() fires no focus events, so the call itself is where to catch it.
for (const kind of [HTMLInputElement, HTMLTextAreaElement]) {
  const focus = kind.prototype.focus
  kind.prototype.focus = function (...args) { if (!document.hasFocus()) call('focus-ui'); return focus.apply(this, args) }
}

// A file's text through Chromium's own chooser (LeechView runs it for the UI); null when none is chosen.
function chooseText (accept) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept })
  return new Promise(resolve => {
    input.addEventListener('change', () => resolve(input.files[0]?.text() ?? null))
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

// The list's folder is the downloads folder now; the panel reads it from info.
function listed (list) {
  if (list?.folder) window.leech.info.downloads = list.folder
  return list?.items || []
}

const boot = await call('boot')
document.documentElement.classList.add('native')

const read = name => call('read', name).then(json => { try { return json == null ? null : JSON.parse(json) } catch { return null } })
const write = (name, value) => { call('write', name, JSON.stringify(value)) }
const nothing = () => Promise.resolve(null)

window.leech = {
  native: true,
  createView: id => { const view = document.createElement('leech-view'); view.bind(id); return view },
  closeTab: id => { call('tab', id, 'close') },
  // A link's page in the peek panel, drawn by Chromium in the frame's hole; closing answers where it got to.
  peek: { open: url => { call('peek-open', url) }, close: () => call('peek-close') },
  read,
  write,
  writeNow: write,
  remove: name => { call('remove', name) },
  confirm: (message, detail) => call('confirm', message, detail || ''),
  window: what => { call('window', what) },
  look: look => { call('look', look) },
  openPage: url => { call('open-page', url) },
  openExternal: url => { call('open-page', url) },
  copy: text => { call('copy', text) },
  paste: () => call('paste'),
  escapable: (on, veiling) => { call('escapable', !!on, !!veiling) },
  // While the card glides the page rides along with it, already at its final size: laid out once at the
  // start, then only moved each frame, so nothing jumps or reflows when the glide ends.
  slide: (stage, dx, dy, ms) => { gliding = { until: performance.now() + ms } },
  holdPage: left => { held = left },
  // A split is Chromium's to lay out: it is told which two tabs, and says so when it takes one apart.
  split: (t, other) => { if (t.web?.created && other.web?.created) t.web.run('split', other.web.tab) },
  unsplit: t => { t.web?.run('unsplit') },
  // Chromium's own settings, through the fixed list in leech_prefs.cc (ADR 0004).
  chromiumSettings: { read: () => call('settings-read'), write: (name, value) => call('settings-write', name, value) },
  extensions: () => call('extensions'),
  runExtension: (id, at) => { call('extension-run', id, at) },
  // The engine's suggestions for typed words, as its raw OpenSearch reply; null when it has none.
  suggest: (engine, typed) => call('suggest', engine, typed),
  defaultBrowser: make => call('default-browser', !!make),
  // A sandbox window (ADR 0012) opens only the page it was opened for, and keeps nothing.
  info: { version: boot.version, platform: boot.platform, home: boot.home || '', downloads: boot.downloads || '', sandbox: !!boot.sandbox, page: boot.page || '' },
  sandbox: url => { call('sandbox-open', url || '') },
  sandboxReport: url => call('sandbox-report', url || ''),
  // The page script's config (hidden elements, the shield) and the shield's blocking rules.
  configure: next => { call('configure', next) },
  // Chromium does these itself now: downloads, permissions, the bookmark and history import.
  pageMenuChosen () {},
  importSources: () => Promise.resolve([]),
  importBookmarks: () => Promise.resolve([]),
  importHistory: () => Promise.resolve([]),
  // The panel's passwords are Chromium's (ADR 0011); asking to save after a sign-in and filling stay Chromium's.
  importCSV: () => chooseText('.csv,text/csv').then(csv => csv === null ? null : call('passwords', 'import', csv)),
  vault: (what, ...args) => what === 'matching' ? Promise.resolve([]) : what === 'question' ? Promise.resolve(null) : call('passwords', what, ...args),
  onVaultChanged: on('passwords'),
  chooseFolder: nothing,
  chooseFile: nothing,
  pathOf: () => '',
  clear: nothing,
  snapshot: nothing,
  forgetPartition: nothing,
  // Chromium's own download list (downloads/leech_download_list.h); the folder can change in its settings.
  downloads: () => call('downloads').then(listed),
  openFile: path => { call('download', 'open', path) },
  showFile: path => { call('download', 'show', path) },
  forgetDownload: path => { call('download', 'remove', path) },
  downloadAction: (what, path) => { call('download', what, path) },
  openFolder: path => { call('downloads-folder-open', path) },
  clearDownloads: () => { call('downloads-clear') },
  answer () {},
  onShortcut: on('shortcut'),
  onOpened: on('opened'),
  onFullscreen: on('fullscreen'),
  onActive: on('active'),
  onPageMenu () {},
  onDownloadProgress: on('download-progress'),
  onDownloads: fn => on('downloads')(list => fn(listed(list))),
  onAsk () {},
  onRemember () {},
  onOpenTab () {},
  onSearch () {},
  onToast () {},
  onFlush () {},
  onMaximized () {}
}

requestAnimationFrame(watchStage)
await import('./app.js')
