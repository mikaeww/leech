import { ENGINES, name as engineName } from './engine.js'
import { icon } from './icons.js'
import { pretty } from './address.js'

// Search's panels: a plate over a light scrim, built from cards of lines with a control on the right.

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
  const el = h('div', 'line')
  el.innerHTML = `<div class="words"><div class="name">${esc(title)}</div>${detail ? `<div class="detail">${esc(detail)}</div>` : ''}</div>`
  if (control) el.append(control)
  return el
}

function card (...lines) {
  const el = h('div', 'card')
  lines.filter(Boolean).forEach((l, i) => {
    if (i) el.append(h('div', 'rule'))
    el.append(l)
  })
  return el
}

function toggle (on, change) {
  const b = h('button', 'switch' + (on ? ' on' : ''), '<span class="knob"></span>')
  b.setAttribute('role', 'switch')
  b.setAttribute('aria-checked', String(on))
  b.addEventListener('click', () => change(!on))
  return b
}

function segmented (options, value, change) {
  const el = h('div', 'segmented')
  const knob = h('span', 'chosen')
  el.append(knob)
  options.forEach(([id, title], i) => {
    const b = h('button', id === value ? 'on' : '', esc(title))
    b.addEventListener('click', () => change(id))
    el.append(b)
    if (id === value) requestAnimationFrame(() => { knob.style.left = `${b.offsetLeft}px`; knob.style.width = `${b.offsetWidth}px` })
    b.dataset.index = i
  })
  return el
}

function pill (title, fn, filled = false) {
  const b = h('button', 'pill-button' + (filled ? ' filled' : ''), esc(title))
  b.addEventListener('click', fn)
  return b
}

function field (placeholder, value, change) {
  const box = h('label', 'search-field', icon('search', 11, 1.4))
  const input = h('input')
  input.placeholder = placeholder
  input.value = value
  input.spellcheck = false
  input.addEventListener('input', () => change(input.value))
  box.append(input)
  return { box, input }
}

const DAY = 86400
function dayOf (t) {
  const d = new Date(t * 1000)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 1000
  if (t >= start) return 'Today'
  if (t >= start - DAY) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' }) })
}
const clock = t => new Date(t * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
function ago (t) {
  const s = Date.now() / 1000 - t
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < DAY) return `${Math.floor(s / 3600)} h ago`
  return dayOf(t)
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
  const openFolders = new Set()

  let veils = []
  let vaultList = []
  let vaultQuery = ''
  const openSites = new Set()
  const shown = new Map()
  let adding = false
  L.downloads().then(list => { loot = list })
  L.onHidden((host, list) => { if (kind === 'hidden' && host === ctx.currentHost()) { veils = list; paint() } })
  L.onDownloads(list => { loot = list; if (kind === 'downloads') paint() })

  function open (which) {
    if (kind === which) return
    kind = which
    clearing = false
    historyQuery = ''
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
    plate = ({ settings: settingsPlate, history: historyPlate, downloads: downloadsPlate, bookmarks: bookmarksPlate, hidden: hiddenPlate, passwords: passwordsPlate })[kind]()
    root.classList.toggle('anchored', kind === 'hidden')
    root.append(plate)
    const again = keep && plate.querySelector(`input[data-keep="${keep}"]`)
    if (again) { again.focus(); again.setSelectionRange(caret, caret) } else plate.querySelector('input[autofocus]')?.focus()
  }

  function titled (title, width, body, foot) {
    const el = h('div', 'plate')
    el.style.width = `${width}px`
    const head = h('div', 'head', `<div class="heading">${esc(title)}</div>`)
    head.append(door('close', 'Done   esc', close))
    el.append(head, body)
    if (foot) {
      const f = h('div', 'foot')
      f.append(...foot)
      el.append(f)
    }
    return el
  }

  // ---- settings ----

  const PAGES = [['general', 'General', 'window'], ['tabs', 'Tabs', 'tabs'], ['passwords', 'Passwords', 'key'], ['downloads', 'Downloads', 'download'], ['privacy', 'Privacy', 'hand'], ['about', 'About', 'info']]

  function settingsPlate () {
    const el = h('div', 'plate settings')
    const rail = h('div', 'rail', '<div class="rail-title">Settings</div>')
    for (const [id, title, glyph] of PAGES) {
      const b = h('button', 'rail-row' + (settingsPage === id ? ' on' : ''), `${icon(glyph, 12, 1.4)}<span>${title}</span>`)
      b.addEventListener('click', () => { settingsPage = id; setPref('settings.page', id); paint() })
      rail.append(b)
    }
    const content = h('div', 'content')
    const head = h('div', 'head', `<div class="heading">${PAGES.find(p => p[0] === settingsPage)[1]}</div>`)
    head.append(door('close', 'Done   esc', close))
    const body = h('div', 'scroll')
    body.append(...({ general, tabs, passwords, downloads, privacy, about })[settingsPage]())
    content.append(head, body)
    el.append(rail, content)
    return el
  }

  function set (key, value) {
    setPref(key, value)
    ctx.prefsChanged(key)
    paint()
  }

  function general () {
    const custom = prefs['search.engine'] === 'custom'
    const engineButton = pill(`${engineName(prefs['search.engine'], prefs['search.custom'])} ▾`, async () => {
      const chosen = await L.menu([...ENGINES.map(([id, title]) => ({ id, label: title, checked: prefs['search.engine'] === id })), '-', { id: 'custom', label: 'Custom…', checked: custom }])
      if (chosen) set('search.engine', chosen)
    })
    const customLine = custom && (() => {
      const input = h('input', 'plain-field')
      input.placeholder = 'https://example.com/search?q=%s'
      input.value = prefs['search.custom']
      input.dataset.keep = 'custom'
      input.spellcheck = false
      input.addEventListener('change', () => set('search.custom', input.value.trim()))
      return line('Custom search', 'An address with %s where the words go', input)
    })()
    return [card(
      line('Open links from other apps', isDefault ? 'Leech is the default browser' : 'Mail, chat and the rest still send links elsewhere',
        isDefault ? null : pill('Make Default', async () => { isDefault = await L.defaultBrowser(true); paint() })),
      line('Search with', 'What the address field does with words that aren’t an address', engineButton),
      customLine,
      line('Appearance', 'Light, dark, or whatever the system is doing — pages follow it too',
        segmented([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], prefs.look, v => { set('look', v); L.look(v) })),
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
      line('Sleep tabs you aren’t using', 'After half an hour away they come back where you left them. Pinned tabs, sound and anything typed stay awake.', toggle(prefs['tabs.sleep'], v => set('tabs.sleep', v)))
    )]
  }

  function passwords () {
    const never = prefs['passwords.never']
    return [card(
      line('Your passwords', 'Kept in the desktop keyring, sealed so only Leech can read them', pill('Open…', () => open('passwords'))),
      line('Offer to save passwords', 'After a sign-in has worked, never before', toggle(prefs['passwords.save'], v => set('passwords.save', v))),
      line('Fill in sign-ins', 'Click a sign-in box and the accounts kept for the site hang from it', toggle(prefs['passwords.fill'], v => set('passwords.fill', v))),
      never.length && line('Sites never asked', `${never.length} ${never.length === 1 ? 'site' : 'sites'} told to stop offering`, pill('Forget', () => set('passwords.never', []))),
      line('Bring yours in', 'Export them as a CSV file from Chrome, Brave, Firefox or Zen, then choose that file', pill('CSV File…', importCSV))
    )]
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
      line('Save to', folder.replace(ctx.home, '~'), pill('Choose…', async () => {
        const chosen = await L.chooseFolder()
        if (chosen) set('downloads', chosen)
      })),
      line('Ask where to save each file', null, toggle(prefs['downloads.ask'], v => set('downloads.ask', v)))
    )]
  }

  function privacy () {
    const host = ctx.currentHost()
    const paused = prefs['shield.paused']
    const captureCount = Object.keys(prefs.capture).length
    return [
      card(
        line('Block ads and trackers', 'Third parties whose only job is to watch', toggle(prefs.shield, v => set('shield', v))),
        prefs.shield && host && line(`Block on ${host}`, 'Turn off here if the site breaks — the page reloads', toggle(!paused.includes(host), v => {
          set('shield.paused', v ? paused.filter(x => x !== host) : [...paused, host].sort())
          ctx.reload()
        })),
        line('Camera, microphone and the rest', captureCount ? `What ${captureCount === 1 ? 'one site was' : `${captureCount} sites were`} allowed or refused` : 'Nothing allowed or refused yet',
          captureCount ? pill('Forget', () => set('capture', {})) : null)
      ),
      h('div', 'caption', 'Clear'),
      card(
        line('History', 'Every address you have been to', pill('Clear', () => { history.clear(); toast('History cleared') })),
        line('Cookies and sign-ins', 'Signs you out of every site', pill('Sign out of everything', async () => { await L.clear('cookies'); toast('Signed out of everything') })),
        line('Cache', 'Only what was fetched to draw pages', pill('Clear', async () => { await L.clear('cache'); toast('Cache cleared') }))
      )
    ]
  }

  function about () {
    const head = h('div', 'about-head', `<div class="about-name">Leech</div><div class="about-version">Search’s frontend on Chromium · version ${esc(ctx.version)}</div>`)
    const keys = [
      ['Address', 'Ctrl+L'], ['Switch tab', 'Ctrl+K'], ['New tab', 'Ctrl+T'], ['Close tab', 'Ctrl+W'], ['Reopen closed tab', 'Ctrl+Shift+T'],
      ['Tabs across the top or down the left', 'Ctrl+Shift+S'], ['Fold the tabs away', 'Ctrl+S'], ['Find', 'Ctrl+F'],
      ['History', 'Ctrl+H'], ['Downloads', 'Ctrl+J'], ['Bookmark this page', 'Ctrl+Shift+B'], ['Bookmarks', 'Ctrl+Shift+O'], ['Settings', 'Ctrl+,']
    ]
    const list = card(...keys.map(([what, key]) => line(what, null, h('span', 'key-chip', esc(key)))))
    return [head, list]
  }

  // ---- history ----

  function historyPlate () {
    const body = h('div', 'body')
    const { box, input } = field('Search everywhere you have been', historyQuery, v => { historyQuery = v; paint() })
    input.autofocus = true
    input.dataset.keep = 'history'
    body.append(box)
    const list = h('div', 'list tall')
    if (clearing) {
      list.append(card(
        line('History', 'Everywhere you have been', pill('Clear', () => { history.clear(); clearing = false; paint() })),
        line('Cookies and sign-ins', 'Signs you out of every site', pill('Sign out of everything', async () => { await L.clear('cookies'); toast('Signed out of everything') })),
        line('Cache', 'Only what was fetched to draw pages', pill('Clear', async () => { await L.clear('cache'); toast('Cache cleared') }))
      ), pill('Back', () => { clearing = false; paint() }))
    } else {
      const visits = history.everything(historyQuery).slice(0, 400)
      if (!visits.length) list.append(h('div', 'empty', historyQuery ? 'Nothing matches.' : 'Nowhere yet.'))
      let group = null
      let box = null
      for (const v of visits) {
        const day = dayOf(v.last)
        if (day !== group) {
          group = day
          list.append(h('div', 'caption', esc(day)))
          box = h('div', 'card')
          list.append(box)
        } else box.append(h('div', 'rule'))
        const row = h('div', 'entry', `${ctx.markFor(v.url, 16)}<div class="words"><div class="name">${esc(v.title || v.key)}</div><div class="detail middle">${esc(v.key)}</div></div><span class="time">${clock(v.last)}</span>`)
        const remove = h('button', 'remove', 'Remove')
        remove.addEventListener('click', e => { e.stopPropagation(); history.forget(v.key); paint() })
        row.append(remove)
        row.addEventListener('click', () => { close(); ctx.openURL(v.url) })
        box.append(row)
      }
    }
    body.append(list)
    const count = history.everything().length
    const bring = sources.map(name => pill(name, async () => {
      const list = await L.importHistory(name)
      ctx.historyTake(list)
      toast(`${list.length} places from ${name} brought in`)
      paint()
    }))
    return titled('History', 600, body, [h('span', 'foot-note', `${count} ${count === 1 ? 'page' : 'pages'}${sources.length ? ' · bring in from' : ''}`), ...bring, h('span', 'spacer'), clearing ? h('span') : pill('Clear…', () => { clearing = true; paint() })])
  }

  // ---- downloads ----

  function downloadsPlate () {
    const body = h('div', 'body')
    const list = h('div', 'list')
    if (!loot.length) list.append(h('div', 'empty', 'Nothing downloaded yet.'))
    else {
      const box = h('div', 'card')
      loot.forEach((d, i) => {
        if (i) box.append(h('div', 'rule'))
        const row = h('div', 'entry', `<span class="doc">${icon('download', 13, 1.3)}</span><div class="words"><div class="name middle">${esc(d.name)}</div><div class="detail">${esc([d.from, ago(d.date)].filter(Boolean).join(' · '))}</div></div>`)
        const show = h('button', 'remove', 'Show in Folder')
        show.addEventListener('click', e => { e.stopPropagation(); L.showFile(d.path) })
        const remove = h('button', 'remove', 'Remove')
        remove.addEventListener('click', e => { e.stopPropagation(); L.forgetDownload(d.path) })
        row.append(show, remove)
        row.addEventListener('click', () => L.openFile(d.path))
        box.append(row)
      })
      list.append(box)
    }
    body.append(list)
    const folder = (prefs.downloads || ctx.downloadsFolder).replace(ctx.home, '~')
    return titled('Downloads', 560, body, [h('span', 'foot-note', loot.length ? 'Clearing the list leaves the files where they are' : `Files land in ${esc(folder)}`), h('span', 'spacer'), loot.length ? pill('Clear list', () => L.clearDownloads()) : h('span')])
  }

  // ---- bookmarks ----

  function outline (list, depth, into) {
    for (const node of list) {
      const folder = !!node.children
      const opened = openFolders.has(node.id)
      const row = h('div', 'outline-row')
      row.style.paddingLeft = `${18 * depth + 10}px`
      row.innerHTML = folder
        ? `<span class="chevron${opened ? ' open' : ''}">${icon('forward', 9, 1.8)}</span><span class="folder-mark">${icon('folder', 13, 1.3)}</span><span class="name">${esc(node.title)}</span><span class="count">${node.children.length}</span>`
        : `<span class="chevron-space"></span>${ctx.markFor(node.url, 15)}<span class="name">${esc(node.title)}</span>`
      row.title = node.url || ''
      row.addEventListener('click', () => {
        if (folder) { opened ? openFolders.delete(node.id) : openFolders.add(node.id); paint() } else { close(); ctx.openURL(node.url) }
      })
      row.addEventListener('contextmenu', e => { e.preventDefault(); bookmarkMenu(node) })
      into.append(row)
      if (folder && opened) {
        if (!node.children.length) into.append(Object.assign(h('div', 'outline-empty', 'Empty'), { style: `padding-left:${18 * (depth + 1) + 36}px` }))
        outline(node.children, depth + 1, into)
      }
    }
  }

  async function bookmarkMenu (node) {
    const folders = bookmarks.folders().filter(f => f !== node)
    const chosen = await L.menu([
      ...(node.url ? [{ id: 'open', label: 'Open' }, { id: 'tab', label: 'Open in New Tab' }, '-'] : []),
      { id: 'move', label: 'Move to', items: [{ id: 'to:', label: 'Top Level' }, ...(folders.length ? ['-'] : []), ...folders.map(f => ({ id: `to:${f.id}`, label: f.title }))] },
      { id: 'rename', label: 'Rename…' },
      '-',
      { id: 'remove', label: 'Remove' }
    ])
    if (!chosen) return
    if (chosen === 'open') { close(); ctx.openURL(node.url) }
    if (chosen === 'tab') ctx.openURL(node.url, true)
    if (chosen.startsWith('to:')) bookmarks.move(node.id, chosen.slice(3) || null)
    if (chosen === 'rename') { renaming = node.id }
    if (chosen === 'remove') bookmarks.remove(node.id)
    ctx.bookmarksChanged()
    paint()
  }
  let renaming = null

  function bookmarksPlate () {
    const body = h('div', 'body')
    const list = h('div', 'list outline')
    if (!bookmarks.tree.length) list.append(h('div', 'empty', 'Nothing kept yet. Add this page with Ctrl+Shift+B, or bring yours in below.'))
    else outline(bookmarks.tree, 0, list)
    if (renaming) {
      const node = bookmarks.find(renaming)?.node
      if (node) {
        const input = h('input', 'plain-field')
        input.value = node.title
        input.autofocus = true
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { bookmarks.rename(node.id, input.value); renaming = null; ctx.bookmarksChanged(); paint() }
          if (e.key === 'Escape') { e.stopPropagation(); renaming = null; paint() }
        })
        body.append(card(line(`Rename “${node.title}”`, null, input)))
      }
    }
    body.append(list)
    const foot = [h('span', 'foot-note', sources.length ? 'Bring in from' : `${bookmarks.count} sites`), ...sources.map(name => pill(name, async () => {
      const tree = await L.importBookmarks(name)
      bookmarks.take(name, tree)
      ctx.bookmarksChanged()
      toast(`Bookmarks from ${name} brought in`)
      paint()
    })), h('span', 'spacer'), pill('New Folder', () => { bookmarks.addFolder('New Folder'); ctx.bookmarksChanged(); paint() })]
    return titled('Bookmarks', 600, body, foot)
  }

  // ---- hidden on this site ----

  function hiddenPlate () {
    const host = ctx.currentHost()
    const body = h('div', 'body')
    const list = h('div', 'list short')
    if (!veils.length) list.append(h('div', 'empty', 'Nothing is hidden here.'))
    else {
      const box = h('div', 'card')
      const cssWithout = sel => veils.filter(v => v.selector !== sel).map(v => `${v.selector} { display: none !important; }`).join('\n')
      veils.forEach((v, i) => {
        if (i) box.append(h('div', 'rule'))
        const row = h('div', 'entry', `<div class="words"><div class="name">${esc(v.label)}</div><div class="detail">${esc(v.note)}</div></div>`)
        const restore = h('button', 'remove', 'Restore')
        restore.addEventListener('click', () => { ctx.peek(null); L.veil('restore', ctx.currentURL(), v.selector) })
        row.append(restore)
        row.addEventListener('mouseenter', () => ctx.peek(cssWithout(v.selector), v.selector))
        row.addEventListener('mouseleave', () => ctx.peek(null))
        box.append(row)
      })
      list.append(box)
    }
    body.append(list)
    return titled(host || 'This page', 380, body, [pill('Hide something…', () => { close(); ctx.startVeiling() }), h('span', 'spacer'), veils.length ? pill('Restore all', () => L.veil('restore-all', ctx.currentURL())) : h('span')])
  }

  // ---- passwords ----

  async function loadVault () {
    vaultList = await L.vault('list')
    if (kind === 'passwords') paint()
  }

  function passwordsPlate () {
    const body = h('div', 'body')
    const top = h('div', 'row-of')
    const { box, input } = field('Search sites and accounts', vaultQuery, v => { vaultQuery = v; paint() })
    input.autofocus = true
    input.dataset.keep = 'vault'
    top.append(box, pill(adding ? 'Cancel' : 'Add', () => { adding = !adding; paint() }))
    body.append(top)
    if (adding) {
      const form = h('div', 'card add-form')
      const inputs = ['Site', 'Username', 'Password'].map(ph => {
        const i = h('input', 'plain-field')
        i.placeholder = ph
        i.spellcheck = false
        if (ph === 'Password') i.type = 'password'
        return i
      })
      const save = pill('Save', async () => {
        const [site, user, pass] = inputs.map(i => i.value.trim())
        const result = await L.vault('save', site, user, pass)
        if (result === 'refused') return toast(site && pass ? 'The keyring refused it' : 'A site and a password are needed')
        adding = false
        loadVault()
      }, true)
      form.append(...inputs, save)
      body.append(form)
    }
    const needle = vaultQuery.trim().toLowerCase()
    const matches = vaultList.filter(l => !needle || l.host.includes(needle) || l.user.toLowerCase().includes(needle))
    const sites = [...new Set(matches.map(l => l.host))].sort()
    const list = h('div', 'list')
    if (!sites.length) list.append(h('div', 'empty', vaultList.length ? 'Nothing matches.' : 'Nothing kept yet. Sign in somewhere and say yes, or bring yours in below.'))
    else {
      const box = h('div', 'card')
      sites.forEach((host, i) => {
        if (i) box.append(h('div', 'rule'))
        const accounts = matches.filter(l => l.host === host)
        const opened = openSites.has(host) || !!needle
        const row = h('div', 'entry', `${ctx.markFor('https://' + host, 16)}<div class="words"><div class="name">${esc(host)}</div></div><span class="time">${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}</span><span class="chevron${opened ? ' open' : ''}">${icon('forward', 9, 1.8)}</span>`)
        row.addEventListener('click', () => { opened ? openSites.delete(host) : openSites.add(host); paint() })
        box.append(row)
        if (!opened) return
        for (const a of accounts) {
          const key = `${a.host}|${a.user}`
          const secret = shown.get(key)
          const acc = h('div', 'entry account-row', `<span class="user">${esc(a.user || 'No name')}</span><span class="secret${secret ? ' shown' : ''}">${secret ? esc(secret) : '•'.repeat(10)}</span>`)
          const act = (label, fn) => { const b = h('button', 'remove', label); b.addEventListener('click', e => { e.stopPropagation(); fn() }); acc.append(b) }
          act(secret ? 'Hide' : 'Show', async () => {
            if (secret) shown.delete(key)
            else {
              shown.set(key, await L.vault('reveal', a.host, a.user))
              setTimeout(() => { shown.delete(key); if (kind === 'passwords') paint() }, 15000)
            }
            paint()
          })
          act('Copy', async () => { L.copy(await L.vault('reveal', a.host, a.user)); toast('Password copied') })
          act('Remove', async () => { await L.vault('forget', a.host, a.user); loadVault() })
          box.append(acc)
        }
      })
      list.append(box)
    }
    body.append(list)
    return titled('Passwords', 620, body, [h('span', 'foot-note', 'Export from Chrome, Brave, Firefox or Zen as CSV, then'), pill('CSV File…', importCSV), h('span', 'spacer'), h('span', 'foot-note', `${vaultList.length} kept`)])
  }

  return {
    open,
    close,
    toggle: which => kind === which ? close() : open(which),
    get kind () { return kind },
    refresh: () => kind && paint()
  }
}
