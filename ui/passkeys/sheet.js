// The passkey sheet (ADR 0009): a site makes or uses a passkey, Leech asks its PIN, and the first passkey sets
// the PIN up. The keys, the checks and the answer to the site are the Chromium build's (chromium/leech/passkeys/).
import { esc, h } from '../elements.js'
import { action } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { toast } from '../page/notices.js'
import { close, open, paint, panel, titled } from '../panels/index.js'
import { card, line } from '../panels/pieces.js'
import { L } from '../state.js'

export const SHORTEST_PIN = 6
export const SAID = {
  'wrong-pin': 'That isn’t the PIN. Try again.',
  'short-pin': `A PIN has ${SHORTEST_PIN} characters at least.`,
  changed: 'The PIN changed meanwhile. Try again on the page.',
  gone: 'The page stopped waiting.',
  damaged: 'This passkey’s key is damaged on disk.'
}
// After these the request is over; the others leave the sheet open for another try.
const FINAL = new Set(['changed', 'gone', 'damaged'])

L.onPasskey?.(request => {
  // A newer request replaces one still open: the older page hears NotAllowedError.
  if (panel.passkey) L.passkeys.decline(panel.passkey.id, false)
  panel.passkey = { ...request, accounts: request.accounts || [], account: 0, pin: '', again: '', said: '', busy: false }
  panel.kind = null
  open('passkey')
})

L.onPasskeyClose?.((id, note) => {
  if (note) toast(note)
  if (panel.passkey?.id !== id) return
  panel.passkey = null
  if (panel.kind === 'passkey') close()
})

// Escape, the dim or the close door: the page hears NotAllowedError.
export function passkeyClosed () {
  if (panel.passkey) L.passkeys.decline(panel.passkey.id, false)
  panel.passkey = null
}

function leave (words) {
  panel.passkey = null
  close()
  if (words) toast(words)
}

async function submit () {
  const p = panel.passkey
  if (!p || p.busy) return
  if (p.kind === 'create' && !p.setUp && p.pin !== p.again) {
    p.said = 'The two PINs differ.'
    return paint()
  }
  p.busy = true
  paint()
  const outcome = await L.passkeys.answer(p.id, p.pin, p.account)
  if (panel.passkey !== p) return
  p.busy = false
  if (outcome === 'ok') return leave(p.kind === 'create' ? `Passkey saved for ${p.rp}` : '')
  p.said = SAID[outcome] || 'That didn’t work.'
  if (FINAL.has(outcome)) return leave(p.said)
  p.pin = ''
  p.again = ''
  paint()
}

export function pinField (state, key, placeholder, onEnter) {
  const input = h('input', 'plain-field')
  input.type = 'password'
  input.autocomplete = 'off'
  input.placeholder = placeholder
  input.value = state[key]
  input.dataset.keep = `pin-${key}`
  input.addEventListener('input', () => { state[key] = input.value })
  input.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter() })
  return input
}

function accountsCard (p) {
  if (p.accounts.length < 2) return null
  return card(...p.accounts.map((a, i) => {
    const row = line(a.user || 'No name', a.name && a.name !== a.user ? a.name : '', i === p.account ? h('span', 'check', icon('check')) : null)
    row.classList.add('choice')
    row.addEventListener('click', () => { p.account = i; paint() })
    return row
  }))
}

function words (p) {
  const one = p.accounts.length === 1 ? p.accounts[0].user : ''
  if (p.kind === 'create') return [`${p.user || 'Your account'} on ${p.rp}`, p.setUp ? 'Leech keeps it on this computer. Type your passkey PIN.' : 'Leech keeps passkeys on this computer behind a PIN of your own and asks it each time one is used. Six characters at least; a longer one is safer if the file is ever copied.']
  return [one ? `${one} on ${p.rp}` : `Choose an account on ${p.rp}`, 'Type your passkey PIN.']
}

export function passkeyPlate () {
  const p = panel.passkey
  const making = p.kind === 'create'
  const setting = making && !p.setUp
  const [who, how] = words(p)
  const fields = h('div', 'pin-fields')
  const first = pinField(p, 'pin', setting ? 'New PIN' : 'PIN', submit)
  first.autofocus = true
  fields.append(first)
  if (setting) fields.append(pinField(p, 'again', 'The PIN again', submit))
  const go = action(making ? 'Save' : 'Sign in', submit, true)
  go.disabled = p.busy
  const phone = action('Phone or key…', () => {
    L.passkeys.decline(p.id, true)
    leave('Try again on the page: Chromium will ask for a phone or security key')
  })
  return titled(making ? 'Save a passkey' : 'Sign in with a passkey', 440, [
    card(line(who, how)),
    accountsCard(p),
    card(fields),
    p.said && h('div', 'foot-note said', esc(p.said))
  ], [phone, h('span', 'spacer'), go])
}
