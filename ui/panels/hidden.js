// Hidden on this site (HiddenPanel): what was hidden here, peeked at and brought back.
import { esc, h } from '../elements.js'
import { action } from '../look/controls.js'
import { L } from '../state.js'
import { close, ctx, panel, titled } from './index.js'
import { caption, nothing, quick } from './pieces.js'

export function hiddenPlate () {
  const host = ctx.currentHost()
  const parts = []
  if (!panel.veils.length) parts.push(nothing('Nothing is hidden here.'))
  else {
    const cssWithout = sel => panel.veils.filter(v => v.selector !== sel).map(v => `${v.selector} { display: none !important; }`).join('\n')
    const group = h('div', 'group')
    const list = h('div', 'list short')
    const box = h('div', 'card')
    panel.veils.forEach(v => {
      const row = h('div', 'entry veil', `<div class="words"><div class="name">${esc(v.label)}</div>${v.note ? `<div class="detail">${esc(v.note)}</div>` : ''}</div>`)
      row.append(quick('Restore', () => { ctx.peek(null); L.veil('restore', ctx.currentURL(), v.selector) }))
      row.addEventListener('mouseenter', () => ctx.peek(cssWithout(v.selector), v.selector))
      box.append(row)
    })
    list.append(box)
    group.append(caption('Rest on a line to see it again'), list)
    group.addEventListener('mouseleave', () => ctx.peek(null))
    parts.push(group)
  }
  return titled(host || 'This page', 340, parts, [
    action('Hide something…', () => { close(); ctx.startVeiling() }),
    h('span', 'spacer'),
    panel.veils.length && action('Restore all', () => L.veil('restore-all', ctx.currentURL()))
  ], true)
}
