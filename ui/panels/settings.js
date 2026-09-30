// Settings (Settings.swift): a rail of pages beside the page shown.
import { esc, h } from '../elements.js'
import { action, door, segmented, toggle } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { menu } from '../look/menu.js'
import { toast } from '../page/notices.js'
import { name as engineName, ENGINES } from '../places/engine.js'
import { archive, history, L, prefs, setPref } from '../state.js'
import { close, ctx, open, paint, panel } from './index.js'
import { loadVault } from './passwords.js'
import { card, line } from './pieces.js'

const PAGES = [['general', 'General', 'window'], ['tabs', 'Tabs', 'tabs'], ['passwords', 'Passwords', 'key'],
  ['downloads', 'Downloads', 'download'], ['privacy', 'Privacy', 'hand'], ['about', 'About', 'info']]

export function settingsPlate () {
  const el = h('div', 'plate settings')
  const rail = h('div', 'rail', '<div class="rail-title">Settings</div>')
  const content = h('div', 'content')
  for (const [id, title, glyph] of PAGES) {
    const b = h('button', 'rail-row' + (panel.settingsPage === id ? ' on' : ''), `${icon(glyph)}<span>${title}</span>`)
    b.addEventListener('click', () => {
      if (panel.settingsPage === id) return
      panel.settingsPage = id
      setPref('settings.page', id)
      rail.querySelectorAll('.rail-row').forEach(x => x.classList.toggle('on', x === b))
      fillSettings(content, true)
    })
    rail.append(b)
  }
  fillSettings(content, false)
  el.append(rail, content)
  return el
}

function fillSettings (content, fresh) {
  const head = h('div', 'head', `<div class="heading">${PAGES.find(p => p[0] === panel.settingsPage)[1]}</div>`)
  head.append(door('close', 'Done   esc', close))
  const body = h('div', 'scroll' + (fresh ? ' fresh' : ''))
  body.append(...({ general, tabs, passwords, downloads, privacy, about })[panel.settingsPage]())
  content.replaceChildren(head, body)
}

// Only the settings page, in place, when a choice changes what the page shows.
export function refill () {
  const content = panel.plate?.querySelector('.content')
  if (content) {
    const top = content.querySelector('.scroll')?.scrollTop || 0
    fillSettings(content, false)
    content.querySelector('.scroll').scrollTop = top
  } else paint()
}

// Switches and segments have already moved; only a choice that adds or removes lines redraws the page.
const RESHAPES = new Set(['search.engine', 'passwords.never', 'shield', 'downloads', 'archive'])
function set (key, value) {
  setPref(key, value)
  ctx.prefsChanged(key)
  if (RESHAPES.has(key)) refill()
}

function searchDetail () {
  if (prefs['search.engine'] !== 'custom') return 'Where words that aren’t an address go'
  const name = engineName('custom', prefs['search.custom'])
  return name === 'Google' ? 'An http or https address with %s where the words go. Until then, Google' : `Words go to ${name}`
}

function general () {
  const custom = prefs['search.engine'] === 'custom'
  const picker = h('button', 'popup', `<span>${esc(custom ? 'Custom' : engineName(prefs['search.engine']))}</span>${icon('updown', 'small')}`)
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
    field.addEventListener('change', () => refill())
  }
  const made = h('span', 'check', icon('check'))
  return [card(
    line('Open links from other apps', panel.isDefault ? 'Leech is the default browser on this computer' : 'Mail, chat and the rest still send links elsewhere',
      panel.isDefault ? made : action('Make default', async () => {
        panel.isDefault = await L.defaultBrowser(true)
        toast(panel.isDefault ? 'Links now open here' : 'The system didn’t change it')
        refill()
      }, true)),
    line('Search with', searchDetail(), picker),
    field,
    line('Appearance', 'Light, dark, or whatever the system is doing — pages follow it too',
      segmented([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], prefs.look, v => { setPref('look', v); ctx.setLook(v) })),
    line('Peek at a link with a shift-click', 'Its page opens in a panel over the one you’re reading. Escape puts it away; the other button keeps it as a tab',
      toggle(prefs['links.peek'], v => set('links.peek', v))),
    line('Show where links go', 'Point at a link and its address shows at the bottom of the page', toggle(prefs['links.show'], v => set('links.show', v)))
  )]
}

function tabs () {
  return [card(
    line('Tabs in a sidebar', 'Down the left instead of across the top. Pull its edge to make it wider; double-click the edge to reset.',
      toggle(prefs.sidebar, v => { ctx.setSidebar(v); setTimeout(refill, 260) })),
    prefs.sidebar && line('Start with the sidebar folded', 'The tabs start across the top; the sidebar door or Ctrl+S brings the column back.',
      toggle(prefs['sidebar.hides'], v => set('sidebar.hides', v))),
    line('Tabs show', 'Beside the title, and on a pinned square', segmented([['letters', 'Letters'], ['icons', 'Site icons']], prefs.glyph, v => set('glyph', v))),
    line('Show the bookmarks bar', 'Your bookmarks in a row above the page, folders opening as menus. It folds away with the tabs',
      toggle(prefs['bookmarks.bar'], v => set('bookmarks.bar', v))),
    line('Show how far you’ve read', 'The tab you’re on fills with grey as you scroll down the page', toggle(prefs['tabs.reading'], v => set('tabs.reading', v))),
    line('Sleep tabs you aren’t using', 'After half an hour away they come back where you left them. Pinned tabs, sound and anything typed stay awake.',
      toggle(prefs['tabs.sleep'], v => set('tabs.sleep', v))),
    line('Fold a folder when you leave it', 'Going to a tab outside a folder folds it; its tabs wait behind its name', toggle(prefs['folders.fold'], v => set('folders.fold', v))),
    line('Archive tabs you haven’t looked at', 'Loose tabs leave the row after a while and wait in Archived Tabs. Pinned tabs, folders, sound and anything typed stay.',
      toggle(prefs.archive, v => set('archive', v))),
    prefs.archive && line('Archive after', 'Counted from the last time you were on the tab',
      segmented([['43200', '12 hours'], ['86400', 'A day'], ['604800', 'A week']], String(prefs['archive.after']), v => set('archive.after', Number(v)))),
    line('Archived tabs', `${archive.list.length === 1 ? '1 tab' : `${archive.list.length} tabs`} kept`, action('Open…', () => { panel.kind = null; open('archive') })),
    line('Spaces', 'Separate sets of tabs, signed in where the others are or starting afresh, switched with Alt+1–Alt+9, two fingers across the tabs, or the space’s icon.',
      toggle(prefs.spaces, v => set('spaces', v)))
  )]
}

function passwords () {
  const never = prefs['passwords.never']
  return [
    card(
      line('Your passwords', 'In the desktop keyring, sealed so only Leech can read them', action('Open…', () => { panel.kind = null; open('passwords') })),
      line('Offer to save passwords', 'Asked once per site, never again for a site you refuse', toggle(prefs['passwords.save'], v => set('passwords.save', v))),
      line('Fill in sign-ins', 'Click a sign-in box and the accounts kept for the site hang from it', toggle(prefs['passwords.fill'], v => set('passwords.fill', v))),
      never.length && line('Sites never asked', `${never.length} sites told to stop offering`, action('Forget', () => { set('passwords.never', []); toast('Every site can ask again') }))
    ),
    card(line('Bring yours in', 'A CSV exported from Chrome, Brave, Firefox or Zen — nothing leaves this computer', action('Import…', importCSV)))
  ]
}

export async function importCSV () {
  const n = await L.importCSV()
  if (n === null) return
  toast(n < 0 ? 'The keyring refused them' : `${n} ${n === 1 ? 'password' : 'passwords'} brought in`)
  if (panel.kind === 'passwords') loadVault()
}

function downloads () {
  const folder = prefs.downloads || ctx.downloadsFolder
  return [card(
    line('Save to', folder.replace(ctx.home, '~'), action('Change…', async () => {
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
      line('Camera and microphone', 'What each site was allowed or refused', action('Forget choices', () => { set('capture', {}); toast('Every site will ask again') }))
    ),
    card(
      line('History', 'Every address you have been to', action('Clear', () => { history.clear(); toast('History cleared') })),
      line('Cookies and sign-ins', 'Signs you out of every site', action('Sign out of everything', async () => { await L.clear('cookies'); toast('Signed out of everything') })),
      line('Cache', 'Only what was fetched to draw pages', action('Clear', async () => { await L.clear('cache'); toast('Cache cleared') }))
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
