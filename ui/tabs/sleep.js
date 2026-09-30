// Sleep: tabs left alone give their memory back, and wake under the picture they fell asleep on.
import { render } from '../chrome/render.js'
import { h, stage } from '../elements.js'
import { current, L, now, parked, prefs, S, tabs } from '../state.js'
import { unload } from './views.js'

const SLEEP_AFTER = () => prefs['sleep.after'] || 1800

function stays (t) {
  const opener = current()?.opener
  return t.id === S.active || t.pin || !t.web || !t.ready || t.loading || t.audible || t.id === opener || t.signin
}

function hasUnsaved (t) {
  return new Promise(resolve => {
    const done = v => { t.answer = null; resolve(v) }
    t.answer = done
    t.web.send('unsaved?')
    setTimeout(() => t.answer === done && done(true), 1000)
  })
}

const within = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))])

async function sleepTab (t) {
  if (t.falling || stays(t)) return
  t.falling = true
  try {
    if (await hasUnsaved(t) || stays(t)) return
    // A page that isn't on screen may never hand over a picture; it sleeps without one then.
    const picture = await within(L.snapshot(t.web.getWebContentsId()), 1500)
    if (stays(t)) return
    // ponytail: waking reloads the address, so back/forward is lost; webviews can't take history back
    // (navigationHistory.restore needs a page that never loaded, and a webview only attaches with a src).
    t.picture = picture
    unload(t)
    render()
  } finally {
    t.falling = false
  }
}

// Checked every minute, or more often when the hidden sleep.after setting is short.
;(function check () {
  if (prefs['tabs.sleep']) {
    const due = now() - SLEEP_AFTER()
    const all = tabs.concat(...[...parked.values()].map(r => r.tabs))
    all.filter(t => t.touched < due && !stays(t)).sort((a, b) => a.touched - b.touched).forEach(sleepTab)
  }
  setTimeout(check, Math.min(60, Math.max(5, SLEEP_AFTER() / 4)) * 1000)
})()

// The picture a tab fell asleep on, over the page until it has drawn again.
const coverEl = h('img', 'cover')
coverEl.hidden = true
stage.append(coverEl)
let coverTimer = null
export function cover (t) {
  if (t.id !== S.active || !t.picture) return
  coverEl.src = t.picture
  coverEl.hidden = false
  coverEl.classList.remove('going')
  clearTimeout(coverTimer)
  coverTimer = setTimeout(() => uncover(t), 4000)
}
export function uncover (t) {
  t.picture = null
  if (coverEl.hidden) return
  coverEl.classList.add('going')
  setTimeout(() => { coverEl.hidden = true }, 200)
}
