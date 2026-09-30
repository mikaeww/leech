// Archiving: loose tabs not looked at for the set time leave the row for the archive (Settings › Tabs).
import { animate, render } from '../chrome/render.js'
import { toast } from '../page/notices.js'
import { dueForArchive } from '../places/archive.js'
import { archive, now, prefs, S, tabs } from '../state.js'
import { saveLater } from './session.js'
import { hasUnsaved } from './sleep.js'
import { open } from './tabs.js'
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

/** Opens an archived tab again, in the space on screen, and takes it out of the archive. */
export function unarchive (id) {
  const entry = archive.take(id)
  if (!entry) return toast('Already gone from the archive')
  open(entry.url, true)
}
