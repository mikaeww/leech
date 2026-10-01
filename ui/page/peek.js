// Reading mode, the floating video, and a peek at a link.
import { render } from '../chrome/render.js'
import { $, h, stage } from '../elements.js'
import { icon } from '../look/icons.js'
import { current, partitionOf, S, ui } from '../state.js'
import { open } from '../tabs/tabs.js'
import { toast } from './notices.js'
import { READER } from './reader.js'

export async function toggleReader () {
  const t = current()
  if (!t?.ready || t.failure) return
  if (t.reader) { t.reader = false; return t.web.reload() }
  const said = await t.web.executeJavaScript(READER).catch(() => 'none')
  if (said === 'read') t.reader = true
  else toast('Nothing to read on this page')
}

// Chromium's own picture-in-picture window; on Wayland the compositor decides whether it stays on top.
const FLOAT = `(async () => {
  if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'back' }
  const videos = [...document.querySelectorAll('video')].filter(v => v.readyState > 0 && !v.disablePictureInPicture)
  const playing = videos.filter(v => !v.paused)
  const pick = (playing.length ? playing : videos).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
  if (!pick) return 'none'
  await pick.requestPictureInPicture()
  return 'floating'
})()`

export async function float () {
  const t = current()
  if (!t?.ready) return
  const said = await t.web.executeJavaScript(FLOAT, true).catch(() => 'none')
  if (said === 'none') toast('Nothing is playing here')
}

const peekBox = h('div', 'peek', '<div class="peek-dim"></div><div class="peek-frame"><div class="peek-page"></div><div class="peek-doors"></div></div>')
peekBox.hidden = true
$('#app').append(peekBox)
export let peekView = null

export function peek (url) {
  closePeek()
  peekView = document.createElement('webview')
  peekView.setAttribute('partition', current()?.shy ? `leech-private-${current().id}` : partitionOf(S.space))
  peekView.setAttribute('allowpopups', '')
  peekView.setAttribute('preload', new URL('guest/page.js', location.href).href)
  peekView.src = url
  $('.peek-page', peekBox).append(peekView)
  Object.assign(peekBox.style, { left: stage.style.left, top: stage.style.top })
  peekBox.hidden = false
  ui.peeking = false
  render()
}

export function closePeek () {
  if (!peekView) return
  peekView.remove()
  peekView = null
  peekBox.hidden = true
  render()
}

// Keeps the peeked page as a tab after the current one; it loads again there.
function expandPeek () {
  if (!peekView) return
  const url = peekView.getURL?.() || peekView.src
  closePeek()
  open(url, true)
}

$('.peek-dim', peekBox).addEventListener('click', closePeek)
{
  const knob = (name, title, fn) => { const b = h('button', 'knob', icon(name)); b.title = title; b.addEventListener('click', fn); return b }
  $('.peek-doors', peekBox).append(knob('x', 'Close (esc)', closePeek), knob('expand', 'Open as a tab', expandPeek))
}
