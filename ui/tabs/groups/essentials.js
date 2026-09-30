// Essentials: tiles every space shares. They live in essentials.json, never in a space's session, and
// travel along when the space changes; they always open in the shared cookie jar.
import { animate, render } from '../../chrome/render.js'
import { makeTab, monogram, partitionOf, S, tabs } from '../../state.js'
import { save } from '../session.js'
import { unload, wake } from '../views.js'
import { tidy } from './folders.js'

const SHARED = 'personal'

export function essentialsFrom (saved) {
  return (Array.isArray(saved) ? saved : [])
    .filter(e => e && typeof e.url === 'string')
    .map(e => makeTab({ url: e.url, title: e.title || null, pin: e.pin || null, home: e.url, essential: true, space: SHARED }))
}

export function essentialsSnapshot () {
  return tabs.filter(t => t.essential).map(t => ({ url: t.home || t.url, title: t.title, pin: t.pin }))
}

// A tab that changes cookie jar has to load again in the new one.
function moveTo (t, space) {
  const reload = partitionOf(t.space) !== partitionOf(space)
  t.space = space
  if (!reload || !t.web) return
  unload(t)
  if (S.active === t.id) wake(t)
}

function settle () {
  tidy()
  animate()
  render()
  save()
}

export function addEssential (t) {
  if (t.essential || t.shy || !t.url) return
  t.essential = true
  t.folder = null
  t.pin = t.pin || monogram(t)
  t.home = t.home || t.url
  moveTo(t, SHARED)
  settle()
}

// It stays open, as an ordinary tab of the space on screen.
export function removeEssential (t) {
  if (!t.essential) return
  t.essential = false
  t.pin = null
  t.home = null
  moveTo(t, S.space)
  settle()
}
