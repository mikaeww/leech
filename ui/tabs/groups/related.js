// Related tabs: a tab home to a repository or a package keeps the tabs about it (its issues, docs, a
// question, a video naming it, links opened from it) right under it, set in a little in the sidebar.
import { belongs, topicOf } from '../../places/sorting/topics.js'
import { prefs, tabs } from '../../state.js'
import { saveLater } from '../session.js'

const loose = t => !t.pin && !t.essential && !t.folder

function rootsOf () {
  const roots = new Map()
  const keys = new Set()
  for (const t of tabs) {
    const topic = loose(t) && topicOf(t.url)
    if (topic && !keys.has(topic.key)) { keys.add(topic.key); roots.set(t, topic) }
  }
  return roots
}

/** Each related tab's root, by id: the first loose tab home to a topic the tab belongs to or was opened from. */
export function relations () {
  const of = new Map()
  if (!prefs['tabs.related']) return of
  const roots = rootsOf()
  for (const t of tabs) {
    if (!loose(t) || roots.has(t)) continue
    for (const [root, topic] of roots) {
      if (root.shy !== t.shy) continue
      const opened = t.opener === root.id || of.get(t.opener) === root.id
      if (opened || belongs(topic, t.url, t.title)) { of.set(t.id, root.id); break }
    }
  }
  return of
}

/** A tab that has just come to belong to a root moves under it, after the ones already there. */
export function keepTogether (t) {
  const of = relations()
  const root = of.get(t.id) ?? null
  if (root === t.related) return
  t.related = root
  if (root === null) return
  const start = tabs.findIndex(x => x.id === root)
  let end = start
  while (tabs[end + 1] && (tabs[end + 1] === t || of.get(tabs[end + 1].id) === root)) end++
  const at = tabs.indexOf(t)
  if (at > start && at <= end) return
  tabs.splice(at, 1)
  tabs.splice(at < start ? end : end + 1, 0, t)
  saveLater()
}
