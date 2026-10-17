// The island's Sound: every tab that plays or last played, with play or pause, mute and the way to it, and
// quiet for all the others.
import { markHTML } from '../chrome/marks.js'
import { playPause } from '../chrome/media.js'
import { esc, h } from '../elements.js'
import { door } from '../look/controls.js'
import { card, line, quick } from '../panels/pieces.js'
import { label, S, tab, tabs, ui } from '../state.js'
import { select, toggleMute } from '../tabs/tabs.js'
import { named, row } from './parts.js'

const heard = () => tabs.filter(t => t.web && (t.audible || t.id === ui.media))

export const soundView = {
  id: 'sound',
  glyph: 'speaker',
  label: 'Sound',
  shows: () => heard().length > 0 || !!(ui.media && tab(ui.media)),
  fill ({ redraw }) {
    const playing = heard()
    const others = playing.filter(t => t.id !== S.active && t.audible && !t.muted)
    const view = h('div', 'island-view')
    view.append(card(...playing.map(t => row(
      named(`${markHTML(t)}<span class="title">${esc(label(t))}</span>`, t.id === S.active ? 'This tab' : 'Go to this tab', () => select(t.id)),
      door(t.audible ? 'pause' : 'play', t.audible ? 'Pause' : 'Play', () => playPause(t)),
      door(t.muted ? 'muted' : 'speaker', t.muted ? 'Unmute' : 'Mute', () => { toggleMute(t); redraw() })
    ))))
    if (others.length) view.append(card(line('Quiet the other tabs', others.length === 1 ? '1 tab plays besides this one' : `${others.length} tabs play besides this one`,
      quick('Mute them', () => { for (const t of others) toggleMute(t); redraw() }))))
    return view
  }
}
