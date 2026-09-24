import { ENGINES } from './engine.js'
import { icon } from './icons.js'

// The first run (Welcome.swift), with a page for search and signing in: pages glide in from the side,
// the whole thing fades away when done. Everything chosen here applies at once.

const h = (tag, cls, html) => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (html !== undefined) el.innerHTML = html
  return el
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Where each engine's own account lives, for the sign-in button.
const ACCOUNTS = {
  google: ['Sign in to Google', 'https://accounts.google.com/ServiceLogin?continue=https://www.google.com/'],
  kagi: ['Sign in to Kagi', 'https://kagi.com/signin'],
  brave: ['Sign in to Brave', 'https://account.brave.com/'],
  ecosia: ['Sign in to Ecosia', 'https://www.ecosia.org/accounts'],
  bing: ['Sign in to Microsoft', 'https://login.live.com/']
}

function big (title, fn, filled = false) {
  const b = h('button', 'big' + (filled ? ' filled' : ''), esc(title))
  b.addEventListener('click', fn)
  return b
}

function toggle (on, change) {
  const b = h('button', 'switch' + (on ? ' on' : ''), '<span class="knob-dot"></span>')
  b.addEventListener('click', () => { on = !on; b.classList.toggle('on', on); change(on) })
  return b
}

function segmented (options, value, change) {
  const el = h('div', 'segmented')
  const knob = h('span', 'chosen')
  el.append(knob)
  const slide = b => { knob.style.left = `${b.offsetLeft}px`; knob.style.width = `${b.offsetWidth}px` }
  for (const [id, title] of options) {
    const b = h('button', id === value ? 'on' : '', esc(title))
    b.addEventListener('click', () => {
      value = id
      el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b))
      slide(b)
      change(id)
    })
    el.append(b)
    if (id === value) requestAnimationFrame(() => { knob.style.transition = 'none'; slide(b); requestAnimationFrame(() => { knob.style.transition = '' }) })
  }
  return el
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

export function createWelcome (ctx) {
  const { L, prefs, setPref } = ctx
  const root = h('div', '', `<div class="w-stage"></div><div class="w-foot"><div class="w-dots"></div><span class="spacer"></span></div>`)
  root.id = 'welcome'
  document.querySelector('#app').append(root)
  const stage = root.querySelector('.w-stage')
  const foot = root.querySelector('.w-foot')
  const dots = root.querySelector('.w-dots')

  let page = 0
  let sources = []
  let source = null
  let want = { bookmarks: true, history: true }
  let brought = null
  let bringing = false
  let isDefault = false
  let signIn = null
  L.importSources().then(v => { sources = v; source = v[0] || null; if (page === 2) show(0) })
  L.defaultBrowser(false).then(v => { isDefault = v })

  const pages = [
    () => {
      const el = h('div', 'w-page w-hello')
      el.innerHTML = `<div class="w-mark"><span>L</span></div><h1>Leech</h1><p>A browser with nothing in the way. Tabs and the page, the engine you already trust, and as little around it as we could manage.</p>`
      return el
    },
    () => {
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
        if (!found) return account.append(h('span', 'w-note', 'No account needed for this one.'))
        const [label, url] = found
        const chosen = signIn === url
        account.append(big(chosen ? `${label} — opens when you start` : label, () => {
          signIn = chosen ? null : url
          paintAccount()
        }, !chosen))
        if (chosen) account.append(h('span', 'w-check', icon('check', 12, 2)))
      }
      paintAccount()
      el.append(grid, account)
      return el
    },
    () => {
      const el = h('div', 'w-page')
      el.append(heading('Bring things over.', 'Bookmarks into the bookmark button, history so the address field already knows where you go, passwords into your keyring. Nothing in the other browser changes.'))
      const box = h('div', 'w-bring')
      if (!sources.length) box.append(h('span', 'w-note', 'No other browser found on this computer for bookmarks or history.'))
      else {
        if (sources.length > 1) box.append(segmented(sources.map(s => [s, s]), source, v => { source = v }))
        else box.append(h('span', 'w-note', `From ${sources[0]}`))
        box.append(choice('Bookmarks', 'Folders and all, behind the bookmark button', want.bookmarks, v => { want.bookmarks = v }))
        box.append(choice('History', 'The last few thousand places, for finishing addresses', want.history, v => { want.history = v }))
      }
      const passwords = h('div', 'w-choice', '<div><div class="w-choice-title">Passwords</div><div class="w-choice-detail">Export them as a CSV file in the other browser’s password settings, then choose it here</div></div>')
      const csv = h('button', 'pill-button', 'Choose CSV…')
      csv.addEventListener('click', async () => {
        const n = await L.importCSV()
        if (n !== null) { csv.textContent = n < 0 ? 'The keyring refused them' : `${n} passwords`; csv.disabled = n >= 0 }
      })
      passwords.append(csv)
      box.append(passwords)
      const row = h('div', 'w-row')
      if (sources.length) {
        const go = big(bringing ? 'Bringing…' : brought ? 'Brought in' : 'Bring them in', async () => {
          if (bringing || brought) return
          bringing = true
          go.textContent = 'Bringing…'
          const lines = []
          if (want.bookmarks) lines.push(`${await ctx.bringBookmarks(source)} bookmarks`)
          if (want.history) lines.push(`${await ctx.bringHistory(source)} places`)
          bringing = false
          brought = lines.join(' · ') || 'Nothing chosen'
          go.textContent = 'Brought in'
          note.textContent = brought
          note.classList.add('shown')
        }, true)
        const note = h('span', 'w-note result' + (brought ? ' shown' : ''), esc(brought || ''))
        row.append(go, note)
      }
      el.append(box, row)
      return el
    },
    () => {
      const el = h('div', 'w-page')
      el.append(heading('Two ways to hold it.', 'Titles across the top, or down the side. The pill slides to the tab you pick either way, and Ctrl+Shift+S changes your mind.'))
      const ways = h('div', 'w-ways')
      const paint = () => {
        ways.replaceChildren(
          way('Tab strip', false, !prefs.sidebar, () => { ctx.setSidebar(false); paint() }),
          way('Sidebar', true, !!prefs.sidebar, () => { ctx.setSidebar(true); paint() }))
      }
      paint()
      const wear = h('div', 'w-row', '<span class="w-label">Tabs wear</span>')
      wear.append(segmented([['letters', 'Letters'], ['icons', 'Site icons']], prefs.glyph, v => { setPref('glyph', v); ctx.changed('glyph') }))
      const look = h('div', 'w-row', '<span class="w-label">Look</span>')
      look.append(segmented([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], prefs.look, v => { setPref('look', v); ctx.setLook(v) }))
      el.append(ways, wear, look)
      return el
    },
    () => {
      const el = h('div', 'w-page')
      el.append(heading('Links from other apps.', 'A click in mail, in chat, in a PDF goes to whichever browser is the default. It can be this one.'))
      const row = h('div', 'w-row')
      const paint = () => {
        row.innerHTML = ''
        if (isDefault) row.append(h('span', 'w-done', `${icon('check', 11, 2)}<span>Leech is the default browser</span>`))
        else row.append(big('Make Leech the default', async () => { isDefault = await L.defaultBrowser(true); paint() }, true))
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
  ]

  function show (dir) {
    const next = pages[page]()
    const old = stage.firstElementChild
    if (old && dir) {
      old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-40 * dir}px)` }],
        { duration: ctx.glide.ms * 0.6, easing: ctx.glide.easing, fill: 'forwards' }).finished.then(() => old.remove())
      next.animate([{ opacity: 0, transform: `translateX(${40 * dir}px)` }, { opacity: 1, transform: 'none' }],
        { duration: ctx.glide.ms, easing: ctx.glide.easing })
    } else old?.remove()
    stage.append(next)
    paintFoot()
  }

  function paintFoot () {
    dots.innerHTML = pages.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('')
    foot.querySelectorAll('button').forEach(b => b.remove())
    if (page > 0) foot.append(Object.assign(h('button', 'w-link', 'Back'), { onclick: () => { page--; show(-1) } }))
    if (page < pages.length - 1) foot.append(Object.assign(h('button', 'w-link', 'Skip'), { onclick: finish }))
    foot.append(big(page < pages.length - 1 ? 'Continue' : 'Start browsing', () => {
      if (page < pages.length - 1) { page++; show(1) } else finish()
    }, true))
  }

  function finish () {
    setPref('welcomed', true)
    root.classList.add('leaving')
    setTimeout(() => root.remove(), ctx.settle.ms)
    document.removeEventListener('keydown', keys, true)
    ctx.done(signIn)
  }

  // While it is open the first run has the keys; the blank tab's field underneath doesn't.
  const keys = e => {
    const own = { Enter: () => foot.querySelector('.big.filled')?.click(), ArrowRight: () => page < pages.length - 1 && (page++, show(1)), ArrowLeft: () => page > 0 && (page--, show(-1)) }[e.key]
    if (!own) return
    e.preventDefault()
    e.stopPropagation()
    own()
  }
  document.addEventListener('keydown', keys, true)
  document.activeElement?.blur()
  show(0)
}
