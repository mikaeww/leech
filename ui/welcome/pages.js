// The first run's pages (Welcome.swift). Each is drawn afresh from the shared state w when shown.
import { esc, h } from '../elements.js'
import { action, segmented, toggle } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { caption, card, line } from '../panels/pieces.js'
import { ENGINES } from '../places/engine.js'
import { L, prefs, setPref } from '../state.js'

// Where each engine's own account lives, for the sign-in button.
const ACCOUNTS = {
  google: ['Sign in to Google', 'https://accounts.google.com/ServiceLogin?continue=https://www.google.com/'],
  kagi: ['Sign in to Kagi', 'https://kagi.com/signin'],
  brave: ['Sign in to Brave', 'https://account.brave.com/'],
  ecosia: ['Sign in to Ecosia', 'https://www.ecosia.org/accounts'],
  bing: ['Sign in to Microsoft', 'https://login.live.com/']
}

// Each title ends on a full stop in the mark's blue.
function heading (title, words) {
  return h('div', 'w-heading', `<h1>${esc(title.slice(0, -1))}<span class="w-dot">.</span></h1><p>${esc(words)}</p>`)
}

// A drawing of the window each way, as in Welcome.swift's Way.
function way (title, sidebar, chosen, pick) {
  const b = h('button', 'w-way' + (chosen ? ' on' : ''))
  const bars = [0, 1, 2, 3].map(i => `<i class="${i === 0 ? 'live' : ''}"></i>`).join('')
  b.innerHTML = `<div class="w-sketch ${sidebar ? 'side' : 'strip'}"><div class="w-tabs">${bars}</div><div class="w-page"></div></div><span>${esc(title)}</span>`
  b.addEventListener('click', pick)
  return b
}

function hello () {
  const el = h('div', 'w-page w-hello')
  el.innerHTML = `<div class="w-mark-box"><div class="w-wave"></div><div class="w-mark"></div></div><h1>Leech</h1><p>A browser with nothing in the way. Tabs and the page, the engine you already trust, and as little around it as we could manage.</p>`
  return el
}

// The engine's own account: a switch that opens its sign-in in the first tab.
function account (w) {
  const found = ACCOUNTS[prefs['search.engine']]
  if (prefs['search.engine'] === 'google' && !L.native) return line('Google account', 'Google search works signed out. Google doesn’t allow signing in from browsers built on Electron.')
  if (!found) return line('No account needed', 'This engine works the same signed out.')
  const [label, url] = found
  return line(label, 'Its sign-in opens in your first tab when you start', toggle(w.signIn === url, on => { w.signIn = on ? url : null }))
}

function search (w) {
  const el = h('div', 'w-page')
  el.append(heading('Search and sign in.', 'Words that aren’t an address go to the engine you pick. Sign in now and the first tab you open is already yours.'))
  const grid = h('div', 'w-engines')
  const box = card(account(w))
  for (const [id, name] of ENGINES) {
    const b = h('button', 'w-engine' + (prefs['search.engine'] === id ? ' on' : ''), esc(name))
    b.addEventListener('click', () => {
      setPref('search.engine', id)
      grid.querySelectorAll('.w-engine').forEach(x => x.classList.toggle('on', x === b))
      w.signIn = null
      box.replaceChildren(account(w))
    })
    grid.append(b)
  }
  el.append(grid, box)
  return el
}

// The Electron shell reads other browsers' files; the Chromium build hands it to Chromium's own import.
function bringLines (w) {
  if (L.native) return [line('Bookmarks, history and passwords', 'Chromium’s import brings them over from another browser on this computer', action('Import…', () => L.openPage('chrome://settings/importData')))]
  if (!w.sources.length) return [line('Bookmarks and history', 'No other browser found on this computer')]
  const lines = []
  if (w.sources.length > 1) lines.push(line('From', null, segmented(w.sources.map(s => [s, s]), w.source, v => { w.source = v })))
  lines.push(line('Bookmarks', `Folders and all, behind the bookmark button${w.sources.length === 1 ? `, from ${w.sources[0]}` : ''}`, toggle(w.want.bookmarks, v => { w.want.bookmarks = v })))
  lines.push(line('History', 'The last few thousand places, for finishing addresses', toggle(w.want.history, v => { w.want.history = v })))
  const result = line(w.brought || 'Nothing brought over yet', null)
  const go = action(w.brought ? 'Brought in' : 'Bring them in', async () => {
    if (w.bringing || w.brought) return
    w.bringing = true
    go.textContent = 'Bringing…'
    const said = []
    if (w.want.bookmarks) said.push(`${await w.ctx.bringBookmarks(w.source)} bookmarks`)
    if (w.want.history) said.push(`${await w.ctx.bringHistory(w.source)} places`)
    w.bringing = false
    w.brought = said.join(' · ') || 'Nothing chosen'
    go.textContent = 'Brought in'
    result.querySelector('.name').textContent = w.brought
  })
  result.append(go)
  return [...lines, result]
}

function passwordsLine () {
  const csv = action('Choose CSV…', async () => {
    const n = await L.importCSV()
    if (n !== null) { csv.textContent = n < 0 ? 'The keyring refused them' : `${n} passwords`; csv.disabled = n >= 0 }
  })
  return line('Passwords', 'Export them as a CSV file in the other browser’s password settings, then choose it here', csv)
}

function bring (w) {
  const el = h('div', 'w-page')
  el.append(heading('Bring things over.', 'Bookmarks into the bookmark button, history so the address field already knows where you go, passwords into your keyring. Nothing in the other browser changes.'))
  el.append(card(...bringLines(w)))
  if (!L.native) el.append(card(passwordsLine()))
  return el
}

function hold (w) {
  const el = h('div', 'w-page')
  el.append(heading('Two ways to hold it.', 'Titles across the top, or down the side. The pill slides to the tab you pick either way, and Ctrl+Shift+S changes your mind.'))
  const ways = h('div', 'w-ways')
  const paint = () => {
    ways.replaceChildren(
      way('Tab strip', false, !prefs.sidebar, () => { w.ctx.setSidebar(false); paint() }),
      way('Sidebar', true, !!prefs.sidebar, () => { w.ctx.setSidebar(true); paint() }))
  }
  paint()
  el.append(ways, card(
    line('Tabs wear', 'A letter, or the site’s own icon', segmented([['letters', 'Letters'], ['icons', 'Site icons']], prefs.glyph, v => { setPref('glyph', v); w.ctx.changed('glyph') })),
    line('Look', null, segmented([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], prefs.look, v => { setPref('look', v); w.ctx.setLook(v) }))))
  return el
}

function links (w) {
  const el = h('div', 'w-page')
  el.append(heading('Links from other apps.', 'A click in mail, in chat, in a PDF goes to whichever browser is the default. It can be this one.'))
  const box = card()
  const paint = () => box.replaceChildren(w.isDefault
    ? line('Leech is the default browser', 'Links from other apps open here', h('span', 'check', icon('check')))
    : line('Default browser', 'Links from other apps open in another browser now', action('Make Leech the default', async () => { w.isDefault = await L.defaultBrowser(true); paint() })))
  paint()
  const keys = card(...[['A new tab. Type a place, or words to search.', 'Ctrl+T'], ['Every open tab, by name.', 'Ctrl+K'],
    ['Settings: look, tabs, passwords, privacy.', 'Ctrl+,'], ['Fold the sidebar to the top and back.', 'Ctrl+S']]
    .map(([what, k]) => h('div', 'shortcut', `<span>${esc(what)}</span><span class="keys">${esc(k)}</span>`)))
  const group = h('div', 'group')
  group.append(caption('A few things worth knowing'), keys)
  el.append(box, group)
  return el
}

export const PAGES = [hello, search, bring, hold, links]
/** Each page's name and icon on the rail, in the order of PAGES. */
export const STEPS = [['Welcome', 'home'], ['Search', 'search'], ['Bring things over', 'download'], ['Layout', 'sidebar'], ['Default browser', 'globe']]
