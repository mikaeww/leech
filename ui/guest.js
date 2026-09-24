// Runs in every page's isolated world. Ported from Search's Curtain.swift and Forms.swift.
const { ipcRenderer } = require('electron')


const send = (channel, message) => ipcRenderer.sendToHost(channel, message)

// ---- reading progress, once per frame at most ----

let queued = false
function progress () {
  queued = false
  const max = document.documentElement.scrollHeight - window.innerHeight
  send('scroll', max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0)
}
window.addEventListener('scroll', () => {
  if (!queued) { queued = true; requestAnimationFrame(progress) }
}, { passive: true, capture: true })

// ---- hidden elements: the stylesheet goes in before the page has a body ----

function sheet (id) {
  let s = document.getElementById(id)
  if (!s) {
    s = document.createElement('style')
    s.id = id
    ;(document.head || document.documentElement).appendChild(s)
  }
  return s
}

let veilCSS = ''
function applyVeil () {
  if (veilCSS || document.getElementById('leech-veil')) sheet('leech-veil').textContent = veilCSS
}
if (/^https?:$/.test(location.protocol)) {
  veilCSS = ipcRenderer.sendSync('veil:css', location.hostname)
  if (document.documentElement) applyVeil()
  else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); applyVeil() } }).observe(document, { childList: true })
  // Pages that rebuild <head> would drop the sheet.
  document.addEventListener('DOMContentLoaded', applyVeil)
}
ipcRenderer.on('veil-css', (_, css) => { veilCSS = css; applyVeil() })

// ---- the picker: point at something, click, and it's gone ----

let frame = null
let tag = null
let target = null
let live = false

function chrome () {
  if (frame) return frame
  frame = document.createElement('div')
  frame.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;' +
    'border:2px solid rgba(23,23,23,.9);background:rgba(23,23,23,.07);' +
    'border-radius:4px;transition:all .07s ease-out;display:none'
  tag = document.createElement('div')
  tag.style.cssText = 'position:absolute;font:500 11px sans-serif;color:#fff;background:#171717;padding:2px 7px;' +
    'border-radius:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
  frame.appendChild(tag)
  document.documentElement.appendChild(frame)
  return frame
}

const known = {
  nav: 'Navigation', header: 'Header', footer: 'Footer', aside: 'Sidebar', form: 'Form', dialog: 'Dialog',
  video: 'Video', img: 'Image', button: 'Button', iframe: 'Embed', figure: 'Figure', table: 'Table'
}
const clip = (text, n) => text.length > n ? text.slice(0, n) + '…' : text

// What it is, in the order a person would say it: what it calls itself, what kind of thing, what it says.
function name (el) {
  const said = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))
  if (said && said.trim()) return clip(said.trim(), 40)
  const tagName = el.tagName.toLowerCase()
  if (known[tagName]) return known[tagName]
  const role = el.getAttribute && el.getAttribute('role')
  if (role) return role.charAt(0).toUpperCase() + role.slice(1)
  const text = (el.innerText || '').trim().replace(/\s+/g, ' ')
  return text ? clip(text, 40) : tagName
}

// How big, and which corner: two sidebars read alike, but rarely sit in the same place.
function shape (el) {
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const side = cx < innerWidth / 3 ? 'left' : cx > innerWidth * 2 / 3 ? 'right' : 'centre'
  const band = cy < innerHeight / 3 ? 'top' : cy > innerHeight * 2 / 3 ? 'bottom' : 'middle'
  return `${Math.round(r.width)}×${Math.round(r.height)} · ${band} ${side}`
}

function place (el) {
  const box = chrome()
  const r = el.getBoundingClientRect()
  Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' })
  tag.textContent = name(el)
  tag.style.top = r.top >= 26 ? '-21px' : '3px'
  tag.style.left = Math.max(2, -r.left + 4) + 'px'
  tag.style.maxWidth = Math.max(80, innerWidth - Math.max(0, r.left) - 16) + 'px'
}

// A class worth hanging a rule on: a word, not a build artefact.
const steady = c => /^[a-zA-Z][\w-]{2,29}$/.test(c) && !/\d{3,}/.test(c) && !/^(css|sc|jsx|emotion|svelte|styles?)-/.test(c)
function unique (sel) {
  try { return document.querySelectorAll(sel).length === 1 } catch { return false }
}

function selectorFor (el) {
  if (el.id && unique('#' + CSS.escape(el.id))) return '#' + CSS.escape(el.id)
  for (const hook of ['data-testid', 'data-test', 'data-qa', 'data-cy', 'aria-label', 'name', 'role']) {
    const v = el.getAttribute && el.getAttribute(hook)
    if (v) {
      const s = `${el.tagName.toLowerCase()}[${hook}="${CSS.escape(v)}"]`
      if (unique(s)) return s
    }
  }
  const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(steady) : []
  if (classes.length) {
    const byClass = el.tagName.toLowerCase() + '.' + classes.map(CSS.escape).join('.')
    if (unique(byClass)) return byClass
  }
  // Last resort: a path, anchored on the nearest thing with a name.
  const parts = []
  let node = el
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (node.id && unique('#' + CSS.escape(node.id))) { parts.unshift('#' + CSS.escape(node.id)); break }
    const tagName = node.tagName.toLowerCase()
    const parent = node.parentElement
    if (!parent) { parts.unshift(tagName); break }
    const kin = [...parent.children].filter(c => c.tagName === node.tagName)
    parts.unshift(kin.length > 1 ? `${tagName}:nth-of-type(${kin.indexOf(node) + 1})` : tagName)
    node = parent
  }
  return parts.join(' > ')
}

const ignorable = el => !el || el === frame || el === document.documentElement || el === document.body

function onMove (e) {
  if (!live) return
  const el = document.elementFromPoint(e.clientX, e.clientY)
  if (ignorable(el)) return
  target = el
  place(el)
}

// Every kind of press, swallowed: pages act on pointerdown and would be gone before a click completes.
function swallow (e) {
  if (!live) return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
}

function onPress (e) {
  if (!live) return
  swallow(e)
  const el = target || document.elementFromPoint(e.clientX, e.clientY)
  if (ignorable(el)) return
  try {
    send('veil', { selector: selectorFor(el), label: name(el), note: shape(el) })
  } catch (err) {
    send('veil', { trouble: String(err) })
  }
  target = null
  if (frame) frame.style.display = 'none'
}

const presses = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart']

ipcRenderer.on('veil', (_, what, css, selector) => {
  if (what === 'on' && !live) {
    live = true
    chrome()
    document.documentElement.style.cursor = 'crosshair'
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('pointermove', onMove, true)
    for (const kind of presses) document.addEventListener(kind, kind === 'pointerdown' ? onPress : swallow, true)
  } else if (what === 'off' && live) {
    live = false
    target = null
    if (frame) frame.style.display = 'none'
    document.documentElement.style.cursor = ''
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('pointermove', onMove, true)
    for (const kind of presses) document.removeEventListener(kind, kind === 'pointerdown' ? onPress : swallow, true)
  } else if (what === 'peek') {
    // The sheet is rebuilt without that one selector, so the element comes back with its real layout.
    sheet('leech-veil').textContent = css
    sheet('leech-peek').textContent = `${selector} { outline: 2px solid rgba(23,23,23,.9) !important; outline-offset: 2px !important; }`
    try { document.querySelector(selector)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {}
  } else if (what === 'unpeek') {
    sheet('leech-veil').textContent = veilCSS
    sheet('leech-peek').textContent = ''
  }
})

// ---- sign-ins: noticed when sent, filled when asked ----

// The password box, and the last box before it that could hold a name.
function pair () {
  const pass = [...document.querySelectorAll('input[type="password"]')].find(b => {
    const r = b.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })
  if (!pass) return null
  const scope = pass.form || pass.closest('form') || document
  let user = null
  for (const input of scope.querySelectorAll('input')) {
    if (input === pass) break
    const kind = (input.type || 'text').toLowerCase()
    if (kind === 'text' || kind === 'email' || kind === 'tel') user = input
  }
  return { user, pass }
}

// Through the field's own setter, with the events a keystroke fires, so frameworks see the value.
function put (box, value) {
  if (!box) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(box, value)
  else box.value = value
  box.dispatchEvent(new Event('input', { bubbles: true }))
  box.dispatchEvent(new Event('change', { bubbles: true }))
}

ipcRenderer.on('fill', (_, user, password) => {
  const both = pair()
  if (!both) return
  if (both.user && !both.user.value) put(both.user, user)
  put(both.pass, password)
})

// Said on every send — a click on "show password" says it too — because the host keeps the last it heard.
function offer () {
  const both = pair()
  if (!both || !both.pass.value) return
  send('forms', { kind: 'submit', user: both.user ? both.user.value : '', password: both.pass.value })
}
document.addEventListener('submit', offer, true)
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return
  const both = pair()
  if (both && (document.activeElement === both.pass || document.activeElement === both.user)) offer()
}, true)
// Plenty of sign-in buttons aren't in a form and never fire submit.
document.addEventListener('click', e => {
  if (e.target?.closest?.('button, input[type="submit"], [role="button"]')) setTimeout(offer, 0)
}, true)

let told = false
function tell () {
  if (told || !pair()) return
  told = true
  send('forms', { kind: 'form' })
}
window.addEventListener('load', tell)
setTimeout(tell, 700)
setTimeout(tell, 2200)
// The boxes going away without a new page is the other way a sign-in shows it took.
let settling = null
document.addEventListener('DOMContentLoaded', () => {
  new MutationObserver(() => {
    if (!told) return tell()
    if (pair()) return
    told = false
    clearTimeout(settling)
    settling = setTimeout(() => { if (!pair()) send('forms', { kind: 'settled' }) }, 400)
  }).observe(document.documentElement, { childList: true, subtree: true })
})

// Where the caret is, when it is in a sign-in box, so a list of accounts can hang from it.
function caret () {
  const el = document.activeElement
  const both = pair()
  let rect = null
  if (both && el && (el === both.user || el === both.pass)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) rect = { x: r.left, y: r.top, w: r.width, h: r.height }
  }
  send('forms', { kind: 'focus', rect })
}
let moving = false
function moved () {
  if (moving) return
  moving = true
  requestAnimationFrame(() => { moving = false; caret() })
}
window.addEventListener('scroll', moved, true)
window.addEventListener('resize', moved)
document.addEventListener('focusin', caret, true)
document.addEventListener('focusout', () => setTimeout(caret, 0), true)

// ---- typed and not yet sent: a page holding that isn't put to sleep ----

const typed = []
document.addEventListener('input', e => {
  if (!e.isTrusted || typed.includes(e.target)) return
  typed.push(e.target)
  if (typed.length > 40) typed.shift()
}, true)
function unsaved () {
  return typed.some(el => {
    if (!el.isConnected) return false
    const tagName = (el.tagName || '').toLowerCase()
    if (tagName === 'textarea') return el.value.trim() && el.value !== el.defaultValue
    if (tagName === 'input') {
      return ['text', 'email', 'url', 'tel', 'number'].includes((el.type || 'text').toLowerCase()) && el.value.trim() && el.value !== el.defaultValue
    }
    return el.isContentEditable && (el.textContent || '').trim()
  })
}
ipcRenderer.on('unsaved?', () => send('unsaved', !!unsaved()))

// ---- shift-click peeks at a link instead of opening it, when the host says so ----

let peeks = false
ipcRenderer.on('prefs', (_, prefs) => { peeks = !!prefs.peek })
document.addEventListener('click', e => {
  if (!peeks || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.button !== 0) return
  const link = e.composedPath().find(n => n.tagName === 'A' || n.tagName === 'AREA')
  const href = link?.href?.baseVal || link?.href
  if (!href || !/^https?:/.test(href)) return
  e.preventDefault()
  e.stopImmediatePropagation()
  send('peek', href)
}, true)
