// Downloads (DownloadsPanel): the list main keeps.
import { esc, h } from '../elements.js'
import { action } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { L, prefs } from '../state.js'
import { ctx, panel, titled } from './index.js'
import { nothing, quick, said } from './pieces.js'

export function downloadsPlate () {
  let body
  if (!panel.loot.length) body = nothing('Nothing downloaded yet.')
  else {
    body = h('div', 'list')
    const box = h('div', 'card')
    panel.loot.forEach(d => {
      const row = h('div', 'entry', `<span class="doc">${icon('doc')}</span><div class="words"><div class="name">${esc(d.name)}</div><div class="detail">${esc(d.from ? `${d.from} · ${said(d.date)}` : said(d.date))}</div></div>`)
      row.append(quick('Show in Folder', () => L.showFile(d.path)), quick('Remove', () => L.forgetDownload(d.path), true))
      row.addEventListener('click', () => L.openFile(d.path))
      box.append(row)
    })
    body.append(box)
  }
  const folder = (prefs.downloads || ctx.downloadsFolder).split('/').pop()
  return titled('Downloads', 560, [body], [
    h('span', 'foot-note', panel.loot.length ? 'Clearing the list leaves the files where they are' : `Files land in ${esc(folder)}`),
    h('span', 'spacer'),
    panel.loot.length && action('Clear list', () => L.clearDownloads())
  ])
}
