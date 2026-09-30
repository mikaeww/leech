// The media bar: the last tab that played, at the foot of the sidebar while another tab is on screen, with
// play/pause, mute and the way back to it.
import { esc, h, side } from '../elements.js'
import { icon } from '../look/icons.js'
import { favicon, label, S, tab, ui } from '../state.js'
import { select, toggleMute } from '../tabs/tabs.js'
import { markHTML } from './marks.js'

// ponytail: reaches media in the page's own document only; a player inside a cross-site frame (an embedded
// video) is heard but not paused from here. Chromium's media session would reach it, at the cost of a bridge.
const PLAY_PAUSE = `(() => {
  const all = [...document.querySelectorAll('video, audio')]
  const playing = all.filter(m => !m.paused)
  if (playing.length) { playing.forEach(m => m.pause()); window.__leechPaused = playing; return }
  const again = (window.__leechPaused || all.slice(0, 1)).filter(m => m.isConnected)
  again.forEach(m => m.play())
})()`

const bar = h('div', 'media')
bar.hidden = true
side.insertBefore(bar, side.querySelector('.foot-row'))

/** The tab whose sound the bar follows: the one that started playing last. */
export function heard (t) { ui.media = t.id }

export function renderMedia () {
  const t = ui.media && tab(ui.media)
  const show = !!t?.web && t.id !== S.active
  bar.hidden = !show
  if (!show) return
  const key = JSON.stringify([t.id, t.audible, t.muted, label(t), favicon(t)])
  if (bar.dataset.key === key) return
  bar.dataset.key = key
  bar.innerHTML = `<button class="media-tab" data-act="go" title="Go to this tab">${markHTML(t)}<span class="title">${esc(label(t))}</span></button>` +
    `<button class="door" data-act="play" title="${t.audible ? 'Pause' : 'Play'}">${icon(t.audible ? 'pause' : 'play', 'alone')}</button>` +
    `<button class="door" data-act="mute" title="${t.muted ? 'Unmute' : 'Mute'}">${icon(t.muted ? 'muted' : 'speaker', 'alone')}</button>`
}

bar.addEventListener('click', e => {
  const t = ui.media && tab(ui.media)
  const act = e.target.closest('[data-act]')?.dataset.act
  if (!t || !act) return
  if (act === 'go') select(t.id)
  if (act === 'mute') toggleMute(t)
  if (act === 'play' && t.ready) t.web.executeJavaScript(PLAY_PAUSE, true).catch(() => { /* the page went away meanwhile */ })
})
