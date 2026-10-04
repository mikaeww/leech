// Editing a tab in place (address, name, pin letter) and its right-click menu.
import { animate, render } from '../chrome/render.js'
import { $, h } from '../elements.js'
import { menu } from '../look/menu.js'
import { toast } from '../page/notices.js'
import { destination, pasteOnOneLine } from '../page/omnibox.js'
import { closeCard, pickedOffer, siteCard, walkOffers } from '../page/sitecard.js'
import { isWeb, pretty } from '../places/address.js'
import { blank, ghosts, L, label, S, tab, tabs, ui } from '../state.js'
import { addEssential, removeEssential } from './groups/essentials.js'
import { newFolder, putInFolder } from './groups/folders.js'
import { canSplit, splitWith, unpair } from './groups/split.js'
import { save } from './session.js'
import { closeOthers, closeTab, open, pin, reopen, select, toggleMute, unpin } from './tabs.js'
import { focusPage, go } from './views.js'

export function startTabEdit (t, kind) {
  const draft = kind === 'name' ? label(t) : kind === 'pin' ? t.pin : (t.url ? pretty(t.url) : '')
  // `draft` follows the typing, so a re-render keeps it; `from` is what Enter compares against.
  ui.tabEdit = { id: t.id, kind, draft, from: draft }
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
  const offer = pickedOffer()
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
    } else if (offer || (draft.trim() && draft !== e.from)) {
      const url = offer || destination(draft)
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
  if (ui.tabEdit.kind === 'address') pasteOnOneLine(input)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finishTabEdit(true)
    else if (e.key === 'Escape') finishTabEdit(false)
    else if (e.key === 'Tab') finishTabEdit(true)
    else if (e.key === 'ArrowDown') walkOffers(1)
    else if (e.key === 'ArrowUp') walkOffers(-1)
    else return
    e.preventDefault()
  })
  input.addEventListener('input', () => { ui.tabEdit && (ui.tabEdit.draft = input.value) })
  input.addEventListener('blur', () => setTimeout(() => ui.tabEdit?.id === t.id && finishTabEdit(ui.tabEdit.kind !== 'address'), 0))
  return input
}

// The tabs a tab can split with, most recently looked at first.
function splitChoices (t) {
  const others = tabs.filter(x => canSplit(t, x)).sort((a, b) => b.touched - a.touched).slice(0, 12)
  return others.length ? others.map(x => ({ id: `split:${x.id}`, label: label(x) })) : [{ id: 'none', label: 'No other tab', enabled: false }]
}

// A new folder straight from the menu; moving into another one only when there is another one.
function folderChoices (t) {
  if (t.pin) return []
  const others = S.folders.filter(f => f.id !== t.folder)
  return [
    { id: 'folder:new', label: 'New Folder with Tab' },
    ...(others.length ? [{ id: 'folder', label: 'Move to Folder', items: others.map(f => ({ id: `folder:${f.id}`, label: f.name })) }] : []),
    ...(t.folder ? [{ id: 'unfold', label: 'Remove from Folder' }] : [])
  ]
}

export async function tabMenu (t) {
  const items = [
    ...(t.pin ? [{ id: 'letter', label: 'Change Letter' }, ...(t.essential ? [] : [{ id: 'unpin', label: 'Unpin' }]), ...(t.home && t.home !== t.url ? [{ id: 'home', label: 'Back to Pinned Page' }] : [])] : [{ id: 'pin', label: 'Pin', enabled: !blank(t) }]),
    t.essential ? { id: 'essential', label: 'Remove from Essentials' } : { id: 'essential', label: 'Add to Essentials', enabled: !blank(t) && !t.shy },
    '-',
    { id: 'rename', label: 'Rename' },
    { id: 'duplicate', label: 'Duplicate', enabled: !blank(t) },
    { id: 'copy', label: 'Copy Address', enabled: !blank(t) },
    { id: 'markdown', label: 'Copy as Markdown Link', enabled: !blank(t) },
    ...(L.sandbox ? [{ id: 'sandbox', label: 'Open in Sandbox', enabled: isWeb(t.url) }] : []),
    { id: 'mute', label: t.muted ? 'Unmute Tab' : 'Mute Tab' },
    t.split
      ? { id: 'unsplit', label: 'Separate Split Tabs' }
      : { id: 'split', label: 'Split with', enabled: !t.pin, items: splitChoices(t) },
    ...folderChoices(t),
    '-',
    { id: 'close', label: 'Close Tab' },
    { id: 'others', label: 'Close Other Tabs', enabled: tabs.length > 1 },
    { id: 'reopen', label: 'Reopen Closed Tab', enabled: ghosts.length > 0 }
  ]
  const chosen = await menu(items)
  if (!tab(t.id)) return
  if (chosen?.startsWith('folder:')) return chosen === 'folder:new' ? newFolder(t) : putInFolder(t, chosen.slice(7))
  if (chosen === 'unfold') return putInFolder(t, null)
  if (chosen?.startsWith('split:')) return splitWith(t, tab(Number(chosen.slice(6))))
  if (chosen === 'unsplit') return unpair(t)
  const md = s => s.replace(/[\\[\]]/g, m => '\\' + m)
  ;({
    pin: () => pin(t),
    essential: () => t.essential ? removeEssential(t) : addEssential(t),
    unpin: () => unpin(t),
    home: () => go(t, t.home),
    letter: () => { if (S.active !== t.id) select(t.id); startTabEdit(t, 'pin') },
    rename: () => { if (S.active !== t.id) select(t.id); startTabEdit(t, 'name') },
    duplicate: () => open(t.url, true),
    copy: () => { L.copy(t.url); toast('Address copied') },
    markdown: () => { L.copy(`[${md(label(t))}](${t.url})`); toast('Link copied') },
    mute: () => toggleMute(t),
    sandbox: () => L.sandbox(t.url),
    close: () => closeTab(t.id),
    others: () => closeOthers(t.id),
    reopen
  })[chosen]?.()
}
