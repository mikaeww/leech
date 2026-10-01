// Hiding elements on a page: the picker runs in the page, the rules live in places/hidden.js, and every open page
// of a site hears when its rules change.
import { panels } from '../chrome/panels.js'
import { render } from '../chrome/render.js'
import { bareHost, isWeb } from '../places/address.js'
import { configure, current, hidden, now, parked, tabs, ui } from '../state.js'
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
  changeHidden('hide', t.url, said)
}

const CHANGES = {
  hide: (host, said) => hidden.hide(host, said, now()),
  undo: host => hidden.undo(host),
  restore: (host, selector) => hidden.restore(host, selector),
  'restore-all': host => hidden.restoreAll(host)
}

/** Changes the rules of the site at `url` (hide, undo, restore, restore-all); its open pages and new ones follow. */
export function changeHidden (what, url, detail) {
  const host = bareHost(url || '')
  if (!host) return
  CHANGES[what](host, detail)
  configure()
  for (const t of tabs.concat(...[...parked.values()].map(r => r.tabs))) {
    if (t.ready && bareHost(t.url || '') === host) t.web.send('veil-css', hidden.sheet(host))
  }
  panels.refresh()
}
