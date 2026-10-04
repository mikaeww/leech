// The DevTools protocol on the tab on screen, for every tool of the Dev UI: commands answered by promise,
// events to whoever listens. The Chromium build attaches through chromium/leech/dev/; one tab at a time.
import { L } from '../state.js'

const waiting = new Map()
const listeners = new Map()
let next = 0
let attached = null
let ready = false

L.dev?.onCdp(json => {
  let message
  try { message = JSON.parse(json) } catch { return console.error('Dev UI: a protocol message that isn\'t JSON', json.slice(0, 200)) }
  if (message.id !== undefined) {
    const answer = waiting.get(message.id)
    waiting.delete(message.id)
    return answer?.(message)
  }
  emit(message.method, message.params || {})
})
L.dev?.onClosed(() => { attached = null; ready = false; emit('leech.detached', {}) })

function emit (method, params) {
  for (const fn of listeners.get(method) || []) fn(params)
}

// The main frame's own navigations, as Leech's "leech.navigated"; a frame inside the page doesn't count.
on('Page.frameNavigated', ({ frame }) => {
  if (frame.parentId) return
  mainFrame = frame.id
  emit('leech.navigated', { url: frame.url })
})

/** A command; rejects with the protocol's error message. */
export function send (method, params = {}) {
  if (!attached) return Promise.reject(new Error('No page is attached.'))
  const id = ++next
  return new Promise((resolve, reject) => {
    waiting.set(id, m => m.error ? reject(new Error(m.error.message)) : resolve(m.result))
    L.dev.cdp(JSON.stringify({ id, method, params }))
  })
}

/** Every event of that name from now on. Leech's own: "leech.attached" (a new page, tools empty
 * themselves), "leech.ready" (its domains are on, tools load), "leech.detached" and "leech.navigated". */
export function on (method, fn) {
  if (!listeners.has(method)) listeners.set(method, [])
  listeners.get(method).push(fn)
}

// Overlay after DOM, which it needs; commands run in the order they are sent.
const DOMAINS = ['Runtime', 'Log', 'Network', 'Page', 'DOM', 'CSS', 'Overlay', 'DOMStorage', 'Security', 'Debugger']
let mainFrame = null

/** Attaches to the tab (its view's id) unless it already is; the domains every tool needs are switched on. */
export async function attach (tabId) {
  if (attached === tabId) return true
  for (const [id, answer] of waiting) { answer({ error: { message: 'The page changed.' } }); waiting.delete(id) }
  ready = false
  attached = (await L.dev.attach(tabId)) ? tabId : null
  if (!attached) return false
  // Before the domains are on, so what they report from here on lands in emptied tools.
  emit('leech.attached', { tab: tabId })
  // Each on its own: a domain a page refuses (Debugger on some pages) mustn't stop the others.
  await Promise.all(DOMAINS.map(d => send(`${d}.enable`).catch(err => console.warn(`Dev UI: ${d}.enable`, err.message))))
  // Debugger only to hear which scripts name a source map: a debugger statement in the page must never stop it,
  // since the Dev UI has no way to resume.
  await send('Debugger.setSkipAllPauses', { skip: true }).catch(err => console.warn('Dev UI: skipping pauses', err.message))
  mainFrame = (await send('Page.getFrameTree').catch(() => null))?.frameTree.frame.id ?? null
  ready = true
  emit('leech.ready', { tab: tabId })
  return true
}

export function detach () {
  if (!attached) return
  attached = null
  ready = false
  L.dev.detach()
  emit('leech.detached', {})
}

/** Attached, with every domain on: what the page does from now on reaches the tools. */
export const isAttached = () => attached !== null && ready
/** The id of the page's main frame, to tell the page's own document from a frame's. */
export const mainFrameId = () => mainFrame
/** The tab (its view's id) the tools look at, or null. */
export const attachedTab = () => attached
