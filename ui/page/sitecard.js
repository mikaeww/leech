// The site card under the address being edited, as in SiteCard.swift; once something is typed, the
// suggestions for it.
import { $, esc, h } from '../elements.js'
import { actions } from '../keys.js'
import { icon } from '../look/icons.js'
import { bareHost } from '../places/address.js'
import { L, ui } from '../state.js'
import { finishTabEdit } from '../tabs/edit.js'
import { zoom } from '../tabs/views.js'
import { toast } from './notices.js'
import { askEngine, offerHTML, offersFor } from './omnibox.js'

export let card = null
let offers = []
let picked = null
export function closeCard () {
  card?.remove()
  card = null
  offers = []
  picked = null
}

export function siteCard (t, field) {
  closeCard()
  if (!field || ui.tabEdit?.id !== t.id) return
  const original = field.value
  const url = t.url || ''
  const safe = url.startsWith('https:') && !t.failure
  const site = bareHost(url) || (url.startsWith('file:') ? 'File' : url.split(':')[0])
  card = h('div', 'menu site-card')
  const row = (label, keys, fn, more = false) => {
    const r = h('div', 'menu-row', `<span class="menu-label">${esc(label)}</span>${keys ? `<span class="menu-keys">${esc(keys)}</span>` : ''}${more ? `<span class="menu-more">${icon('forward', 'small')}</span>` : ''}`)
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
    const step = (glyph, title, f) => { const b = h('button', 'zoom-step', icon(glyph, 'small')); b.title = title; b.addEventListener('click', () => { zoom(f); level.textContent = `${Math.round(t.web.getZoomFactor() * 100)}%` }); return b }
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
  // Typing turns the card into the suggestions for what is typed, as the omnibox shows them.
  field.addEventListener('input', () => {
    if (card && field.value !== original) suggest(field.value)
  })
}

function suggest (typed) {
  offers = typed.trim() ? offersFor(typed) : []
  picked = null
  drawOffers()
  askEngine(typed, offers, more => { if (card && ui.tabEdit?.draft === typed) { offers = more; drawOffers() } })
}

function drawOffers () {
  card.className = 'menu site-card offering'
  card.hidden = !offers.length
  card.replaceChildren(...offers.map((offer, i) => {
    const row = h('div', `offer${picked === i ? ' picked' : ''}`, offerHTML(offer))
    row.addEventListener('mousedown', e => e.preventDefault())
    row.addEventListener('click', () => { picked = i; finishTabEdit(true) })
    return row
  }))
}

/** Up and down on the field step through the suggestions; past either end nothing is picked. */
export function walkOffers (by) {
  if (!card || !offers.length) return
  const next = picked === null ? (by > 0 ? 0 : offers.length - 1) : picked + by
  picked = next < 0 || next >= offers.length ? null : next
  drawOffers()
}

/** The address of the suggestion picked on the card, or null when none is. */
export function pickedOffer () {
  return picked === null ? null : offers[picked]?.url || null
}
