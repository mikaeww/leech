// The first run's pages (Welcome.swift). Each is drawn afresh from the shared state w when shown.
import { esc, h } from '../elements.js'
import { action, segmented, toggle } from '../look/controls.js'
import { icon } from '../look/icons.js'
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

function heading (title, line) {
  return h('div', 'w-heading', `<h1>${esc(title)}</h1><p>${esc(line)}</p>`)
}

function choice (title, detail, on, change) {
  const el = h('div', 'w-choice', `<div><div class="w-choice-title">${esc(title)}</div><div class="w-choice-detail">${esc(detail)}</div></div>`)
  el.append(toggle(on, change))
  return el
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
  el.innerHTML = `<div class="w-mark"></div><h1>Leech</h1><p>A browser with nothing in the way. Tabs and the page, the engine you already trust, and as little around it as we could manage.</p>`
  return el
}

function search (w) {
  const el = h('div', 'w-page')
  el.append(heading('Search and sign in.', 'Words that aren’t an address go to the engine you pick. Sign in now and the first tab you open is already yours.'))
  const grid = h('div', 'w-engines')
  for (const [id, name] of ENGINES) {
    const b = h('button', 'w-engine' + (prefs['search.engine'] === id ? ' on' : ''), esc(name))
    b.addEventListener('click', () => {
      setPref('search.engine', id)
      grid.querySelectorAll('.w-engine').forEach(x => x.classList.toggle('on', x === b))
      paintAccount()
    })
    grid.append(b)
  }
  const account = h('div', 'w-account')
  const paintAccount = () => {
    const found = ACCOUNTS[prefs['search.engine']]
    account.innerHTML = ''
    if (prefs['search.engine'] === 'google' && !L.native) return account.append(h('span', 'w-note', 'Google search works signed out. Google doesn’t allow signing in from browsers built on Electron.'))
    if (!found) return account.append(h('span', 'w-note', 'No account needed for this one.'))
    const [label, url] = found
    const chosen = w.signIn === url
    account.append(action(chosen ? `${label} — opens when you start` : label, () => {
      w.signIn = chosen ? null : url
      paintAccount()
    }, !chosen))
    if (chosen) account.append(h('span', 'w-check', icon('check')))
  }
  paintAccount()
  el.append(grid, account)
  return el
}

function bring (w) {
  const el = h('div', 'w-page')
  el.append(heading('Bring things over.', 'Bookmarks into the bookmark button, history so the address field already knows where you go, passwords into your keyring. Nothing in the other browser changes.'))
  const box = h('div', 'w-bring')
  if (!w.sources.length) box.append(h('span', 'w-note', 'No other browser found on this computer for bookmarks or history.'))
  else {
    if (w.sources.length > 1) box.append(segmented(w.sources.map(s => [s, s]), w.source, v => { w.source = v }))
    else box.append(h('span', 'w-note', `From ${w.sources[0]}`))
    box.append(choice('Bookmarks', 'Folders and all, behind the bookmark button', w.want.bookmarks, v => { w.want.bookmarks = v }))
    box.append(choice('History', 'The last few thousand places, for finishing addresses', w.want.history, v => { w.want.history = v }))
  }
  const passwords = h('div', 'w-choice', '<div><div class="w-choice-title">Passwords</div><div class="w-choice-detail">Export them as a CSV file in the other browser’s password settings, then choose it here</div></div>')
  const csv = h('button', 'action', 'Choose CSV…')
  csv.addEventListener('click', async () => {
    const n = await L.importCSV()
    if (n !== null) { csv.textContent = n < 0 ? 'The keyring refused them' : `${n} passwords`; csv.disabled = n >= 0 }
  })
  passwords.append(csv)
  box.append(passwords)
  const row = h('div', 'w-row')
  if (w.sources.length) {
    const go = action(w.bringing ? 'Bringing…' : w.brought ? 'Brought in' : 'Bring them in', async () => {
      if (w.bringing || w.brought) return
      w.bringing = true
      go.textContent = 'Bringing…'
      const lines = []
      if (w.want.bookmarks) lines.push(`${await w.ctx.bringBookmarks(w.source)} bookmarks`)
      if (w.want.history) lines.push(`${await w.ctx.bringHistory(w.source)} places`)
      w.bringing = false
      w.brought = lines.join(' · ') || 'Nothing chosen'
      go.textContent = 'Brought in'
      note.textContent = w.brought
      note.classList.add('shown')
    }, true)
    const note = h('span', 'w-note result' + (w.brought ? ' shown' : ''), esc(w.brought || ''))
    row.append(go, note)
  }
  el.append(box, row)
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
  const wear = h('div', 'w-row', '<span class="w-label">Tabs wear</span>')
  wear.append(segmented([['letters', 'Letters'], ['icons', 'Site icons']], prefs.glyph, v => { setPref('glyph', v); w.ctx.changed('glyph') }))
  const look = h('div', 'w-row', '<span class="w-label">Look</span>')
  look.append(segmented([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], prefs.look, v => { setPref('look', v); w.ctx.setLook(v) }))
  el.append(ways, wear, look)
  return el
}

function links (w) {
  const el = h('div', 'w-page')
  el.append(heading('Links from other apps.', 'A click in mail, in chat, in a PDF goes to whichever browser is the default. It can be this one.'))
  const row = h('div', 'w-row')
  const paint = () => {
    row.innerHTML = ''
    if (w.isDefault) row.append(h('span', 'w-done', `${icon('check')}<span>Leech is the default browser</span>`))
    else row.append(action('Make Leech the default', async () => { w.isDefault = await L.defaultBrowser(true); paint() }, true))
  }
  paint()
  const keys = h('div', 'w-keys', '<div class="w-small">A few things worth knowing</div>')
  for (const [k, what] of [['Ctrl+T', 'A new tab. Type a place, or words to search.'], ['Ctrl+K', 'Every open tab, by name.'],
    ['Ctrl+,', 'Settings: look, tabs, passwords, privacy.'], ['Ctrl+S', 'Fold the sidebar to the top and back.']]) {
    keys.append(h('div', 'w-key', `<span class="chip">${esc(k)}</span><span>${esc(what)}</span>`))
  }
  el.append(row, keys)
  return el
}

export const PAGES = [hello, search, bring, hold, links]
