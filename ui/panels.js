import { ENGINES, name as engineName } from './engine.js'
import { icon } from './icons.js'
import { menu } from './menu.js'

// Search's panels (Plate.swift, Settings.swift, Recall.swift, Bookmarks.swift, Passwords.swift, Hidden.swift),
// built from the same pieces: a plate, cards of lines, captions, a hunt field, quick buttons.

const h = (tag, cls, html) => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (html !== undefined) el.innerHTML = html
  return el
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function door (name, title, fn) {
  const b = h('button', 'door', icon(name, 11, 1.5))
  b.title = title
  b.addEventListener('click', fn)
  return b
}

function line (title, detail, control) {
  const el = h('div', 'line', `<div class="words"><div class="name">${esc(title)}</div>${detail ? `<div class="detail">${esc(detail)}</div>` : ''}</div>`)
  if (control) el.append(control)
  return el
}

function card (...parts) {
  const el = h('div', 'card')
  const lines = parts.filter(Boolean)
  lines.forEach((part, i) => {
    if (i && !part.classList.contains('custom')) el.append(h('div', 'rule'))
    el.append(part)
  })
  return el
}

const nothing = text => card(h('div', 'nothing', esc(text)))
const caption = text => h('div', 'caption', esc(text))

function toggle (on, change) {
  const b = h('button', 'switch' + (on ? ' on' : ''), '<span class="knob-dot"></span>')
  b.setAttribute('role', 'switch')
  b.setAttribute('aria-checked', String(on))
  b.addEventListener('click', () => change(!on))
  return b
}

function segmented (options, value, change, wide = false) {
  const el = h('div', 'segmented' + (wide ? ' wide' : ''))
  const knob = h('span', 'chosen')
  el.append(knob)
  for (const [id, title] of options) {
    const b = h('button', id === value ? 'on' : '', esc(title))
    b.addEventListener('click', () => change(id))
    el.append(b)
    if (id === value) requestAnimationFrame(() => { knob.style.left = `${b.offsetLeft}px`; knob.style.width = `${b.offsetWidth}px` })
  }
  return el
}

function pill (title, fn, filled = false) {
  const b = h('button', 'pill-button' + (filled ? ' filled' : ''), esc(title))
  b.addEventListener('click', fn)
  return b
}

function quick (title, fn, red = false) {
  const b = h('button', 'quick' + (red ? ' red' : ''), esc(title))
  b.addEventListener('click', e => { e.stopPropagation(); fn() })
  return b
}

function hunt (prompt, value, change, keep) {
  const box = h('label', 'hunt', icon('search', 11, 1.6))
  const input = h('input')
  input.placeholder = prompt
  input.value = value
  input.spellcheck = false
  input.dataset.keep = keep
  input.autofocus = true
  input.addEventListener('input', () => change(input.value))
  box.append(input)
  if (value) {
    const clear = h('button', 'clear', icon('clearFill', 11, 1))
    clear.addEventListener('click', () => change(''))
    box.append(clear)
  }
  return box
}

const DAY = 86400
function dayOf (t) {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 1000
  if (t >= start) return 'Today'
  if (t >= start - DAY) return 'Yesterday'
  return new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}
const clock = t => new Date(t * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
function said (t) {
  const s = t - Date.now() / 1000
  const [n, unit] = [['day', DAY], ['hour', 3600], ['minute', 60]].map(([u, size]) => [Math.round(s / size), u]).find(([n]) => Math.abs(n) >= 1) || [Math.round(s), 'second']
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' }).format(n, unit)
}

export function createPanels (ctx) {
  const { L, prefs, setPref, history, bookmarks, toast } = ctx
  const root = h('div', '', '<div class="dim"></div>')
  root.id = 'panel'
  root.hidden = true
  document.querySelector('#app').append(root)
  root.querySelector('.dim').addEventListener('click', () => close())

  let kind = null
  let plate = null
  let settingsPage = prefs['settings.page'] || 'general'
  let historyQuery = ''
  let clearing = false
  let loot = []
  let isDefault = false
  let sources = []
  let veils = []
  let vaultList = []
  let vaultQuery = ''
  let openSite = null
  const shown = new Map()
  let adding = false
  let spaceDraft = null
  let renaming = null
  const openFolders = new Set()

  L.downloads().then(list => { loot = list })
  L.onDownloads(list => { loot = list; if (kind === 'downloads') paint() })
  L.onHidden((host, list) => { if (kind === 'hidden' && host === ctx.currentHost()) { veils = list; paint() } })

  function open (which) {
    if (kind === which) return
    kind = which
    clearing = false
    historyQuery = ''
    renaming = null
    root.hidden = false
    root.classList.remove('leaving')
    root.classList.add('showing')
    if (which === 'settings') L.defaultBrowser(false).then(v => { isDefault = v; if (kind === 'settings') paint() })
    if (which === 'bookmarks' || which === 'history') L.importSources().then(v => { sources = v; if (kind === which) paint() })
    if (which === 'hidden') L.hiddenOn(ctx.currentURL()).then(v => { veils = v; if (kind === 'hidden') paint() })
    if (which === 'passwords') { adding = false; loadVault() }
    paint()
    ctx.changed()
  }

  function close () {
    if (!kind) return
    if (kind === 'hidden') ctx.peek(null)
    kind = null
    root.classList.remove('showing')
    root.classList.add('leaving')
    setTimeout(() => { if (!kind) { root.hidden = true; plate?.remove(); plate = null } }, 140)
    ctx.changed()
  }

  function paint () {
    const focused = document.activeElement?.closest?.('#panel input') ? document.activeElement : null
    const caret = focused?.selectionStart
    const keep = focused?.dataset.keep
    plate?.remove()
    plate = ({ settings: settingsPlate, history: historyPlate, downloads: downloadsPlate, bookmarks: bookmarksPlate, hidden: hiddenPlate, passwords: passwordsPlate, space: spacePlate })[kind]()
    root.classList.toggle('anchored', kind === 'hidden')
    root.append(plate)
    const again = keep && plate.querySelector(`input[data-keep="${keep}"]`)
    if (again) { again.focus(); again.setSelectionRange(caret, caret) } else plate.querySelector('input[autofocus]')?.focus()
  }

  // Plate: title 17 semibold with a close door, the content, and a foot under a hairline.
  function titled (title, width, parts, foot) {
    const el = h('div', 'plate')
    el.style.width = `${width}px`
    const head = h('div', 'head', `<div class="heading">${esc(title)}</div>`)
    head.append(door('close', 'Done   esc', close))
    const body = h('div', 'body')
    body.append(...parts.filter(Boolean))
    el.append(head, body)
    if (foot) {
      const f = h('div', 'foot')
      f.append(...foot.filter(Boolean))
      el.append(f)
    }
    return el
  }

  // ---- settings ----

  const PAGES = [['general', 'General', 'window'], ['tabs', 'Tabs', 'tabs'], ['passwords', 'Passwords', 'key'],
    ['downloads', 'Downloads', 'download'], ['privacy', 'Privacy', 'hand'], ['about', 'About', 'info']]

  function settingsPlate () {
    const el = h('div', 'plate settings')
    const rail = h('div', 'rail', '<div class="rail-title">Settings</div>')
    for (const [id, title, glyph] of PAGES) {
      const b = h('button', 'rail-row' + (settingsPage === id ? ' on' : ''), `${icon(glyph, 12, 1.5)}<span>${title}</span>`)
      b.addEventListener('click', () => { settingsPage = id; setPref('settings.page', id); paint() })
      rail.append(b)
    }
    const content = h('div', 'content')
    const head = h('div', 'head', `<div class="heading">${PAGES.find(p => p[0] === settingsPage)[1]}</div>`)
    head.append(door('close', 'Done   esc', close))
    const body = h('div', 'scroll')
    body.append(...({ general, tabs, passwords, downloads, privacy, about })[settingsPage]())
    content.append(head, body)
    el.append(rail, h('div', 'divide'), content)
    return el
  }

  function set (key, value) {
    setPref(key, value)
    ctx.prefsChanged(key)
    paint()
  }

  function searchDetail () {
    if (prefs['search.engine'] !== 'custom') return 'Where words that aren’t an address go'
    const name = engineName('custom', prefs['search.custom'])
    return name === 'Google' ? 'An http or https address with %s where the words go. Until then, Google' : `Words go to ${name}`
  }

  function general () {
    const custom = prefs['search.engine'] === 'custom'
    const picker = h('button', 'popup', `<span>${esc(custom ? 'Custom' : engineName(prefs['search.engine']))}</span>${icon('updown', 10, 1.8)}`)
    picker.addEventListener('click', async () => {
      const r = picker.getBoundingClientRect()
      const chosen = await menu([...ENGINES.map(([id, title]) => ({ id, label: title, checked: prefs['search.engine'] === id })), { id: 'custom', label: 'Custom', checked: custom }], { x: r.left, y: r.bottom + 2 })
      if (chosen) set('search.engine', chosen)
    })
    let field = null
    if (custom) {
      field = h('input', 'plain-field custom')
      field.placeholder = 'https://example.com/search?q=%s'
      field.value = prefs['search.custom']
      field.dataset.keep = 'custom'
      field.spellcheck = false
      field.addEventListener('input', () => { setPref('search.custom', field.value.trim()) })
      field.addEventListener('change', () => paint())
    }
    const made = h('span', 'check', icon('check', 12, 2))
    return [card(
      line('Open links from other apps', isDefault ? 'Leech is the default browser on this computer' : 'Mail, chat and the rest still send links elsewhere',
        isDefault ? made : pill('Make default', async () => {
          isDefault = await L.defaultBrowser(true)
          toast(isDefault ? 'Links now open here' : 'The system didn’t change it')
          paint()
        }, true)),
      line('Search with', searchDetail(), picker),
      field,
      line('Appearance', 'Light, dark, or whatever the system is doing — pages follow it too',
        segmented([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], prefs.look, v => { set('look', v); L.look(v) })),
      line('Peek at a link with a shift-click', 'Its page opens in a panel over the one you’re reading. Escape puts it away; the other button keeps it as a tab',
        toggle(prefs['links.peek'], v => set('links.peek', v))),
      line('Show where links go', 'Point at a link and its address shows at the bottom of the page', toggle(prefs['links.show'], v => set('links.show', v)))
    )]
  }

  function tabs () {
    return [card(
      line('Tabs in a sidebar', 'Down the left instead of across the top. Pull its edge to make it wider; double-click the edge to reset.',
        toggle(prefs.sidebar, v => { ctx.setSidebar(v); paint() })),
      prefs.sidebar && line('Hide the sidebar until the pointer reaches the edge', 'The page takes the whole window; push against its left edge for the tabs. Ctrl+S keeps them out.',
        toggle(prefs['sidebar.hides'], v => set('sidebar.hides', v))),
      line('Tabs show', 'Beside the title, and on a pinned square', segmented([['letters', 'Letters'], ['icons', 'Site icons']], prefs.glyph, v => set('glyph', v))),
      line('Show the bookmarks bar', 'Your bookmarks in a row above the page, folders opening as menus. It folds away with the tabs',
        toggle(prefs['bookmarks.bar'], v => set('bookmarks.bar', v))),
      line('Show how far you’ve read', 'The tab you’re on fills with grey as you scroll down the page', toggle(prefs['tabs.reading'], v => set('tabs.reading', v))),
      line('Sleep tabs you aren’t using', 'After half an hour away they come back where you left them. Pinned tabs, sound and anything typed stay awake.',
        toggle(prefs['tabs.sleep'], v => set('tabs.sleep', v))),
      line('Spaces', 'Separate sets of tabs, signed in where the others are or starting afresh, switched with Alt+1–Alt+9, two fingers across the tabs, or the space’s icon.',
        toggle(prefs.spaces, v => set('spaces', v)))
    )]
  }

  function passwords () {
    const never = prefs['passwords.never']
    return [
      card(
        line('Your passwords', 'In the desktop keyring, sealed so only Leech can read them', pill('Open…', () => { kind = null; open('passwords') })),
        line('Offer to save passwords', 'Asked once per site, never again for a site you refuse', toggle(prefs['passwords.save'], v => set('passwords.save', v))),
        line('Fill in sign-ins', 'Click a sign-in box and the accounts kept for the site hang from it', toggle(prefs['passwords.fill'], v => set('passwords.fill', v))),
        never.length && line('Sites never asked', `${never.length} sites told to stop offering`, pill('Forget', () => { set('passwords.never', []); toast('Every site can ask again') }))
      ),
      card(line('Bring yours in', 'A CSV exported from Chrome, Brave, Firefox or Zen — nothing leaves this computer', pill('Import…', importCSV)))
    ]
  }

  async function importCSV () {
    const n = await L.importCSV()
    if (n === null) return
    toast(n < 0 ? 'The keyring refused them' : `${n} ${n === 1 ? 'password' : 'passwords'} brought in`)
    if (kind === 'passwords') loadVault()
  }

  function downloads () {
    const folder = prefs.downloads || ctx.downloadsFolder
    return [card(
      line('Save to', folder.replace(ctx.home, '~'), pill('Change…', async () => {
        const chosen = await L.chooseFolder()
        if (chosen) set('downloads', chosen)
      })),
      line('Ask where to save each file', null, toggle(prefs['downloads.ask'], v => set('downloads.ask', v)))
    )]
  }

  function privacy () {
    const host = ctx.currentHost()
    const paused = prefs['shield.paused']
    return [
      card(
        line('Block ads and trackers', 'Third parties whose only job is to watch', toggle(prefs.shield, v => set('shield', v))),
        prefs.shield && host && line(`Block on ${host}`, 'Turn off here if the site breaks — the page reloads', toggle(!paused.includes(host), v => {
          set('shield.paused', v ? paused.filter(x => x !== host) : [...paused, host].sort())
          ctx.reload()
        })),
        line('Camera and microphone', 'What each site was allowed or refused', pill('Forget choices', () => { set('capture', {}); toast('Every site will ask again') }))
      ),
      card(
        line('History', 'Every address you have been to', pill('Clear', () => { history.clear(); toast('History cleared') })),
        line('Cookies and sign-ins', 'Signs you out of every site', pill('Sign out of everything', async () => { await L.clear('cookies'); toast('Signed out of everything') })),
        line('Cache', 'Only what was fetched to draw pages', pill('Clear', async () => { await L.clear('cache'); toast('Cache cleared') }))
      )
    ]
  }

  function about () {
    const head = h('div', 'about-head', `<div><div class="about-name">Leech</div><div class="about-version">Search’s frontend, by Office Commun, on Chromium · version ${esc(ctx.version)}</div></div>`)
    const shortcut = (keys, does) => h('div', 'shortcut', `<span>${esc(does)}</span><span class="keys">${esc(keys)}</span>`)
    return [head, card(
      shortcut('Ctrl+L', 'Address'),
      shortcut('Ctrl+K', 'Switch tab'),
      shortcut('Ctrl+T  Ctrl+W  Ctrl+Shift+T', 'New, close, reopen tab'),
      shortcut('Ctrl+Shift+V', 'Paste and go'),
      shortcut('Ctrl+Tab  Ctrl+1–9', 'Next tab, a tab by its place'),
      shortcut('Ctrl+Shift+S', 'Tabs in a sidebar'),
      shortcut('Ctrl+S', 'Fold the sidebar away'),
      shortcut('Ctrl+Shift+R', 'Reading mode'),
      shortcut('Ctrl+Shift+H', 'Hide something on this site'),
      shortcut('Ctrl+Shift+P', 'Float the video')
    )]
  }

  // ---- history (HistoryPanel) ----

  function historyPlate () {
    const visits = history.everything(historyQuery)
    const parts = [hunt('Search everywhere you have been', historyQuery, v => { historyQuery = v; paint() }, 'history')]
    if (!visits.length) parts.push(nothing(historyQuery ? 'Nothing matches.' : 'Nothing yet.'))
    else {
      const list = h('div', 'list')
      let group = null
      let box = null
      for (const v of visits.slice(0, 500)) {
        const day = dayOf(v.last)
        if (day !== group) {
          group = day
          box = h('div', 'card')
          const g = h('div', 'group')
          g.append(caption(day), box)
          list.append(g)
        } else box.append(h('div', 'rule'))
        const row = h('div', 'entry', `${ctx.markFor(v.url, 16)}<div class="words"><div class="name">${esc(v.title || v.key)}</div><div class="detail">${esc(v.key)}</div></div><span class="time">${clock(v.last)}</span>`)
        row.append(quick('Remove', () => { history.forget(v.key); paint() }, true))
        row.addEventListener('click', () => { close(); ctx.openURL(v.url) })
        box.append(row)
      }
      parts.push(list)
    }
    const count = visits.length
    const foot = clearing
      ? [sweeps()]
      : [h('span', 'foot-note', count === 1 ? '1 page' : `${count} pages`),
          ...(sources.length ? [h('span', 'foot-note', '· bring in from'), ...sources.map(name => pill(name, async () => {
            const list = await L.importHistory(name)
            ctx.historyTake(list)
            toast(`${list.length} places from ${name} brought in`)
            paint()
          }))] : []),
          h('span', 'spacer'), pill('Clear…', () => { clearing = true; paint() })]
    return titled('History', 600, parts, foot)
  }

  function sweeps () {
    const box = h('div', 'group')
    box.style.cssText = 'flex:1;gap:10px'
    const back = h('div')
    back.style.cssText = 'display:flex;justify-content:flex-end'
    back.append(pill('Back', () => { clearing = false; paint() }))
    box.append(card(
      line('History', 'Everywhere you have been', pill('Clear', () => { history.clear(); clearing = false; paint() })),
      line('Cookies and sign-ins', 'Signs you out of every site', pill('Sign out of everything', async () => { await L.clear('cookies'); toast('Signed out of everything') })),
      line('Cache', 'Only what was fetched to draw pages', pill('Clear', async () => { await L.clear('cache'); toast('Cache cleared') }))
    ), back)
    return box
  }

  // ---- downloads (DownloadsPanel) ----

  function downloadsPlate () {
    let body
    if (!loot.length) body = nothing('Nothing downloaded yet.')
    else {
      body = h('div', 'list')
      const box = h('div', 'card')
      loot.forEach((d, i) => {
        if (i) box.append(h('div', 'rule'))
        const row = h('div', 'entry', `<span class="doc">${icon('doc', 13, 1.4)}</span><div class="words"><div class="name">${esc(d.name)}</div><div class="detail">${esc(d.from ? `${d.from} · ${said(d.date)}` : said(d.date))}</div></div>`)
        row.append(quick('Show in Folder', () => L.showFile(d.path)), quick('Remove', () => L.forgetDownload(d.path), true))
        row.addEventListener('click', () => L.openFile(d.path))
        box.append(row)
      })
      body.append(box)
    }
    const folder = (prefs.downloads || ctx.downloadsFolder).split('/').pop()
    return titled('Downloads', 560, [body], [
      h('span', 'foot-note', loot.length ? 'Clearing the list leaves the files where they are' : `Files land in ${esc(folder)}`),
      h('span', 'spacer'),
      loot.length && pill('Clear list', () => L.clearDownloads())
    ])
  }

  // ---- bookmarks (BookmarksPanel, BookmarkOutline) ----

  function outline (list, depth, into) {
    for (const node of list) {
      const folder = !!node.children
      const opened = openFolders.has(node.id)
      const row = h('div', 'outline-row')
      row.style.paddingLeft = `${18 * depth + 10}px`
      const count = folder ? bookmarks.countIn(node) : 0
      row.innerHTML = folder
        ? `<span class="chevron${opened ? ' open' : ''}">${icon('forward', 9, 2)}</span><span class="mark folder">${icon('folderFill', 9, 1)}</span><span class="name">${esc(node.title)}</span>${count ? `<span class="count">${count}</span>` : ''}`
        : `<span class="chevron-space"></span>${ctx.markFor(node.url, 15)}<span class="name">${esc(node.title)}</span>`
      row.title = node.url || ''
      row.addEventListener('click', () => {
        if (folder) { opened ? openFolders.delete(node.id) : openFolders.add(node.id); paint() } else { close(); ctx.openURL(node.url) }
      })
      row.addEventListener('contextmenu', e => { e.preventDefault(); bookmarkMenu(node) })
      into.append(row)
      if (folder && opened) {
        if (!node.children.length) into.append(Object.assign(h('div', 'outline-empty', 'Empty'), { style: `padding-left:${18 * (depth + 1) + 26}px` }))
        else outline(node.children, depth + 1, into)
      }
    }
  }

  async function bookmarkMenu (node) {
    const targets = []
    const walk = (list, depth) => {
      for (const n of list) {
        if (!n.children || n === node) continue
        targets.push({ id: `to:${n.id}`, label: '   '.repeat(depth) + n.title })
        walk(n.children, depth + 1)
      }
    }
    walk(bookmarks.tree, 0)
    const chosen = await menu([
      ...(node.url ? [{ id: 'open', label: 'Open' }, '-'] : []),
      { id: 'move', label: 'Move to', items: [{ id: 'to:', label: 'Top Level' }, ...(targets.length ? ['-', ...targets] : [])] },
      { id: 'rename', label: 'Rename' },
      '-',
      { id: 'remove', label: 'Remove' }
    ])
    if (!chosen) return
    if (chosen === 'open') { close(); ctx.openURL(node.url) }
    if (chosen.startsWith('to:')) bookmarks.move(node.id, chosen.slice(3) || null)
    if (chosen === 'rename') renaming = node.id
    if (chosen === 'remove') bookmarks.remove(node.id)
    ctx.bookmarksChanged()
    paint()
  }

  function bookmarksPlate () {
    const parts = []
    if (renaming) {
      const node = bookmarks.find(renaming)?.node
      if (node) {
        const input = h('input', 'plain-field')
        input.value = node.title
        input.autofocus = true
        input.style.width = '260px'
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { bookmarks.rename(node.id, input.value); renaming = null; ctx.bookmarksChanged(); paint() }
          if (e.key === 'Escape') { e.stopPropagation(); renaming = null; paint() }
        })
        parts.push(card(line('Rename', node.title, input)))
      }
    }
    if (!bookmarks.tree.length) parts.push(nothing('Nothing kept yet. Add this page with Ctrl+Shift+B, or bring yours in below.'))
    else {
      const list = h('div', 'list bookmarks')
      const box = h('div', 'card')
      const rows = h('div', 'outline-list')
      outline(bookmarks.tree, 0, rows)
      box.append(rows)
      list.append(box)
      parts.push(list)
    }
    const count = bookmarks.count
    return titled('Bookmarks', 600, parts, [
      sources.length && h('span', 'foot-note', 'Bring in from'),
      ...sources.map(name => pill(name, async () => {
        const tree = await L.importBookmarks(name)
        bookmarks.take(name, tree)
        ctx.bookmarksChanged()
        toast(`Bookmarks from ${name} brought in`)
        paint()
      })),
      h('span', 'spacer'),
      h('span', 'foot-note', count === 1 ? '1 bookmark' : `${count} bookmarks`)
    ])
  }

  // ---- hidden on this site (HiddenPanel) ----

  function hiddenPlate () {
    const host = ctx.currentHost()
    const parts = []
    if (!veils.length) parts.push(nothing('Nothing is hidden here.'))
    else {
      const cssWithout = sel => veils.filter(v => v.selector !== sel).map(v => `${v.selector} { display: none !important; }`).join('\n')
      const group = h('div', 'group')
      const list = h('div', 'list short')
      const box = h('div', 'card')
      veils.forEach((v, i) => {
        if (i) box.append(h('div', 'rule'))
        const row = h('div', 'entry veil', `<div class="words"><div class="name">${esc(v.label)}</div>${v.note ? `<div class="detail">${esc(v.note)}</div>` : ''}</div>`)
        row.append(quick('Restore', () => { ctx.peek(null); L.veil('restore', ctx.currentURL(), v.selector) }))
        row.addEventListener('mouseenter', () => ctx.peek(cssWithout(v.selector), v.selector))
        box.append(row)
      })
      list.append(box)
      group.append(caption('Hidden on this site — rest on a line to see it'), list)
      group.addEventListener('mouseleave', () => ctx.peek(null))
      parts.push(group)
    }
    return titled(host || 'This page', 380, parts, [
      pill('Hide something…', () => { close(); ctx.startVeiling() }, true),
      veils.length && pill('Restore all', () => L.veil('restore-all', ctx.currentURL())),
      h('span', 'spacer')
    ])
  }

  // ---- passwords (PasswordsPanel) ----

  async function loadVault () {
    vaultList = await L.vault('list')
    if (kind === 'passwords') paint()
  }

  function addForm () {
    const form = h('div', 'add-form')
    const field = (placeholder, type = 'text') => {
      const i = h('input', 'plain-field')
      i.placeholder = placeholder
      i.type = type
      i.spellcheck = false
      return i
    }
    const site = field('Site')
    const user = field('Username')
    const pass = field('Password', 'password')
    site.autofocus = true
    const save = pill('Save', async () => {
      if (!site.value.trim() || !pass.value) return
      const result = await L.vault('save', site.value.trim(), user.value.trim(), pass.value)
      if (result === 'refused') return toast('The keyring refused it')
      adding = false
      loadVault()
    }, true)
    pass.addEventListener('keydown', e => { if (e.key === 'Enter') save.click() })
    const top = h('div', 'pair')
    top.append(site, user)
    const bottom = h('div', 'pair')
    bottom.append(pass, save)
    form.append(top, bottom)
    return card(form)
  }

  function passwordsPlate () {
    const needle = vaultQuery.trim().toLowerCase()
    const matches = vaultList.filter(l => !needle || l.host.includes(needle) || l.user.toLowerCase().includes(needle))
    const sites = [...new Set(matches.map(l => l.host))].sort()
    const top = h('div')
    top.style.cssText = 'display:flex;gap:10px;align-items:center'
    top.append(hunt('Search sites and accounts', vaultQuery, v => { vaultQuery = v; paint() }, 'vault'), pill(adding ? 'Cancel' : 'Add', () => { adding = !adding; paint() }, !adding))
    const parts = [top]
    if (adding) parts.push(addForm())
    if (!sites.length) parts.push(nothing(vaultList.length ? 'Nothing matches.' : 'Nothing kept yet. Sign in somewhere and say yes, or bring yours in below.'))
    else {
      const list = h('div', 'list passwords')
      const box = h('div', 'card')
      sites.forEach((host, i) => {
        if (i) box.append(h('div', 'rule'))
        const logins = matches.filter(l => l.host === host)
        const isOpen = openSite === host
        const extra = logins.length > 1 ? `${logins.length} accounts` : (!isOpen && logins[0].user) || ''
        const row = h('div', 'site-row' + (isOpen ? ' open' : ''), `${ctx.markFor('https://' + host, 16)}<span class="host">${esc(host)}</span>${extra ? `<span class="extra">${esc(extra)}</span>` : ''}<span class="chevron${isOpen ? ' open' : ''}">${icon('forward', 9, 2)}</span>`)
        row.addEventListener('click', () => { openSite = isOpen ? null : host; paint() })
        box.append(row)
        if (!isOpen) return
        const accounts = h('div', 'accounts-of')
        for (const a of logins) {
          const key = `${a.host}|${a.user}`
          const secret = shown.get(key)
          const acc = h('div', 'account-row' + (secret ? ' keep' : ''), `<span class="user${a.user ? '' : ' none'}">${esc(a.user || 'No username')}</span><span class="secret${secret ? ' shown' : ''}">${secret ? esc(secret) : '•'.repeat(10)}</span>`)
          acc.append(
            quick(secret ? 'Hide' : 'Show', async () => {
              if (secret) shown.delete(key)
              else {
                shown.set(key, await L.vault('reveal', a.host, a.user))
                setTimeout(() => { shown.delete(key); if (kind === 'passwords') paint() }, 15000)
              }
              paint()
            }),
            quick('Copy', async () => { L.copy(await L.vault('reveal', a.host, a.user)); toast('Password copied') }),
            quick('Remove', async () => { await L.vault('forget', a.host, a.user); loadVault() }, true))
          accounts.append(acc)
        }
        box.append(accounts)
      })
      list.append(box)
      parts.push(list)
    }
    return titled('Passwords', 620, parts, [
      h('span', 'foot-note', 'Bring in from'),
      pill('CSV file…', importCSV),
      h('span', 'spacer'),
      h('span', 'foot-note', vaultList.length === 1 ? '1 password' : `${vaultList.length} passwords`),
      h('span', 'foot-small', 'Export them as CSV in Chrome, Brave, Firefox or Zen first. Everything lands in your own keyring, under Leech.')
    ])
  }

  // ---- a new space, or a new name for this one ----

  function spacePlate () {
    const d = spaceDraft
    const input = h('input', 'plain-field')
    input.placeholder = 'Name'
    input.value = d.name || ''
    input.autofocus = true
    input.dataset.keep = 'space'
    input.spellcheck = false
    input.style.cssText = 'font-size:13px;height:30px'
    input.addEventListener('input', () => { d.name = input.value })
    const done = () => {
      if (!input.value.trim()) return input.focus()
      close()
      if (d.mode === 'new') ctx.createSpace(input.value, d.shares)
      else ctx.renameSpace(input.value)
    }
    input.addEventListener('keydown', e => { if (e.key === 'Enter') done() })
    const parts = [input]
    if (d.mode === 'new') {
      parts.push(segmented([['in', 'Signed in'], ['out', 'Signed out']], d.shares ? 'in' : 'out', v => { d.shares = v === 'in'; paint() }, true))
      parts.push(h('div', 'foot-note', d.shares ? 'Signed in wherever your other spaces are.' : 'Its own cookies and sign-ins, starting from none.'))
    }
    return titled(d.mode === 'new' ? 'New space' : 'Rename space', 380, parts, [h('span', 'spacer'), pill('Cancel', close), pill(d.mode === 'new' ? 'Create' : 'Rename', done, true)])
  }

  return {
    space: draft => { spaceDraft = { shares: true, ...draft }; kind = null; open('space') },
    open,
    close,
    toggle: which => kind === which ? close() : open(which),
    get kind () { return kind },
    refresh: () => kind && paint()
  }
}
