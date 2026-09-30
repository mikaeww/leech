// Folders in the sidebar.
import { animate, render } from '../../chrome/render.js'
import { folderEls } from '../../chrome/sidebar.js'
import { $, h } from '../../elements.js'
import { menu } from '../../look/menu.js'
import { S, tabs } from '../../state.js'
import { save, saveLater } from '../session.js'
import { closeTab } from '../tabs.js'

export function folderOf (t) { return t?.folder ? S.folders.find(f => f.id === t.folder) : null }
export function sameGroup (a, b) { return !!a.essential === !!b.essential && !!a.pin === !!b.pin && (a.pin || (a.folder || null) === (b.folder || null)) }
export function foldersFrom (saved) {
  return (Array.isArray(saved?.folders) ? saved.folders : [])
    .filter(f => f && typeof f.id === 'string' && typeof f.name === 'string')
    .map(f => ({ id: f.id, name: f.name, open: f.open !== false }))
}

// The row in the order it is drawn: essentials, pinned, then each folder's tabs, then the loose rest. Tabs
// point only at folders that exist, and a folder with no tabs left goes.
export function tidy () {
  for (const t of tabs) if (t.folder && (t.pin || !S.folders.some(f => f.id === t.folder))) t.folder = null
  S.folders = S.folders.filter(f => tabs.some(t => t.folder === f.id))
  const rank = t => t.essential ? -2 : t.pin ? -1 : t.folder ? S.folders.findIndex(f => f.id === t.folder) : S.folders.length
  const order = tabs.map((t, i) => [rank(t), i, t]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2])
  tabs.splice(0, tabs.length, ...order)
}

export function putInFolder (t, id) {
  t.folder = id
  const holder = folderOf(t)
  if (holder) holder.open = true
  tidy()
  animate()
  render()
  save()
}

export function newFolder (t) {
  const id = crypto.randomUUID()
  S.folders.push({ id, name: 'Folder', open: true })
  putInFolder(t, id)
  renameFolder(id)
}

export function toggleFolder (id) {
  const f = S.folders.find(x => x.id === id)
  if (!f) return
  f.open = !f.open
  animate()
  render()
  saveLater()
}

// The name is edited in place, in the folder's own row.
export function renameFolder (id) {
  const f = S.folders.find(x => x.id === id)
  const el = folderEls.get(id)
  if (!f || !el) return
  const input = h('input', 'tab-field')
  input.value = f.name
  input.spellcheck = false
  const label = $('.name', el)
  label.replaceChildren(input)
  input.focus()
  input.select()
  let done = false
  const finish = keep => {
    if (done) return
    done = true
    if (keep && input.value.trim()) f.name = input.value.trim()
    label.textContent = f.name
    el.dataset.key = ''
    render()
    save()
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finish(true)
    else if (e.key === 'Escape') finish(false)
    else return
    e.preventDefault()
  })
  input.addEventListener('click', e => e.stopPropagation())
  input.addEventListener('blur', () => finish(true))
}

export async function folderMenu (id) {
  const f = S.folders.find(x => x.id === id)
  if (!f) return
  const inside = tabs.filter(t => t.folder === id)
  const chosen = await menu([
    { id: 'rename', label: 'Rename Folder' },
    { id: 'toggle', label: f.open ? 'Collapse' : 'Expand' },
    '-',
    { id: 'ungroup', label: 'Remove Folder, Keep Tabs' },
    { id: 'close', label: `Close ${inside.length === 1 ? 'Tab' : `${inside.length} Tabs`}` }
  ])
  if (chosen === 'rename') renameFolder(id)
  else if (chosen === 'toggle') toggleFolder(id)
  else if (chosen === 'ungroup') { for (const t of inside) t.folder = null; tidy(); animate(); render(); save() } else if (chosen === 'close') for (const t of inside) closeTab(t.id)
}
