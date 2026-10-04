// A sandbox window (ADR 0012): its own off-the-record profile, one page to start with, none of the owner's
// tabs, and a word in the chrome saying what it is.
import { panels } from './chrome/panels.js'
import { render } from './chrome/render.js'
import { h } from './elements.js'
import { toast } from './page/notices.js'
import { L, makeTab, tabs } from './state.js'
import { select } from './tabs/tabs.js'

export function startSandbox () {
  document.getElementById('app').classList.add('sandbox')
  document.title = 'Sandbox — Leech'
  for (const lead of document.querySelectorAll('.lead')) {
    const mark = h('button', 'sandbox-mark', 'Sandbox')
    mark.title = 'What this sandbox keeps apart'
    mark.addEventListener('click', () => panels.toggle('sandbox'))
    lead.append(mark)
  }
  const t = makeTab({ url: L.info.page || null })
  tabs.push(t)
  render()
  select(t.id)
  toast('A sandbox: nothing from your normal window, nothing kept')
}
