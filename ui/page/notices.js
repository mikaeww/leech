// What rises from the bottom of the page: toasts, questions, the link bubble.
import { $, esc, h } from '../elements.js'
import { icon } from '../look/icons.js'
import { L, prefs, setPref } from '../state.js'

let toastTimer = null
export function toast (text) {
  const el = $('#toast')
  el.textContent = text
  el.hidden = false
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.animation = ''
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.hidden = true }, 1700)
}

export const hint = h('div', 'hint', 'Click anything to hide it&nbsp;&nbsp;&nbsp;Ctrl+Z undo&nbsp;&nbsp;&nbsp;esc done')
hint.hidden = true
$('#asks').append(hint)

const bubble = $('#bubble')
let bubbleTimer = null
export function hoverLink (url) {
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
  const el = h('div', 'ask capture', `${icon(/micro/.test(thing) ? 'mic' : 'camera')}<span>${esc(host)} wants to use your ${esc(thing)}</span>`)
  const answer = allow => { L.answer(id, allow); el.remove() }
  const allow = h('button', 'allow', 'Allow')
  const deny = h('button', 'deny', 'Don’t allow')
  allow.addEventListener('click', () => answer(true))
  deny.addEventListener('click', () => answer(false))
  el.append(allow, deny)
  asks.insertBefore(el, hint)
})
L.onRemember((key, allow) => { prefs.capture = { ...prefs.capture, [key]: allow }; setPref('capture', prefs.capture) })
