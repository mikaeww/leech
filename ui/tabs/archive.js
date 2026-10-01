// Archiving: loose tabs not looked at for the set time leave the row for the archive (Settings › Tabs), and
// Clear sends them all there at once.
import { animate, render } from '../chrome/render.js'
import { toast } from '../page/notices.js'
import { isWeb } from '../places/address.js'
import { dueForArchive } from '../places/archive.js'
import { archive, blank, now, prefs, S, tabs } from '../state.js'
import { saveLater } from './session.js'
import { hasUnsaved } from './sleep.js'
import { closeTab, open } from './tabs.js'
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

/** What Clear takes, as in Zen: a loose tab outside a folder; pinned tabs, essentials and folders stay. */
export function clearable (t) {
  return !t.pin && !t.folder && !blank(t)
}

/** Clear: the clearable tabs close into the archive, except a page still holding typed input. */
export async function clearTabs () {
  const loose = tabs.filter(clearable)
  const going = []
  for (const t of loose) if (!(t.web && t.ready && await hasUnsaved(t))) going.push(t)
  // A private tab is never written down.
  archive.put(going.filter(t => !t.shy && isWeb(t.url)), now())
  // The tab on screen closes last, so closing the others never wakes one that is about to go.
  going.sort((a, b) => (a.id === S.active) - (b.id === S.active))
  for (const t of going) closeTab(t.id)
  const kept = loose.length - going.length
  if (kept) toast(`${kept} ${kept === 1 ? 'tab stays' : 'tabs stay'}: typed input not sent yet`)
}

/** Opens an archived tab again, in the space on screen, and takes it out of the archive. */
export function unarchive (id) {
  const entry = archive.take(id)
  if (!entry) return toast('Already gone from the archive')
  open(entry.url, true)
}
