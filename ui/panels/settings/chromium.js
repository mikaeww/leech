// Chromium's own settings in the panel, Chromium build only (ADR 0004): lines bound to the fixed list in
// leech_prefs.cc, and a link to the chrome://settings section for everything the list doesn't hold.
import { esc, h } from '../../elements.js'
import { action, segmented, toggle } from '../../look/controls.js'
import { icon } from '../../look/icons.js'
import { menu } from '../../look/menu.js'
import { toast } from '../../page/notices.js'
import { L } from '../../state.js'
import { card, line } from '../pieces.js'
import { refill } from './index.js'

// The list's values as Chromium last said; null until the panel has asked.
const chromium = { values: null }
const value = name => chromium.values?.[name]

/** Asks Chromium for the list's values; the page redraws once they are here. */
export async function loadChromium () {
  if (!L.chromiumSettings) return
  chromium.values = await L.chromiumSettings.read()
  refill()
}

// What Chromium refuses stays as it was, and the page says so by drawing it back.
async function write (name, next, reshape) {
  if (!await L.chromiumSettings.write(name, next)) {
    toast('Chromium didn’t take that')
    return refill()
  }
  chromium.values[name] = next
  if (reshape) refill()
}

const chromiumSwitch = (name, title, detail, reshape) => line(title, detail, toggle(!!value(name), on => write(name, on, reshape)))
const chromiumChoice = (name, title, detail, options) =>
  line(title, detail, segmented(options.map(([v, label]) => [String(v), label]), String(value(name)), v => write(name, Number(v))))

/** A line opening Chromium's own page for what Leech doesn't show. */
export const chromiumLink = (title, detail, section) =>
  line(title, detail, action('Open…', () => L.openPage(`chrome://settings/${section}`)))

const ready = () => chromium.values !== null

export function chromiumPrivacy () {
  if (!ready()) return []
  return [card(
    chromiumChoice('cookies', 'Block third-party cookies', 'Sites you visit can’t follow you to other sites with them', [[2, 'In private tabs'], [1, 'Always']]),
    // No Safe Browsing line: the build has no Google API keys, so its lists never arrive (release plan, step 5).
    chromiumSwitch('https-only', 'Always use secure connections', 'A site without https is asked about first'),
    line('Preload pages', 'Pages you are likely to open next load ahead, for speed', toggle(value('preload') === 0, on => write('preload', on ? 0 : 2))),
    chromiumSwitch('do-not-track', 'Ask sites not to track you', 'Sends “Do Not Track”; most sites ignore it')
  ), card(
    chromiumLink('Clear browsing data', 'History, cookies and sign-ins, cache, for a span of time', 'clearBrowserData'),
    chromiumLink('More privacy and security', 'Security keys, certificates, the rest', 'privacy')
  )]
}

const ASK = [[3, 'Ask'], [2, 'Block']]
const ALLOW = [[1, 'Allow'], [2, 'Block']]
export function sites () {
  if (!ready()) return []
  return [card(
    chromiumChoice('site-location', 'Location', 'Where you are', ASK),
    chromiumChoice('site-camera', 'Camera', null, ASK),
    chromiumChoice('site-microphone', 'Microphone', null, ASK),
    chromiumChoice('site-notifications', 'Notifications', 'Messages from a site while you are elsewhere', ASK),
    chromiumChoice('site-clipboard', 'Clipboard', 'Reading what you copied', ASK),
    chromiumChoice('site-popups', 'Pop-ups and redirects', null, ALLOW),
    chromiumChoice('site-javascript', 'JavaScript', 'Most sites need it to work', ALLOW),
    chromiumChoice('site-images', 'Images', null, ALLOW),
    chromiumChoice('site-sound', 'Sound', null, ALLOW)
  ), card(chromiumLink('Choices for single sites', 'Exceptions, and every other permission', 'content'))]
}

export function languages () {
  if (!ready()) return []
  return [card(
    chromiumSwitch('spellcheck', 'Check spelling as you type', null),
    chromiumSwitch('translate', 'Offer to translate pages', 'When a page is in a language you don’t read')
  ), card(chromiumLink('Languages and spelling', 'Which languages, in which order, which dictionaries', 'languages'))]
}

export function system () {
  if (!ready()) return []
  return [card(
    chromiumSwitch('hardware-acceleration', 'Use graphics acceleration', 'Takes effect the next time Leech starts')
  ), card(
    chromiumLink('Fonts', 'The faces pages use', 'fonts'),
    chromiumLink('Accessibility', 'Captions, focus highlight, caret browsing', 'accessibility'),
    chromiumLink('Reset settings', 'Chromium’s settings back to how they came', 'reset'),
    chromiumLink('All of Chromium’s settings', null, '')
  )]
}

export function chromiumPasswords () {
  if (!ready()) return []
  return [card(
    chromiumSwitch('passwords-save', 'Offer to save passwords', null),
    chromiumSwitch('passwords-autosignin', 'Sign in automatically', 'With the account kept for the site, when there is only one'),
    chromiumSwitch('autofill-addresses', 'Fill in addresses', null),
    chromiumSwitch('autofill-cards', 'Fill in payment methods', null)
  ), card(
    chromiumLink('Addresses', 'The ones kept for filling in', 'addresses'),
    chromiumLink('Payment methods', 'Cards kept for filling in', 'payments')
  )]
}

export function chromiumDownloads () {
  if (!ready()) return []
  const folder = String(value('downloads-folder') || '')
  return [card(
    line('Save to', folder || 'Chromium’s default folder', action('Change…', () => L.openPage('chrome://settings/downloads'))),
    chromiumSwitch('downloads-ask', 'Ask where to save each file', null)
  )]
}

const SIZES = [[9, 'Very small'], [12, 'Small'], [16, 'Medium'], [20, 'Large'], [24, 'Very large']]
/** The page font size as a popup: five sizes are too many for a segmented row. */
export function fontSize () {
  if (!ready()) return null
  const now = SIZES.find(([px]) => px === value('font-size'))
  const picker = h('button', 'popup', `<span>${esc(now ? now[1] : `${value('font-size')} px`)}</span>${icon('updown', 'small')}`)
  picker.addEventListener('click', async () => {
    const r = picker.getBoundingClientRect()
    const chosen = await menu(SIZES.map(([px, label]) => ({ id: String(px), label, checked: px === value('font-size') })), { x: r.left, y: r.bottom + 2 })
    if (chosen) write('font-size', Number(chosen), true)
  })
  return line('Page font size', 'For pages that don’t set their own', picker)
}
