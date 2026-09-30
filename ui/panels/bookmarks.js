// Bookmarks (BookmarksPanel, BookmarkOutline): the outline, moved, renamed, imported.
import { emptyRow } from '../chrome/bookmarks.js'
import { esc, h } from '../elements.js'
import { action } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { menu } from '../look/menu.js'
import { toast } from '../page/notices.js'
import { bookmarks, L } from '../state.js'
import { close, ctx, paint, panel, titled } from './index.js'
import { card, line, nothing } from './pieces.js'

function outline (list, depth, into) {
  for (const node of list) {
    const folder = !!node.children
    const opened = panel.openFolders.has(node.id)
    const row = h('div', 'outline-row')
    row.style.setProperty('--depth', depth)
    const count = folder ? bookmarks.countIn(node) : 0
    row.innerHTML = folder
      ? `<span class="chevron${opened ? ' open' : ''}">${icon('forward', 'small')}</span><span class="mark folder">${icon('folderFill', 'small')}</span><span class="name">${esc(node.title)}</span>${count ? `<span class="count">${count}</span>` : ''}`
      : `<span class="chevron-space"></span>${ctx.markFor(node.url, 15)}<span class="name">${esc(node.title)}</span>`
    row.title = node.url || ''
    row.addEventListener('click', () => {
      if (folder) { opened ? panel.openFolders.delete(node.id) : panel.openFolders.add(node.id); paint() } else { close(); ctx.openURL(node.url) }
    })
    row.addEventListener('contextmenu', e => { e.preventDefault(); bookmarkMenu(node) })
    into.append(row)
    if (folder && opened) {
      if (!node.children.length) into.append(emptyRow(depth + 1))
      else outline(node.children, depth + 1, into)
    }
  }
}

async function bookmarkMenu (node) {
  const targets = []
  const walk = (list, depth) => {
    for (const n of list) {
      if (!n.children || n === node) continue
      targets.push({ id: `to:${n.id}`, label: '   '.repeat(depth) + n.title })
      walk(n.children, depth + 1)
    }
  }
  walk(bookmarks.tree, 0)
  const chosen = await menu([
    ...(node.url ? [{ id: 'open', label: 'Open' }, '-'] : []),
    { id: 'move', label: 'Move to', items: [{ id: 'to:', label: 'Top Level' }, ...(targets.length ? ['-', ...targets] : [])] },
    { id: 'rename', label: 'Rename' },
    '-',
    { id: 'remove', label: 'Remove' }
  ])
  if (!chosen) return
  if (chosen === 'open') { close(); ctx.openURL(node.url) }
  if (chosen.startsWith('to:')) bookmarks.move(node.id, chosen.slice(3) || null)
  if (chosen === 'rename') panel.renaming = node.id
  if (chosen === 'remove') bookmarks.remove(node.id)
  ctx.bookmarksChanged()
  paint()
}

export function bookmarksPlate () {
  const parts = []
  if (panel.renaming) {
    const node = bookmarks.find(panel.renaming)?.node
    if (node) {
      const input = h('input', 'plain-field')
      input.value = node.title
      input.autofocus = true
      input.style.width = '260px'
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { bookmarks.rename(node.id, input.value); panel.renaming = null; ctx.bookmarksChanged(); paint() }
        if (e.key === 'Escape') { e.stopPropagation(); panel.renaming = null; paint() }
      })
      parts.push(card(line('Rename', node.title, input)))
    }
  }
  if (!bookmarks.tree.length) parts.push(nothing('Nothing kept yet. Add this page with Ctrl+Shift+B, or bring yours in below.'))
  else {
    const list = h('div', 'list bookmarks')
    const box = h('div', 'card')
    const rows = h('div', 'outline-list')
    outline(bookmarks.tree, 0, rows)
    box.append(rows)
    list.append(box)
    parts.push(list)
  }
  const count = bookmarks.count
  return titled('Bookmarks', 600, parts, [
    panel.sources.length && h('span', 'foot-note', 'Bring in from'),
    ...panel.sources.map(name => action(name, async () => {
      const tree = await L.importBookmarks(name)
      bookmarks.take(name, tree)
      ctx.bookmarksChanged()
      toast(`Bookmarks from ${name} brought in`)
      paint()
    })),
    h('span', 'spacer'),
    h('span', 'foot-note', count === 1 ? '1 bookmark' : `${count} bookmarks`)
  ])
}
