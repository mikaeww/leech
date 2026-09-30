// The archive: tabs put away after going unlooked-at, newest first, the last 500 kept. No DOM, unit-tested.
import { isWeb } from './address.js'

export const ARCHIVE_LIMIT = 500

/**
 * The tabs due for the archive: loose (not pinned, essential or in a folder), untouched for `after` seconds,
 * not on screen, not playing, not private and at a web address. Whether a page holds typed input is asked
 * of the page afterwards; this only says who may be asked.
 */
export function dueForArchive (tabs, { now, after, active }) {
  return tabs.filter(t => !t.pin && !t.essential && !t.folder && !t.shy && !t.audible && !t.loading && !t.signin &&
    t.id !== active && isWeb(t.url) && now - t.touched >= after)
}

export class Archive {
  constructor (list = [], save = () => {}) {
    this.list = Array.isArray(list) ? list.filter(e => e && typeof e.url === 'string' && typeof e.id === 'string') : []
    this.save = () => save(this.list)
  }

  /** Puts tabs away ahead of older ones, in their order along the row; past the limit the oldest go. */
  put (tabs, at) {
    const entries = tabs.map(t => ({ id: crypto.randomUUID(), url: t.url, title: t.title || '', at, space: t.space }))
    this.list.unshift(...entries)
    if (this.list.length > ARCHIVE_LIMIT) this.list.length = ARCHIVE_LIMIT
    this.save()
    return entries
  }

  /** Takes an entry out, for reopening or forgetting; null when it is gone already. */
  take (id) {
    const i = this.list.findIndex(e => e.id === id)
    if (i < 0) return null
    const [entry] = this.list.splice(i, 1)
    this.save()
    return entry
  }

  clear () {
    this.list = []
    this.save()
  }

  matching (query) {
    const q = query.trim().toLowerCase()
    return q ? this.list.filter(e => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)) : this.list
  }
}
