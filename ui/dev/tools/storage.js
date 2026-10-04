// Storage: the page's cookies with every flag, and its local and session storage; each entry can be changed or
// removed, new ones added, and the site's data cleared after asking.
import { esc, h } from '../../elements.js'
import { current, L } from '../../state.js'
import { redraw } from '../column.js'
import { on, send } from '../protocol.js'
import { bar, button, chip, empty, field, scroller } from '../rows.js'

const view = { part: 'Cookies', cookies: [], items: [], open: null, draft: null, adding: null }
const quiet = p => p.catch(err => console.warn('Dev UI: storage', err.message))
const pageURL = () => current()?.url || ''
const originOf = url => { try { return new URL(url).origin } catch { return '' } }
const storageId = () => ({ securityOrigin: originOf(pageURL()), isLocalStorage: view.part === 'Local' })

/** The cookies the page would send, as the protocol gives them (the Security tool reads them too). */
export async function pageCookies () {
  return (await quiet(send('Network.getCookies', { urls: [pageURL()] })))?.cookies || []
}

async function load () {
  if (view.part === 'Cookies') view.cookies = await pageCookies()
  else view.items = (await quiet(send('DOMStorage.getDOMStorageItems', { storageId: storageId() })))?.entries || []
  redraw('storage')
}

on('leech.ready', load)
on('leech.navigated', load)
for (const event of ['DOMStorage.domStorageItemAdded', 'DOMStorage.domStorageItemRemoved', 'DOMStorage.domStorageItemUpdated', 'DOMStorage.domStorageItemsCleared']) {
  on(event, p => { if (view.part !== 'Cookies' && p.storageId?.isLocalStorage === (view.part === 'Local')) load() })
}

const expiry = c => c.session || c.expires < 0 ? 'session' : new Date(c.expires * 1000).toLocaleString()
const flags = c => [c.httpOnly && 'HttpOnly', c.secure && 'Secure', c.sameSite && `SameSite=${c.sameSite}`, c.partitionKey && 'Partitioned'].filter(Boolean).join(' · ')

function cookieRow (c) {
  const key = `${c.name}|${c.domain}|${c.path}`
  const isOpen = view.open === key
  const row = h('button', 'dev-entry' + (isOpen ? ' open' : ''), `<span class="name">${esc(c.name)}</span><span class="value">${esc(c.value)}</span><span class="meta">${esc(`${c.domain}${c.path} · ${expiry(c)}${flags(c) ? ' · ' + flags(c) : ''}`)}</span>`)
  row.addEventListener('click', () => { view.open = isOpen ? null : key; view.draft = c.value; redraw('storage') })
  if (!isOpen) return [row]
  const value = field('Value', view.draft, v => { view.draft = v }, `cookie-${key}`, 'grow mono')
  const save = () => quiet(send('Network.setCookie', { name: c.name, value: view.draft, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expires: c.session ? undefined : c.expires })).then(load)
  return [row, bar(value, button('Remove', () => quiet(send('Network.deleteCookies', { name: c.name, domain: c.domain, path: c.path })).then(load)), button('Save', save, true))]
}

function itemRow ([key, value]) {
  const isOpen = view.open === key
  const row = h('button', 'dev-entry' + (isOpen ? ' open' : ''), `<span class="name">${esc(key)}</span><span class="value">${esc(value)}</span>`)
  row.addEventListener('click', () => { view.open = isOpen ? null : key; view.draft = value; redraw('storage') })
  if (!isOpen) return [row]
  const area = h('textarea', 'dev-code dev-area')
  area.value = view.draft
  area.spellcheck = false
  area.dataset.keep = `item-${key}`
  area.addEventListener('input', () => { view.draft = area.value })
  return [row, area, bar(h('span', 'dev-spacer'), button('Remove', () => quiet(send('DOMStorage.removeDOMStorageItem', { storageId: storageId(), key })).then(load)),
    button('Save', () => quiet(send('DOMStorage.setDOMStorageItem', { storageId: storageId(), key, value: view.draft })).then(load), true))]
}

function addLine () {
  const a = view.adding
  const name = field('Name', a.name, v => { a.name = v }, 'add-name', 'mono narrow')
  const value = field('Value', a.value, v => { a.value = v }, 'add-value', 'grow mono')
  const add = () => {
    if (!a.name.trim()) return
    const done = view.part === 'Cookies'
      ? send('Network.setCookie', { name: a.name.trim(), value: a.value, url: pageURL() })
      : send('DOMStorage.setDOMStorageItem', { storageId: storageId(), key: a.name.trim(), value: a.value })
    view.adding = null
    quiet(done).then(load)
  }
  return bar(name, value, button('Add', add, true))
}

async function clearSite () {
  const origin = originOf(pageURL())
  if (!origin || !(await L.confirm(`Clear everything ${new URL(origin).host} keeps?`, 'Its cookies, storage, databases and caches in this browser go. Signed-in sessions end.'))) return
  await quiet(send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }))
  await quiet(pageCookies().then(list => Promise.all(list.map(c => send('Network.deleteCookies', { name: c.name, domain: c.domain, path: c.path })))))
  load()
}

function draw () {
  if (!originOf(pageURL()).startsWith('http')) return [empty('No web page on screen. Open a site to see what it keeps.')]
  const parts = ['Cookies', 'Local', 'Session'].map(p => chip(p, view.part === p, () => { view.part = p; view.open = null; load() }))
  const top = bar(...parts, h('span', 'dev-spacer'), button('Add', () => { view.adding = view.adding ? null : { name: '', value: '' }; redraw('storage') }), button('Clear site data', clearSite))
  const rows = view.part === 'Cookies' ? view.cookies.flatMap(cookieRow) : view.items.flatMap(itemRow)
  const what = view.part === 'Cookies' ? 'No cookies for this page.' : `Nothing in ${view.part.toLowerCase()} storage for ${originOf(pageURL())}.`
  return [top, view.adding && addLine(), rows.length ? scroller('storage-list', ...rows) : empty(what)]
}

export const storageTool = { id: 'storage', label: 'Storage', draw, shown: load }
