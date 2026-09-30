// Split view: two tabs side by side in the stage. Both know their partner (t.split); the one further left
// along the row is the left pane and keeps the ratio. Chromium lays a split out itself once told; Electron's
// two webviews are placed by render.js.
// ponytail: a split lives until the window closes; keeping it in the session would add a field to both shells' restore.
import { animate, render } from '../../chrome/render.js'
import { L, S, tab, tabs } from '../../state.js'
import { saveLater } from '../session.js'
import { select } from '../tabs.js'
import { wake } from '../views.js'
import { tidy } from './folders.js'

export const partnerOf = t => (t?.split && tab(t.split)) || null

/** The pair in row order, left pane first; null when the tab is not in a split. */
export function paneOf (t) {
  const other = partnerOf(t)
  if (!other) return null
  return tabs.indexOf(t) < tabs.indexOf(other) ? [t, other] : [other, t]
}

export function canSplit (t, other) {
  return t !== other && !t.pin && !other.pin && !t.shy === !other.shy && !!t.url && !!other.url
}

/** Puts `other` beside `t`, to its right, and shows both. */
export function splitWith (t, other) {
  if (!canSplit(t, other)) return
  unpair(t)
  unpair(other)
  t.split = other.id
  other.split = t.id
  t.ratio = 0.5
  other.folder = t.folder
  tabs.splice(tabs.indexOf(other), 1)
  tabs.splice(tabs.indexOf(t) + 1, 0, other)
  tidy()
  wake(other)
  L.split?.(t, other)
  animate()
  select(t.id)
}

/** Takes a tab and its partner apart; both stay open. `told` is true when Chromium did it already. */
export function unpair (t, told = false) {
  const other = partnerOf(t)
  if (!t.split) return
  t.split = null
  if (other) other.split = null
  if (!told) L.unsplit?.(t)
  render()
  saveLater()
}

/** A click into the other pane makes it the tab on screen, without moving anything. */
export function paneFocused (t) {
  if (t.id !== S.active && partnerOf(t)?.id === S.active) select(t.id)
}
