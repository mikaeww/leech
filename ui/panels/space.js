// A new space, or a new name for this one.
import { h } from '../elements.js'
import { action, segmented } from '../look/controls.js'
import { L } from '../state.js'
import { close, ctx, paint, panel, titled } from './index.js'

export function spacePlate () {
  const d = panel.spaceDraft
  const input = h('input', 'plain-field')
  input.placeholder = 'Name'
  input.value = d.name || ''
  input.autofocus = true
  input.dataset.keep = 'space'
  input.spellcheck = false
  input.addEventListener('input', () => { d.name = input.value })
  const done = () => {
    if (!input.value.trim()) return input.focus()
    close()
    if (d.mode === 'new') ctx.createSpace(input.value, d.shares)
    else ctx.renameSpace(input.value)
  }
  input.addEventListener('keydown', e => { if (e.key === 'Enter') done() })
  const parts = [input]
  // ponytail: the Chromium build has one cookie jar for all spaces, so signed out isn't offered there;
  // a Chromium profile per space when it is wanted.
  if (d.mode === 'new' && !L.native) {
    parts.push(segmented([['in', 'Signed in'], ['out', 'Signed out']], d.shares ? 'in' : 'out', v => { d.shares = v === 'in'; paint() }, true))
    parts.push(h('div', 'foot-note', d.shares ? 'Signed in wherever your other spaces are.' : 'Its own cookies and sign-ins, starting from none.'))
  }
  return titled(d.mode === 'new' ? 'New space' : 'Rename space', 380, parts, [h('span', 'spacer'), action('Cancel', close), action(d.mode === 'new' ? 'Create' : 'Rename', done, true)])
}
