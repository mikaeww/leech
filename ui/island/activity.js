// What the island shows while it isn't open: the newest thing that just happened, for a moment, or a download
// for as long as it runs. No DOM: unit-tested.

export const MOMENT_MS = 4000

/**
 * `moments` are things that happened ({ kind, at, ... }: 'stopped', 'playing', 'downloaded'); `downloads`
 * ({ count, fraction }) is what the shell reports; `now` in ms. Returns the moment or download to show, or null.
 */
export function activityOf ({ moments, downloads, now }) {
  const fresh = moments.filter(m => m && now - m.at >= 0 && now - m.at < MOMENT_MS)
  if (fresh.length) return fresh.reduce((a, b) => b.at > a.at ? b : a)
  if (downloads?.count > 0) return { kind: 'download', count: downloads.count, fraction: downloads.fraction ?? null }
  return null
}

/** The downloads that finished since `seen` (paths already known), and the paths known now. */
export function finishedSince (seen, list) {
  const done = list.filter(d => (d.state === 'done' || !d.state) && d.path)
  return { finished: seen ? done.filter(d => !seen.has(d.path)) : [], seen: new Set(done.map(d => d.path)) }
}
