// Editing a tab in place (address, name, pin letter) and its right-click menu.
import { animate, render } from '../chrome/render.js'
import { $, h } from '../elements.js'
import { menu } from '../look/menu.js'
import { toast } from '../page/notices.js'
import { destination } from '../page/omnibox.js'
import { closeCard, siteCard } from '../page/sitecard.js'
import { pretty } from '../places/address.js'
import { blank, ghosts, L, label, S, tab, tabs, ui } from '../state.js'
import { newFolder, putInFolder } from './folders.js'
import { save } from './session.js'
import { closeOthers, closeTab, open, pin, reopen, select, toggleMute, unpin } from './tabs.js'
import { focusPage, go } from './views.js'

export function startTabEdit (t, kind) {
  const draft = kind === 'name' ? label(t) : kind === 'pin' ? t.pin : (t.url ? pretty(t.url) : '')
  ui.tabEdit = { id: t.id, kind, draft }
  ui.editing = false
  animate()
  render()
  const input = $('.tab-field')
  if (input) { input.focus(); input.select() }
  if (kind === 'address' && !blank(t)) setTimeout(() => siteCard(t, input), 30)
}

export function finishTabEdit (commit) {
  const e = ui.tabEdit
  if (!e) return
  closeCard()
  const t = tab(e.id)
  const input = $('.tab-field')
  const draft = input ? input.value : e.draft
  ui.tabEdit = null
  if (commit && t) {
    if (e.kind === 'name') {
      t.name = draft.trim() && draft.trim() !== t.title ? draft.trim() : null
      save()
    } else if (e.kind === 'pin') {
      const letter = [...draft.trim()][0]
      if (letter) { t.pin = letter.toUpperCase(); save() }
    } else if (draft.trim() && draft !== e.draft) {
      const url = destination(draft)
      if (url) go(t, url)
    }
  }
  animate()
  render()
  focusPage()
}

export function tabField (t) {
  const input = h('input', 'tab-field')
  input.value = ui.tabEdit.draft
  input.spellcheck = false
  if (ui.tabEdit.kind === 'pin') input.maxLength = 2
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finishTabEdit(true)
    else if (e.key === 'Escape') finishTabEdit(false)
    else if (e.key === 'Tab') { e.preventDefault(); finishTabEdit(true) } else return
    e.preventDefault()
  })
  input.addEventListener('input', () => { ui.tabEdit && (ui.tabEdit.draft = input.value) })
  input.addEventListener('blur', () => setTimeout(() => ui.tabEdit?.id === t.id && finishTabEdit(ui.tabEdit.kind !== 'address'), 0))
  return input
}

export async function tabMenu (t) {
  const items = [
    ...(t.pin ? [{ id: 'letter', label: 'Change Letter' }, { id: 'unpin', label: 'Unpin' }, ...(t.home && t.home !== t.url ? [{ id: 'home', label: 'Back to Pinned Page' }] : [])] : [{ id: 'pin', label: 'Pin', enabled: !blank(t) }]),
    '-',
    { id: 'rename', label: 'Rename' },
    { id: 'duplicate', label: 'Duplicate', enabled: !blank(t) },
    { id: 'copy', label: 'Copy Address', enabled: !blank(t) },
    { id: 'markdown', label: 'Copy as Markdown Link', enabled: !blank(t) },
    { id: 'mute', label: t.muted ? 'Unmute Tab' : 'Mute Tab' },
    ...(t.pin ? [] : [{ id: 'folder', label: 'Move to Folder', items: [
      ...S.folders.filter(f => f.id !== t.folder).map(f => ({ id: `folder:${f.id}`, label: f.name })),
      ...(S.folders.some(f => f.id !== t.folder) ? ['-'] : []),
      { id: 'folder:new', label: 'New Folder' }
    ] }, ...(t.folder ? [{ id: 'unfold', label: 'Remove from Folder' }] : [])]),
    '-',
    { id: 'close', label: 'Close Tab' },
    { id: 'others', label: 'Close Other Tabs', enabled: tabs.length > 1 },
    { id: 'reopen', label: 'Reopen Closed Tab', enabled: ghosts.length > 0 }
  ]
  const chosen = await menu(items)
  if (!tab(t.id)) return
  if (chosen?.startsWith('folder:')) return chosen === 'folder:new' ? newFolder(t) : putInFolder(t, chosen.slice(7))
  if (chosen === 'unfold') return putInFolder(t, null)
  const md = s => s.replace(/[\\[\]]/g, m => '\\' + m)
  ;({
    pin: () => pin(t),
    unpin: () => unpin(t),
    home: () => go(t, t.home),
    letter: () => { if (S.active !== t.id) select(t.id); startTabEdit(t, 'pin') },
    rename: () => { if (S.active !== t.id) select(t.id); startTabEdit(t, 'name') },
    duplicate: () => open(t.url, true),
    copy: () => { L.copy(t.url); toast('Address copied') },
    markdown: () => { L.copy(`[${md(label(t))}](${t.url})`); toast('Link copied') },
    mute: () => toggleMute(t),
    close: () => closeTab(t.id),
    others: () => closeOthers(t.id),
    reopen
  })[chosen]?.()
}
