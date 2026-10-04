// Where downloads went: each download under the folder it landed in, said relative to the downloads folder.
// No DOM; tested in test/.
import { KINDS, OTHER } from './kinds.js'

const trimmed = folder => folder.replace(/\/+$/, '') || '/'
const dirOf = path => path.slice(0, path.lastIndexOf('/')) || '/'

/** '' for the downloads folder itself, a relative path for a folder under it, the absolute folder otherwise. */
export function landedIn (path, root) {
  const dir = dirOf(path)
  const base = trimmed(root)
  if (dir === base) return ''
  return dir.startsWith(base + '/') ? dir.slice(base.length + 1) : dir
}

/**
 * The folders downloads went to, each with its downloads in the order given: the downloads folder first, then
 * every kind folder while sorting is on (empty ones too, so the owner sees where things will go), then the rest.
 */
export function foldersOf (items, root, sorting) {
  const map = new Map([['', []]])
  if (sorting) for (const name of [...KINDS.map(([kind]) => kind), OTHER]) map.set(name, [])
  for (const d of items) {
    if (!d.path) continue
    const rel = landedIn(d.path, root)
    if (!map.has(rel)) map.set(rel, [])
    map.get(rel).push(d)
  }
  const base = trimmed(root)
  return [...map].map(([rel, list]) => ({ rel, path: rel === '' ? base : rel.startsWith('/') ? rel : `${base}/${rel}`, items: list }))
}
