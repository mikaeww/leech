// The session file of the space on screen.
import { isWeb } from '../places/address.js'
import { history, L, S, sessionName, tabs } from '../state.js'
import { essentialsSnapshot } from './groups/essentials.js'

export function snapshot () {
  const list = tabs.filter(t => isWeb(t.url) && !t.shy && !t.essential)
  const out = list.map(t => {
    const entry = { url: t.pin && t.home ? t.home : t.url }
    if (t.title && !(t.pin && t.home && t.home !== t.url)) entry.title = t.title
    if (t.pin) entry.pin = t.pin
    if (t.name) entry.name = t.name
    if (t.folder) entry.folder = t.folder
    return entry
  })
  return { tabs: out, folders: S.folders, active: Math.max(0, list.findIndex(t => t.id === S.active)) }
}

let saveTimer = null
export function saveLater () {
  if (saveTimer) return
  saveTimer = setTimeout(() => { saveTimer = null; save() }, 1200)
}
export function save () {
  L.write(sessionName(S.space), snapshot())
  L.write('essentials', essentialsSnapshot())
}

L.onFlush(() => {
  L.writeNow(sessionName(S.space), snapshot())
  L.writeNow('essentials', essentialsSnapshot())
  history.flush(true)
})
