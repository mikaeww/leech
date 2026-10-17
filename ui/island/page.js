// The island's Page: the page on screen, how it is reached and how far it is read, and what can be done to it.
import { actions } from '../keys.js'
import { h } from '../elements.js'
import { icon } from '../look/icons.js'
import { card, line } from '../panels/pieces.js'
import { bareHost, isWeb } from '../places/address.js'
import { bookmarks, L } from '../state.js'
import { zoom } from '../tabs/views.js'
import { tile, tiles } from './parts.js'

function about (t, web) {
  const secure = t.url.startsWith('https:')
  const read = t.reading > 0.05 ? ` · ${Math.round(t.reading * 10) * 10} % read` : ''
  const lock = h('span', 'island-lock', icon(secure ? 'lock' : 'lockOpen', 'small'))
  lock.title = secure ? 'Secure connection' : 'Not secure'
  return line(web ? bareHost(t.url) : t.url, `${web ? (secure ? 'Secure connection' : 'Not secure: anything sent can be read on the way') : 'Not a web page'}${read}`, lock)
}

function zooming (t, redraw) {
  const level = h('button', 'zoom-level', `${Math.round(t.web.getZoomFactor() * 100)}%`)
  level.title = 'Back to 100%  Ctrl+0'
  level.addEventListener('click', () => { zoom(null); redraw() })
  const step = (glyph, title, f) => {
    const b = h('button', 'zoom-step', icon(glyph, 'small'))
    b.title = title
    b.addEventListener('click', () => { zoom(f); redraw() })
    return b
  }
  const box = h('div', 'zoom-row')
  box.append(step('minimize', 'Zoom out  Ctrl+-', 1 / 1.1), level, step('plus', 'Zoom in  Ctrl++', 1.1))
  return line('Zoom', null, box)
}

export const pageView = {
  id: 'page',
  glyph: 'globe',
  label: 'Page',
  shows: ({ t }) => !!t?.url,
  fill ({ t, close, redraw }) {
    const web = isWeb(t.url)
    // What leaves the island for the page (find, print, reading) closes it first.
    const then = name => () => { close(); actions[name]() }
    const marked = web && bookmarks.has(t.url)
    const view = h('div', 'island-view')
    view.append(
      card(about(t, web), t.ready && zooming(t, redraw)),
      tiles(
        tile('book', 'Reader', then('reader'), { on: !!t.reader, off: !web }),
        tile('window', 'Float video', then('pip'), { off: !web }),
        tile('search', 'Find', then('find'), { off: !t.ready }),
        tile('copy', 'Copy address', () => actions['copy-address']()),
        tile('bookmark', marked ? 'Bookmarked' : 'Bookmark', () => { actions.bookmark(); redraw() }, { on: marked, off: !web }),
        tile('eyeOff', 'Hide something', then('veil'), { off: !web }),
        tile('printer', 'Print', then('print'), { off: !t.ready }),
        tile('tabs', 'Duplicate', then('duplicate')),
        L.native && tile('box', 'In a sandbox', then('sandbox'), { off: !web })
      )
    )
    view.setAttribute('aria-label', `The page: ${t.url}`)
    return view
  }
}
