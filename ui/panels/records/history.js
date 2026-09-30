// History (HistoryPanel): searched, grouped by day, cleared by span.
import { esc, h } from '../../elements.js'
import { action } from '../../look/controls.js'
import { toast } from '../../page/notices.js'
import { history, L } from '../../state.js'
import { close, ctx, paint, panel, titled } from '../index.js'
import { caption, card, clock, dayOf, hunt, line, nothing, quick } from '../pieces.js'

export function historyPlate () {
  const visits = history.everything(panel.historyQuery)
  const parts = [hunt('Search everywhere you have been', panel.historyQuery, v => { panel.historyQuery = v; paint() }, 'history')]
  if (!visits.length) parts.push(nothing(panel.historyQuery ? 'Nothing matches.' : 'Nothing yet.'))
  else {
    const list = h('div', 'list')
    let group = null
    let box = null
    for (const v of visits.slice(0, 500)) {
      const day = dayOf(v.last)
      if (day !== group) {
        group = day
        box = h('div', 'card')
        const g = h('div', 'group')
        g.append(caption(day), box)
        list.append(g)
      }
      const row = h('div', 'entry', `${ctx.markFor(v.url, 16)}<div class="words"><div class="name">${esc(v.title || v.key)}</div><div class="detail">${esc(v.key)}</div></div><span class="time">${clock(v.last)}</span>`)
      row.append(quick('Remove', () => { history.forget(v.key); paint() }, true))
      row.addEventListener('click', () => { close(); ctx.openURL(v.url) })
      box.append(row)
    }
    parts.push(list)
  }
  const count = visits.length
  const foot = panel.clearing
    ? [sweeps()]
    : [h('span', 'foot-note', count === 1 ? '1 page' : `${count} pages`),
        ...(panel.sources.length ? [h('span', 'foot-note', '· bring in from'), ...panel.sources.map(name => action(name, async () => {
          const list = await L.importHistory(name)
          ctx.historyTake(list)
          toast(`${list.length} places from ${name} brought in`)
          paint()
        }))] : []),
        h('span', 'spacer'), action('Clear…', () => { panel.clearing = true; paint() })]
  return titled('History', 600, parts, foot)
}

function sweeps () {
  const box = h('div', 'sweeps')
  const back = h('div', 'back')
  back.append(action('Back', () => { panel.clearing = false; paint() }))
  box.append(card(
    line('History', 'Everywhere you have been', action('Clear', () => { history.clear(); panel.clearing = false; paint() })),
    line('Cookies and sign-ins', 'Signs you out of every site', action('Sign out of everything', async () => { await L.clear('cookies'); toast('Signed out of everything') })),
    line('Cache', 'Only what was fetched to draw pages', action('Clear', async () => { await L.clear('cache'); toast('Cache cleared') }))
  ), back)
  return box
}
