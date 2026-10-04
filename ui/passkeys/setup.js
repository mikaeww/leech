// Passkeys in Settings › Passwords (ADR 0009): on or off, the PIN chosen or changed, the passkeys kept, and
// starting over when the PIN is forgotten. Chromium build only; the sheet for a site's request is sheet.js.
import { esc, h } from '../elements.js'
import { action, toggle } from '../look/controls.js'
import { toast } from '../page/notices.js'
import { open, paint, panel, titled } from '../panels/index.js'
import { card, line, quick, said } from '../panels/pieces.js'
import { refill, set } from '../panels/settings/index.js'
import { L, prefs } from '../state.js'
import { pinField, SAID } from './sheet.js'

export async function loadPasskeys () {
  panel.passkeys = await L.passkeys.summary()
  if (panel.kind === 'settings') refill()
}

function pinLine (summary) {
  if (!summary) return null
  return summary.setUp
    ? line('Passkey PIN', 'Asked each time a passkey is made or used', action('Change…', () => pinForm('change')))
    : line('Passkey PIN', 'Not chosen yet; the first passkey a site makes asks for one too', action('Set up…', () => pinForm('setup')))
}

export function passkeysCards () {
  if (!L.passkeys) return []
  const summary = panel.passkeys
  const cards = [card(
    line('Keep passkeys in Leech', 'Sites that offer a passkey save it here, behind your PIN. Off, Chromium asks for a phone or security key instead.',
      toggle(prefs.passkeys, v => set('passkeys', v))),
    pinLine(summary)
  )]
  if (summary?.passkeys.length) {
    cards.push(card(...summary.passkeys.map(k =>
      line(k.rp, `${k.user || 'No name'} · made ${said(k.created / 1000)}`, quick('Remove', () => removePasskey(k), true)))))
  }
  if (summary?.setUp) {
    cards.push(card(line('Forgot the PIN?', 'The only way back is to remove every passkey and choose a new PIN', action('Remove all…', resetPasskeys))))
  }
  return cards
}

async function removePasskey (k) {
  if (!await L.confirm(`Remove the passkey for ${k.rp}?`, 'The site still has it on file; you sign in another way and can make a new one.')) return
  panel.passkeys = await L.passkeys.remove(k.id)
  refill()
}

async function resetPasskeys () {
  if (!await L.confirm('Remove every passkey?', 'Every site you saved one for needs another way in. This can’t be undone.')) return
  panel.passkeys = await L.passkeys.reset()
  refill()
  toast('Every passkey is gone; choose a new PIN with the next one')
}

function pinForm (mode) {
  panel.pinForm = { mode, old: '', pin: '', again: '', said: '', busy: false }
  panel.kind = null
  open('passkey-pin')
}

async function savePin () {
  const f = panel.pinForm
  if (f.busy) return
  if (f.pin !== f.again) {
    f.said = 'The two PINs differ.'
    return paint()
  }
  f.busy = true
  paint()
  const outcome = f.mode === 'change' ? await L.passkeys.changePin(f.old, f.pin) : await L.passkeys.setUp(f.pin)
  f.busy = false
  if (outcome === 'ok') {
    toast(f.mode === 'change' ? 'Passkey PIN changed' : 'Passkeys are set up')
    panel.pinForm = null
    panel.kind = null
    open('settings')
    return
  }
  f.said = SAID[outcome] || 'That didn’t work.'
  f.old = f.pin = f.again = ''
  paint()
}

export function pinPlate () {
  const f = panel.pinForm
  const changing = f.mode === 'change'
  const fields = h('div', 'pin-fields')
  if (changing) fields.append(pinField(f, 'old', 'Current PIN', savePin))
  fields.append(pinField(f, 'pin', 'New PIN', savePin), pinField(f, 'again', 'The new PIN again', savePin))
  fields.firstChild.autofocus = true
  const go = action(changing ? 'Change' : 'Set up', savePin, true)
  go.disabled = f.busy
  return titled(changing ? 'Change the passkey PIN' : 'Set up passkeys', 440, [
    card(line(changing ? 'Every passkey moves to the new PIN' : 'A PIN for Leech’s passkeys',
      'Six characters at least, letters allowed. A longer one is safer if the file is ever copied.')),
    card(fields),
    f.said && h('div', 'foot-note said', esc(f.said))
  ], [h('span', 'spacer'), go])
}
