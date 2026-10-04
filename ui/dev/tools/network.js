// Network: every request the page makes once the Dev UI is attached, as "GET /api/users 200 124 ms"; one opens
// to its headers and bodies, and can be sent again, as it was or changed. The requests are kept here for the
// Security tool too.
import { esc, h } from '../../elements.js'
import { current, L } from '../../state.js'
import { redraw } from '../column.js'
import { mainFrameId, on, send } from '../protocol.js'
import { bar, button, caption, chip, empty, field, pairs, scroller } from '../rows.js'
import { curlOf, replayScript } from './replay.js'

export const requests = []
const byId = new Map()
const view = { filter: '', type: 'All', keep: false, open: null, body: null, editing: null }
const TYPES = { All: null, Fetch: ['XHR', 'Fetch', 'EventSource', 'WebSocket'], Doc: ['Document'], JS: ['Script'], CSS: ['Stylesheet'], Img: ['Image', 'Media', 'Font'] }

function clear () {
  requests.length = 0
  byId.clear()
  view.open = null
}

on('leech.attached', clear)
on('Network.requestWillBeSent', p => {
  // The page's own new document starts a new list, unless the list is kept.
  if (p.type === 'Document' && p.frameId === mainFrameId() && p.requestId === p.loaderId && !view.keep && !p.redirectResponse) clear()
  const r = { id: p.requestId, method: p.request.method, url: p.request.url, type: p.type || 'Other', started: p.timestamp, frameId: p.frameId,
    requestHeaders: p.request.headers, hasBody: !!p.request.hasPostData, status: 0, responseHeaders: {} }
  // A redirect reuses the request's id: the hop that was is kept as its own line.
  const was = byId.get(p.requestId)
  if (was && p.redirectResponse) { was.status = p.redirectResponse.status; was.ended = p.timestamp; was.id = `${was.id}:${was.started}` }
  byId.set(p.requestId, r)
  requests.push(r)
  redraw('network')
})
on('Network.requestWillBeSentExtraInfo', p => { const r = byId.get(p.requestId); if (r) r.requestHeaders = { ...r.requestHeaders, ...p.headers } })
on('Network.responseReceived', p => {
  const r = byId.get(p.requestId)
  if (!r) return
  Object.assign(r, { status: p.response.status, statusText: p.response.statusText, mime: p.response.mimeType, protocol: p.response.protocol,
    remote: p.response.remoteIPAddress ? `${p.response.remoteIPAddress}:${p.response.remotePort}` : '', security: p.response.securityDetails || null,
    responseHeaders: { ...p.response.headers, ...r.responseHeaders }, cached: !!p.response.fromDiskCache })
  redraw('network')
})
// The full headers, Set-Cookie included, which the plain response leaves out.
on('Network.responseReceivedExtraInfo', p => { const r = byId.get(p.requestId); if (r) r.responseHeaders = { ...r.responseHeaders, ...p.headers } })
on('Network.loadingFinished', p => { const r = byId.get(p.requestId); if (r) { r.ended = p.timestamp; r.size = p.encodedDataLength; redraw('network') } })
on('Network.loadingFailed', p => {
  const r = byId.get(p.requestId)
  if (r) { r.ended = p.timestamp; r.failed = p.blockedReason ? `blocked: ${p.blockedReason}` : p.errorText; redraw('network') }
})

/** The page's own document's response: its headers say what the Security tool reads. */
export const documentRequest = () => requests.findLast(r => r.type === 'Document' && r.frameId === mainFrameId() && r.status >= 200 && r.status < 300)

const ms = r => r.ended ? `${Math.round((r.ended - r.started) * 1000)} ms` : '…'
const kb = n => n === undefined ? '' : n < 1000 ? `${n} B` : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)} kB`
function pathOf (url) {
  try { const u = new URL(url); return u.pathname + u.search } catch { return url }
}

const hostOf = url => { try { return new URL(url).host } catch { return '' } }

// Another host than the page's is named before the path, so third parties stand out.
function row (r) {
  const page = hostOf(current()?.url || '')
  const host = hostOf(r.url)
  const status = r.failed ? 'failed' : r.status || '…'
  const el = h('button', 'dev-request' + (r.failed || r.status >= 400 ? ' bad' : ''),
    `<span class="method">${esc(r.method)}</span><span class="path">${host && host !== page ? `<span class="host">${esc(host)}</span>` : ''}${esc(pathOf(r.url))}</span><span class="status">${esc(status)}</span><span class="time">${esc(ms(r))}</span>`)
  el.title = r.url
  el.addEventListener('click', () => openRequest(r))
  return el
}

async function openRequest (r) {
  view.open = r
  view.editing = null
  view.body = { request: null, response: null }
  redraw('network')
  if (r.hasBody) view.body.request = (await send('Network.getRequestPostData', { requestId: r.id }).catch(() => null))?.postData ?? null
  const got = await send('Network.getResponseBody', { requestId: r.id }).catch(err => ({ error: err.message }))
  view.body.response = got.error ? `Not kept: ${got.error}` : got.base64Encoded ? `Binary, ${kb(Math.floor(got.body.length * 3 / 4))}` : got.body.slice(0, 200000)
  if (view.open === r) redraw('network')
}

function listView () {
  const types = Object.keys(TYPES).map(t => chip(t, view.type === t, () => { view.type = t; redraw('network') }))
  const needle = view.filter.toLowerCase()
  const shown = requests.filter(r => (!TYPES[view.type] || TYPES[view.type].includes(r.type)) && (!needle || r.url.toLowerCase().includes(needle) || String(r.status).startsWith(needle)))
  const top = bar(field('Filter by address or status', view.filter, v => { view.filter = v; redraw('network') }, 'network-filter', 'grow'),
    chip('Keep', view.keep, () => { view.keep = !view.keep; redraw('network') }), button('Clear', () => { clear(); redraw('network') }))
  const list = shown.length ? scroller('network-list', ...shown.map(row))
    : empty(requests.length ? 'Nothing matches.' : 'Requests show from now on. Reload the page to see the ones it made while loading.')
  return [top, bar(...types), list]
}

function detailView (r) {
  const headers = o => Object.entries(o).sort(([a], [b]) => a.localeCompare(b))
  const general = [['Address', r.url], ['Method', r.method], ['Status', r.failed || `${r.status} ${r.statusText || ''}`], ['Type', r.type],
    ['Time', ms(r)], ['Size', kb(r.size)], ['Protocol', r.protocol || ''], ['Remote', r.remote || ''], ['From cache', r.cached ? 'yes' : 'no']].filter(([, v]) => v !== '')
  const top = bar(button('Back', () => { view.open = null; redraw('network') }), h('span', 'dev-spacer'),
    button('Copy as cURL', () => L.copy(curlOf(r, view.body?.request))), button('Edit and send', () => { view.editing = { method: r.method, url: r.url, headers: headers(r.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n'), body: view.body?.request || '' }; redraw('network') }),
    button('Send again', () => replay({ method: r.method, url: r.url, headers: r.requestHeaders, body: view.body?.request }), true))
  const bodies = [caption('Request body'), h('pre', 'dev-code', esc(r.hasBody ? view.body?.request ?? '…' : 'None')), caption('Response body'), h('pre', 'dev-code', esc(view.body?.response ?? '…'))]
  return [top, scroller('network-detail', view.editing && editor(), pairs('General', general), pairs('Response headers', headers(r.responseHeaders)), pairs('Request headers', headers(r.requestHeaders)), ...bodies)]
}

// Changed before it is sent: method, address, headers one per line, body.
function editor () {
  const e = view.editing
  const box = h('section', 'dev-edit')
  const method = field('Method', e.method, v => { e.method = v }, 'edit-method', 'method')
  const url = field('Address', e.url, v => { e.url = v }, 'edit-url', 'grow')
  const lines = (keep, value, set) => { const t = h('textarea', 'dev-code dev-area'); t.value = value; t.spellcheck = false; t.dataset.keep = keep; t.addEventListener('input', () => set(t.value)); return t }
  const go = () => replay({ method: e.method.trim().toUpperCase() || 'GET', url: e.url.trim(), headers: Object.fromEntries(e.headers.split('\n').map(l => l.split(/:\s?(.*)/s)).filter(([k]) => k?.trim()).map(([k, v]) => [k.trim(), v ?? ''])), body: e.body })
  box.append(caption('Edit and send'), bar(method, url), lines('edit-headers', e.headers, v => { e.headers = v }), lines('edit-body', e.body, v => { e.body = v }),
    bar(h('span', 'dev-note', 'Sent from the page with its cookies; the browser sets Cookie, Host and Content-Length itself.'), h('span', 'dev-spacer'), button('Cancel', () => { view.editing = null; redraw('network') }), button('Send', go, true)))
  return box
}

// Sent by the page itself, so it carries the page's cookies and origin; the new request shows in the list.
async function replay (req) {
  view.open = null
  view.editing = null
  redraw('network')
  await send('Runtime.evaluate', { expression: replayScript(req), awaitPromise: true, userGesture: true }).catch(err => console.warn('Dev UI: send again', err.message))
}

export const networkTool = {
  id: 'network',
  label: 'Network',
  draw: () => view.open ? detailView(view.open) : listView()
}
