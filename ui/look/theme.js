// Light and dark: one crossfade of the whole window, nothing fading on its own schedule.
import { L, prefs } from '../state.js'

const darkQuery = matchMedia('(prefers-color-scheme: dark)')
function quietly (fn) {
  document.documentElement.classList.add('theming')
  fn()
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('theming')))
}

// ?theme=light or ?theme=dark pins this document's palette, for screenshots; the setting stays as it is.
const pinned = new URLSearchParams(location.search).get('theme')
const wantsDark = () => pinned ? pinned === 'dark' : prefs.look === 'dark' || (prefs.look === 'system' && darkQuery.matches)

// The palette hangs off a class the UI sets itself, so it changes in the same frame; pages follow through Chromium.
const paint = () => document.documentElement.classList.toggle('dark', wantsDark())

// Before anything is drawn, so a dark window never starts white; Chromium's own surfaces (the page's
// gutter while it resizes, its menus) follow the same look.
paint()
L.look(prefs.look)

export function changeLook (look) {
  const flip = () => {
    document.documentElement.classList.add('theming')
    paint()
    L.look(look)
  }
  const after = () => requestAnimationFrame(() => document.documentElement.classList.remove('theming'))
  if (document.startViewTransition) document.startViewTransition(flip).finished.finally(after)
  else { flip(); after() }
}

// A change coming from the system instead: no crossfade, but no staggered colours either.
darkQuery.addEventListener('change', () => { if (prefs.look === 'system') quietly(paint) })
