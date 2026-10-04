// A sandbox window (ADR 0012): its own off-the-record profile, one page to start with, none of the owner's
// tabs, and a word in the chrome saying what it is.
import { render } from './chrome/render.js'
import { h } from './elements.js'
import { L, makeTab, tabs } from './state.js'
import { select } from './tabs/tabs.js'

export function startSandbox () {
  document.getElementById('app').classList.add('sandbox')
  document.title = 'Sandbox — Leech'
  for (const lead of document.querySelectorAll('.lead')) lead.append(h('span', 'sandbox-mark', 'Sandbox'))
  const t = makeTab({ url: L.info.page || null })
  tabs.push(t)
  render()
  select(t.id)
}
