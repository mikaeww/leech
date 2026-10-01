// The address field over the page: typing, completion, suggestions, the Ctrl+K switcher.
import { render } from '../chrome/render.js'
import { $, esc, h, stage } from '../elements.js'
import { createBackdrop } from '../look/backdrop.js'
import { icon } from '../look/icons.js'
import { pretty, toURL } from '../places/address.js'
import { completion } from '../places/history.js'
import { blank, current, history, L, label, prefs, S, tab, tabs, ui } from '../state.js'
import { closeTab, select } from '../tabs/tabs.js'
import { focusPage, go } from '../tabs/views.js'
import * as engine from '../places/engine.js'

const omni = $('#omni')
export const omniInput = $('#omni input')
const omniField = $('#omni .field')
const omniList = $('#omni .list')
const showBackdrop = createBackdrop(stage)

// ---- search and addresses ----

export function searchURL (text) { return engine.searchURL(text, engine.template(prefs['search.engine'], prefs['search.custom'])) }
export function destination (text) { return toURL(text) || searchURL(text) }

// ---- the omnibox ----

export function edit () {
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

export function summon () {
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

export function dismiss () {
  ui.summoning = false
  ui.cycling = false
  // A blank tab has nothing behind the field; leaving it means going back to where you were.
  if (blank(current())) {
    const t = current()
    if (t && tabs.length > 1 && !ui.typed) {
      const back = t.opener
      closeTab(t.id)
      if (back && tab(back)) select(back)
    }
    return
  }
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
  ui.offers = offersFor(typed)
  ui.ending = completion(typed, ui.offers)
  ui.picked = null
  askEngine(typed, ui.offers, more => { if (ui.typed === typed) { ui.offers = more; renderOmni() } })
}

/** What an address field offers for typed text: visited and famous places, then a search for it. */
export function offersFor (typed) {
  const list = history.suggestions(typed, 3)
  const url = !toURL(typed) && searchURL(typed)
  if (url) list.push({ key: typed, title: engine.name(prefs['search.engine'], prefs['search.custom']), url, kind: 'search' })
  return list
}

/**
 * The engine's own suggestions, once typing pauses: `take` gets `offers` with them added. Typed addresses
 * and private tabs never ask.
 */
let asking = 0
export function askEngine (typed, offers, take) {
  clearTimeout(asking)
  if (!L.suggest || current()?.shy || !typed.trim() || toURL(typed)) return
  asking = setTimeout(async () => {
    const reply = await L.suggest(prefs['search.engine'], typed.trim())
    if (!reply) return
    let words
    try { words = JSON.parse(reply)[1] } catch { return }
    if (!Array.isArray(words)) return
    const seen = new Set(offers.map(o => o.key.toLowerCase()))
    const more = words.filter(w => typeof w === 'string' && !seen.has(w.toLowerCase())).slice(0, 4)
      .map(w => ({ key: w, title: '', url: searchURL(w), kind: 'search' }))
    if (more.length) take([...offers, ...more])
  }, 120)
}

/** One suggestion's insides: a glass for a search, a dot for an open tab, the key and its title. */
export function offerHTML (offer) {
  const lead = offer.kind === 'search' ? `<span class="glass">${icon('search', 'small')}</span>` : offer.kind === 'open' ? '<span class="dot"></span>' : ''
  return `${lead}<span class="key">${esc(offer.key)}</span>${offer.title ? `<span class="title">${esc(offer.title)}</span>` : ''}`
}

function openPages (typed) {
  const needle = typed.trim().toLowerCase()
  return tabs
    .filter(t => t.id !== S.active && !blank(t))
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

let omniShown = false
export function renderOmni () {
  const t = current()
  const show = ui.editing || blank(t)
  showBackdrop(blank(t), t?.id)
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
    const row = h('div', 'offer' + (ui.picked === i ? ' picked' : ''), offerHTML(offer))
    row.addEventListener('mousedown', e => e.preventDefault())
    row.addEventListener('click', () => take(offer))
    omniList.append(row)
  })
}
