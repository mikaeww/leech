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
  // The Electron build's guest script listens here; Chromium's own features replace it.
  send () {}

  remove () {
    this.run('close')
    views.delete(this.tab)
    super.remove()
  }
}
customElements.define('leech-view', LeechView)

on('tab')((id, type, data) => {
  const view = views.get(id)
  if (!view) return
  view.state.canGoBack = data.canGoBack
  view.state.canGoForward = data.canGoForward
  if (data.url && data.isMainFrame) view.state.url = data.url
  if (type === 'close') views.delete(id)
  view.dispatchEvent(Object.assign(new Event(type), data))
})

// Where the page goes, and whether the UI is over it: sent whenever it changes, every frame.
const HOLDING = '.menu-scrim, #panel:not([hidden]), #welcome, #omni:not([hidden]):not(.blank), #failure:not([hidden])'
const ISLANDS = '#find:not([hidden]), #asks > :not([hidden]), #app.folded #fold-edge, #app.peeking #side, #app.peeking #strip, .card, .popover'
let shown = null
let sent = ''
function watchStage () {
  const stage = document.getElementById('stage')
  const view = stage?.querySelector(':scope > leech-view:not(.hidden)')
  const tab = view?.created ? view.tab : null
  if (tab !== shown) { shown = tab; call('tab-show', tab) }
  stage?.classList.toggle('showing', !!tab)
  const box = r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]
  const state = {
    rect: tab ? box(view.getBoundingClientRect()) : [0, 0, 0, 0],
    holding: !!document.querySelector(HOLDING),
    islands: [...document.querySelectorAll(ISLANDS)].map(el => box(el.getBoundingClientRect()))
  }
  const json = JSON.stringify(state)
  if (json !== sent) { sent = json; call('stage', state) }
  requestAnimationFrame(watchStage)
}

const boot = await call('boot')
document.documentElement.classList.add('native')

const read = name => call('read', name).then(json => { try { return json == null ? null : JSON.parse(json) } catch { return null } })
const write = (name, value) => { call('write', name, JSON.stringify(value)) }
const nothing = () => Promise.resolve(null)

window.leech = {
  native: true,
  createView: id => { const view = document.createElement('leech-view'); view.bind(id); return view },
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
  escapable: on => { call('escapable', !!on) },
  defaultBrowser: make => call('default-browser', !!make),
  info: { version: boot.version, platform: boot.platform, home: '', downloads: '' },
  // Chromium does these itself now: passwords, downloads, permissions, import, sleeping tabs.
  configure () {},
  pageMenuChosen () {},
  importSources: () => Promise.resolve([]),
  importBookmarks: () => Promise.resolve([]),
  importHistory: () => Promise.resolve([]),
  importCSV: () => { call('open-page', 'chrome://password-manager/settings'); return Promise.resolve(null) },
  vault: what => Promise.resolve(what === 'list' || what === 'matching' ? [] : null),
  veil () {},
  hiddenOn: () => Promise.resolve([]),
  chooseFolder: nothing,
  chooseFile: nothing,
  pathOf: () => '',
  clear: nothing,
  snapshot: nothing,
  forgetPartition: nothing,
  downloads: () => Promise.resolve([]),
  openFile () {},
  showFile () {},
  forgetDownload () {},
  clearDownloads () {},
  answer () {},
  onShortcut: on('shortcut'),
  onOpened: on('opened'),
  onFullscreen: on('fullscreen'),
  onActive: on('active'),
  onPageMenu () {},
  onHidden () {},
  onDownloadProgress () {},
  onDownloads () {},
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
