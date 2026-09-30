// What the window knows: settings, the stores, the tabs of this space and the UI's own flags.
// A leaf: every other module reads and changes it, it imports none of them.
import { bareHost, pretty } from './places/address.js'
import { Bookmarks } from './places/bookmarks.js'
import { History } from './places/history.js'

export const L = window.leech
export const now = () => Date.now() / 1000

const [savedPrefs, savedSession, savedHistory, savedIcons, savedBookmarks, savedSpaces] =
  await Promise.all([L.read('settings'), L.read('session'), L.read('history'), L.read('icons'), L.read('bookmarks'), L.read('spaces')])

export const prefs = {
  look: 'system',
  sidebar: false,
  'sidebar.width': 232,
  'sidebar.hides': false,
  glyph: 'letters',
  'search.engine': 'google',
  'search.custom': '',
  'tabs.reading': true,
  'links.show': false,
  'links.peek': false,
  'bookmarks.bar': false,
  downloads: '',
  'downloads.ask': false,
  shield: true,
  'shield.paused': [],
  capture: {},
  'passwords.save': true,
  'passwords.fill': true,
  'passwords.never': [],
  'tabs.sleep': true,
  spaces: false,
  ...savedPrefs
}
// The same brands navigator.userAgentData gives pages, so the header and the scripts agree.
const brands = navigator.userAgentData.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ')
export const configure = () => L.configure({ downloads: prefs.downloads, ask: prefs['downloads.ask'], shield: prefs.shield, paused: prefs['shield.paused'], capture: prefs.capture, brands })
configure()
export const setPref = (key, value) => { prefs[key] = value; L.write('settings', prefs) }

export const history = new History(savedHistory || [], (list, sync) => sync ? L.writeNow('history', list) : L.write('history', list))
// chrome://leech may not load images from the web (Chromium kills its renderer for it): only icons
// kept as data: survive there; the rest come back as data: the next time the site is open.
export const icons = new Map(Object.entries(savedIcons || {}).filter(([, src]) => !L.native || src.startsWith('data:')))
export const bookmarks = new Bookmarks(savedBookmarks || [], tree => L.write('bookmarks', tree))
// A remembered icon that no longer loads gives way to the letter, and is forgotten.
document.addEventListener('error', e => {
  const img = e.target
  if (img.tagName !== 'IMG' || !img.closest('.mark, .glyph')) return
  for (const [host, src] of icons) if (src === img.src) icons.delete(host)
  for (const t of tabs) if (t.favicon === img.src) t.favicon = null
  L.write('icons', Object.fromEntries(icons))
  const holder = img.closest('.mark, .glyph')
  holder.classList.remove('has-icon')
  holder.textContent = '•'
}, true)

// Spaces: separate rows of tabs; the first is always there and keeps session.json and the shared cookie jar.
export const spaces = Array.isArray(savedSpaces) ? savedSpaces.filter(s => s.id !== 'personal') : []
spaces.unshift({ id: 'personal', name: 'Personal', icon: 'home', shares: true, ...(savedSpaces || []).find(s => s.id === 'personal') })
// The active tab's id, the sidebar's folders in this space in their order (a tab names its folder
// in t.folder), and the space on screen.
export const S = { active: null, folders: [], space: null }
S.space = prefs.spaces && spaces.some(s => s.id === prefs['space.current']) ? prefs['space.current'] : 'personal'
export const parked = new Map()
export const sessionName = id => id === 'personal' ? 'session' : `session-${id}`
export const partitionOf = id => spaces.find(s => s.id === id)?.shares === false ? `persist:space-${id}` : 'persist:leech'
export const saveSpaces = () => L.write('spaces', spaces)

export const tabs = []
export const ghosts = []
let nextId = 1
export const layout = { looseWidth: 186, grid: { cols: 3, w: 20, h: 20 }, resizing: false }
export const ui = {
  editing: false, summoning: false, cycling: false,
  typed: '', offers: [], ending: null, picked: null, shortened: false,
  folded: !!prefs['sidebar.hides'] && prefs.sidebar, full: false, peeking: false, immersed: false,
  finding: false, tabEdit: null
}

// Below 700 wide there is no room for a column: the tabs go across the top until the window grows again.
const NARROW = 700
// Folding the sidebar puts the tabs across the top, the sidebar door still there to bring the column back.
export const sideMode = () => !!prefs.sidebar && !ui.folded && innerWidth >= NARROW
// The strip itself goes only when there is no sidebar to fold into, or the window has the whole screen.
export const stowed = () => (ui.folded && !prefs.sidebar) || ui.full

export const tab = id => tabs.find(t => t.id === id)
export const current = () => tab(S.active)
export const blank = t => !t || !t.url
export const label = t => t.name || (t.title && t.title.trim()) || (t.url ? pretty(t.url) : 'New Tab')
export const monogram = t => (bareHost(t.url || '') || '').charAt(0).toUpperCase() || '•'
export const favicon = t => t.favicon || icons.get(bareHost(t.url || '') || '') || null

export function makeTab (fields = {}) {
  return { id: nextId++, url: null, title: null, favicon: null, loading: false, canBack: false, canForward: false,
    pin: null, name: null, failure: null, muted: false, audible: false, reading: 0, touched: now(),
    web: null, ready: false, opener: null, home: null, shy: false, folder: null, signin: null, hasForm: false, picture: null, space: S.space, ...fields }
}
export { savedSession }
