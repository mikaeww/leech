// The island's Tabs: new, private, reopen, clear; the panels; and what downloads or just finished.
import { actions } from '../keys.js'
import { esc, h } from '../elements.js'
import { door } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { card } from '../panels/pieces.js'
import { ghosts, L, tabs } from '../state.js'
import { clearable } from '../tabs/archive.js'
import { named, row, tile, tiles } from './parts.js'

function downloading ({ downloads, finished }) {
  if (downloads.count > 0) {
    const share = downloads.fraction === null ? null : Math.round(downloads.fraction * 100)
    const bar = h('div', 'island-progress')
    bar.style.setProperty('--done', `${share ?? 0}%`)
    const words = `${downloads.count === 1 ? '1 download' : `${downloads.count} downloads`}${share === null ? '' : ` · ${share} %`}`
    return card(row(named(`${icon('download', 'small')}<span class="title">${esc(words)}</span>`, 'Show downloads  Ctrl+J', () => actions.downloads())), bar)
  }
  if (!finished) return null
  return card(row(named(`${icon('doc', 'small')}<span class="title">${esc(finished.name)}</span>`, 'Open', () => L.openFile(finished.path)),
    door('folder', 'Show in folder', () => L.showFile(finished.path))))
}

export const tabsView = {
  id: 'tabs',
  glyph: 'tabs',
  label: 'Tabs',
  shows: () => true,
  fill (ctx) {
    const then = name => () => { ctx.close(); actions[name]() }
    const loose = tabs.filter(clearable).length
    const view = h('div', 'island-view')
    view.append(...[tiles(
      tile('plus', 'New tab', then('new-tab')),
      tile('eyeOff', 'Private tab', then('private-tab')),
      tile('undo', 'Reopen closed', then('reopen'), { off: !ghosts.length }),
      tile('archive', loose ? `Clear ${loose}` : 'Clear', then('clear-tabs'), { off: !loose }),
      tile('history', 'History', then('history')),
      tile('bookmark', 'Bookmarks', then('bookmarks')),
      tile('archive', 'Archived', then('archive')),
      tile('download', 'Downloads', then('downloads')),
      tile('gear', 'Settings', then('settings'))
    ), downloading(ctx)].filter(Boolean))
    return view
  }
}
