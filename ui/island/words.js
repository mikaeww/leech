// What the island says: the small island's line for each kind of moment, and the open island's status.
import { esc } from '../elements.js'
import { icon } from '../look/icons.js'

const percent = fraction => fraction === null ? '' : `${Math.round(fraction * 100)} %`

const LINES = {
  stopped: m => [icon('shield', 'small'), 'Stopped a redirect', m.host],
  playing: m => [icon('play', 'small'), m.title, ''],
  downloaded: m => [icon('check', 'small'), 'Downloaded', m.name],
  download: m => [icon('download', 'small'), m.count === 1 ? 'Downloading' : `Downloading ${m.count}`, percent(m.fraction)]
}

export function glanceHTML (now) {
  const [glyph, words, meta] = LINES[now.kind](now)
  return `${glyph}<span class="island-words">${esc(words)}</span>${meta ? `<span class="island-meta">${esc(meta)}</span>` : ''}`
}

/** The right of the open island's header, as Coucou's "4 en cours": the most pressing count there is. */
export function headStatus ({ t, downloads }, tabCount) {
  if (t?.stopped) return t.stopped.count === 1 ? '1 redirect stopped here' : `${t.stopped.count} redirects stopped here`
  if (downloads.count > 0) return downloads.count === 1 ? '1 downloading' : `${downloads.count} downloading`
  return tabCount === 1 ? '1 tab' : `${tabCount} tabs`
}
