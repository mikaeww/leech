// Each tab's page: a <webview> (Electron) or <leech-view> (Chromium), and what it reports back.
import { heard } from '../chrome/media.js'
import { render } from '../chrome/render.js'
import { paintReading } from '../chrome/strip.js'
import { $, stage } from '../elements.js'
import { hoverLink, toast } from '../page/notices.js'
import { omniInput } from '../page/omnibox.js'
import { peek } from '../page/peek.js'
import { accounts, accountsTab, formSaid, signInSettles } from '../page/signins.js'
import { veiled } from '../page/veil.js'
import { bareHost } from '../places/address.js'
import { blank, current, history, icons, L, partitionOf, prefs, S, setPref, tab, ui } from '../state.js'
import { paneFocused, unpair } from './groups/split.js'
import { saveLater } from './session.js'
import { cover, uncover } from './sleep.js'
import { closeTab } from './tabs.js'

const FAILURES = {
  '-105': 'No site at that address.', '-137': 'No site at that address.',
  '-106': 'No connection.', '-21': 'No connection.',
  '-7': 'The site took too long to answer.', '-118': 'The site took too long to answer.',
  '-102': 'The site refused the connection.'
}
const failureText = code => FAILURES[code] || (code <= -200 && code > -300 ? 'The connection isn’t secure.' : 'The page didn’t load.')

function view (t) {
  if (t.web) return t.web
  const w = L.native ? L.createView(t.native) : document.createElement('webview')
  t.native = null
  // A private tab gets a cookie jar of its own, in memory, gone when the tab closes.
  w.setAttribute('partition', t.shy ? `leech-private-${t.id}` : partitionOf(t.space))
  w.setAttribute('allowpopups', '')
  // Chromium's own PDF viewer is a plugin.
  w.setAttribute('plugins', '')
  w.setAttribute('preload', new URL('guest/page.js', location.href).href)
  w.setAttribute('webpreferences', 'contextIsolation=yes, plugins=yes')
  w.className = 'hidden'
  const on = (event, fn) => w.addEventListener(event, e => { if (tab(t.id)) fn(e) })
  const nav = () => {
    t.canBack = w.canGoBack()
    t.canForward = w.canGoForward()
  }
  const events = { t, w, on, nav }
  listenLoading(events)
  listenNavigation(events)
  listenPage(events)
  t.web = w
  stage.insertBefore(w, $('#failure'))
  return w
}

function listenLoading ({ t, w, on, nav }) {
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
}

function listenNavigation ({ t, on, nav }) {
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
}

function listenPage ({ t, on }) {
  on('ipc-message', e => {
    if (e.channel === 'scroll') {
      const reading = Math.round(e.args[0] * 100) / 100
      if (reading !== t.reading) { t.reading = reading; if (t.id === S.active) paintReading() }
    } else if (e.channel === 'unsaved') t.answer?.(e.args[0])
    else if (e.channel === 'veil') veiled(t, e.args[0])
    else if (e.channel === 'forms') formSaid(t, e.args[0])
    else if (e.channel === 'peek') peek(e.args[0])
  })
  // A click into the other pane of a split: Electron says focus, the Chromium build says activated.
  on('focus', () => paneFocused(t))
  on('activated', () => paneFocused(t))
  on('unsplit', () => unpair(t, true))
  on('media-started-playing', () => { t.audible = true; heard(t); render() })
  on('media-paused', () => { t.audible = false; render() })
  on('enter-html-full-screen', () => { ui.immersed = true; render() })
  on('leave-html-full-screen', () => { ui.immersed = false; render() })
  on('found-in-page', e => { if (e.result.finalUpdate) $('#find').classList.toggle('missed', e.result.matches === 0 && !!$('#find input').value) })
  on('update-target-url', e => { if (t.id === S.active) hoverLink(e.url) })
  on('close', () => closeTab(t.id))
}

export function wake (t) {
  // A tab Chromium opened (a link to a new tab) has its page already, often before it has an address.
  if (t.web || (!t.url && !t.native)) return
  const w = view(t)
  if (t.url) w.src = t.url
  if (t.picture) cover(t)
}

export function go (t, url) {
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

export function unload (t) {
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

export function zoom (factor) {
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

export function focusPage () {
  requestAnimationFrame(() => {
    const t = current()
    if (ui.editing || blank(t) || ui.tabEdit) omniInput.focus()
    else t.web?.focus()
  })
}
