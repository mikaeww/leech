// The Dev UI (Settings › General): a column of tools left of the page, which the page on screen is attached
// to over the DevTools protocol. One tool at a time; each draws itself afresh when its data changes, and the
// column keeps scroll positions and the caret across those redraws.
import { esc, h } from '../elements.js'
import { current, devMode, prefs, setPref } from '../state.js'
import { attach, attachedTab, detach } from './protocol.js'
import { consoleTool } from './tools/console.js'
import { elementsTool } from './tools/elements.js'
import { explorerTool } from './tools/explorer.js'
import { networkTool } from './tools/network.js'
import { securityTool } from './tools/security.js'
import { storageTool } from './tools/storage.js'

const TOOLS = [explorerTool, consoleTool, networkTool, elementsTool, storageTool, securityTool]
const column = h('aside', '', '<div class="dev-tabs" role="tablist"></div><div class="dev-address"></div><div class="dev-body"></div>')
column.id = 'dev'
column.hidden = true
document.getElementById('app').append(column)
const tabs = column.querySelector('.dev-tabs')
const body = column.querySelector('.dev-body')
let active = TOOLS.find(t => t.id === prefs['dev.tool']) || networkTool
let pending = false
let attaching = null

for (const tool of TOOLS) {
  const b = h('button', '', esc(tool.label))
  b.setAttribute('role', 'tab')
  b.dataset.tool = tool.id
  b.addEventListener('click', () => show(tool.id))
  tabs.append(b)
}

export function show (id) {
  const next = TOOLS.find(t => t.id === id) || active
  if (next !== active) active.left?.()
  active = next
  setPref('dev.tool', active.id)
  active.shown?.()
  draw()
}

/** A tool's data changed: it is drawn again once this frame, if it is the one on screen. */
export function redraw (id) {
  if (id !== active.id || pending || column.hidden) return
  pending = true
  requestAnimationFrame(() => { pending = false; draw() })
}

function draw () {
  for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.tool === active.id))
  const focused = document.activeElement?.closest?.('#dev') ? document.activeElement : null
  const keep = focused?.dataset.keep
  const caret = keep ? [focused.selectionStart, focused.selectionEnd] : null
  const scrolls = new Map([...body.querySelectorAll('[data-keep]')].map(el => [el.dataset.keep, [el.scrollTop, el.scrollHeight - el.scrollTop - el.clientHeight < 4]]))
  body.replaceChildren(...active.draw().filter(Boolean))
  for (const el of body.querySelectorAll('[data-keep]')) {
    const was = scrolls.get(el.dataset.keep)
    // A list that follows its end (the console) stays at the end while it was there.
    if (el.dataset.follow === 'end' && (!was || was[1])) el.scrollTop = el.scrollHeight
    else if (was) el.scrollTop = was[0]
  }
  const again = keep && body.querySelector(`[data-keep="${CSS.escape(keep)}"]`)
  if (again) { again.focus(); if (caret && again.setSelectionRange) again.setSelectionRange(...caret) }
}

/** Called by every render: shows or hides the column and keeps it attached to the tab on screen. */
export function renderDev () {
  const on = devMode()
  column.hidden = !on
  if (!on) { if (attachedTab()) detach(); return }
  const t = current()
  column.querySelector('.dev-address').textContent = t?.url || 'No page'
  const tab = t?.web?.created && /^https?:|^file:/.test(t.url || '') ? t.web.tab : null
  if (tab === attachedTab() || tab === attaching) return
  if (!tab) { detach(); draw(); return }
  attaching = tab
  attach(tab).then(() => { attaching = null; active.shown?.(); draw() })
}
