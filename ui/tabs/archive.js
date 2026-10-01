// Archiving: loose tabs not looked at for the set time leave the row for the archive (Settings › Tabs), and
// Clear sends every tab that isn't pinned there at once.
import { animate, render } from '../chrome/render.js'
import { toast } from '../page/notices.js'
import { isWeb } from '../places/address.js'
import { dueForArchive } from '../places/archive.js'
import { archive, blank, now, prefs, S, tabs } from '../state.js'
import { saveLater } from './session.js'
import { hasUnsaved } from './sleep.js'
import { closeTab, newTab, open } from './tabs.js'
import { unload } from './views.js'

// ponytail: only the space on screen is looked at; a parked space's idle tabs go when it is entered again.
async function sweep () {
  const due = dueForArchive(tabs, { now: now(), after: prefs['archive.after'], active: S.active })
  const going = []
  for (const t of due) {
    // Typed input is never thrown away: such a page stays until it is sent or left.
    if (t.web && t.ready && await hasUnsaved(t)) continue
    if (tabs.includes(t) && t.id !== S.active) going.push(t)
  }
  if (!going.length) return
  archive.put(going, now())
  for (const t of going) {
    unload(t)
    tabs.splice(tabs.indexOf(t), 1)
  }
  animate()
  render()
  saveLater()
}

/** Looks once now that the session is back, then every minute. */
export function startArchiving () {
  if (prefs.archive) sweep()
  setTimeout(startArchiving, 60 * 1000)
}

/** What Clear takes: every tab with a page that isn't pinned, folders included; pinned tabs and essentials stay. */
export function clearable (t) {
  return !t.pin && !blank(t)
}

/** Clear: the clearable tabs close into the archive; a new tab takes the screen when they had it. */
export function clearTabs () {
  const going = tabs.filter(clearable)
  // A private tab is never written down.
  archive.put(going.filter(t => !t.shy && isWeb(t.url)), now())
  // The new tab comes first, so closing the one on screen never wakes another that is about to go.
  if (going.some(t => t.id === S.active)) newTab()
  for (const t of going) closeTab(t.id)
}

/** Opens an archived tab again, in the space on screen, and takes it out of the archive. */
export function unarchive (id) {
  const entry = archive.take(id)
  if (!entry) return toast('Already gone from the archive')
  open(entry.url, true)
}
