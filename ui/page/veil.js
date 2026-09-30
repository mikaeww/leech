// Hiding elements on a page.
import { panels } from '../chrome/panels.js'
import { render } from '../chrome/render.js'
import { isWeb } from '../places/address.js'
import { current, L, tabs, ui } from '../state.js'
import { hint, toast } from './notices.js'

export function startVeiling () {
  const t = current()
  if (!t?.ready || !isWeb(t.url)) return
  panels.close()
  ui.veiling = true
  t.web.send('veil', 'on')
  hint.hidden = false
  render()
  t.web.focus()
}

export function stopVeiling () {
  ui.veiling = false
  hint.hidden = true
  for (const t of tabs) if (t.ready) t.web.send('veil', 'off')
  render()
}

export function veiled (t, said) {
  if (said.trouble) return toast('That one can’t be hidden')
  L.veil('hide', t.url, said)
}
