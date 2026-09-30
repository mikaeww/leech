// The archive: tabs put away after going unlooked-at, searched, grouped by day, opened again or forgotten.
import { esc, h } from '../../elements.js'
import { action } from '../../look/controls.js'
import { archive, L, prefs } from '../../state.js'
import { unarchive } from '../../tabs/archive.js'
import { close, ctx, paint, panel, titled } from '../index.js'
import { caption, clock, dayOf, hunt, nothing, quick } from '../pieces.js'

function emptyText () {
  if (panel.archiveQuery) return 'Nothing matches.'
  return prefs.archive ? 'Nothing archived yet.' : 'Nothing archived. Archiving is off; Settings › Tabs turns it on.'
}

export function archivePlate () {
  const entries = archive.matching(panel.archiveQuery)
  const parts = [hunt('Search archived tabs', panel.archiveQuery, v => { panel.archiveQuery = v; paint() }, 'archive')]
  if (!entries.length) parts.push(nothing(emptyText()))
  else {
    const list = h('div', 'list')
    let group = null
    let box = null
    for (const e of entries) {
      const day = dayOf(e.at)
      if (day !== group) {
        group = day
        box = h('div', 'card')
        const g = h('div', 'group')
        g.append(caption(day), box)
        list.append(g)
      }
      const row = h('div', 'entry', `${ctx.markFor(e.url, 16)}<div class="words"><div class="name">${esc(e.title || e.url)}</div><div class="detail">${esc(e.url)}</div></div><span class="time">${clock(e.at)}</span>`)
      row.append(quick('Forget', () => { archive.take(e.id); paint() }, true))
      row.addEventListener('click', () => { close(); unarchive(e.id) })
      box.append(row)
    }
    parts.push(list)
  }
  const count = archive.list.length
  const foot = [h('span', 'foot-note', count === 1 ? '1 tab' : `${count} tabs`), h('span', 'spacer'),
    action('Forget All…', async () => {
      if (await L.confirm('Forget every archived tab?', 'They leave the archive for good; history keeps the places.', 'Forget All')) { archive.clear(); paint() }
    })]
  if (!count) foot.pop()
  return titled('Archived Tabs', 600, parts, foot)
}
