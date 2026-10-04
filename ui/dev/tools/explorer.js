// Explorer: a folder on disk chosen in Chromium's own chooser, as a tree, and a file of it in an editor that
// saves back (Ctrl+S), optionally reloading the page. Leech's C++ lets it touch nothing outside that folder,
// and only folders chosen since the browser started.
import { esc, h } from '../../elements.js'
import { L, prefs, setPref } from '../../state.js'
import { reload } from '../../tabs/tabs.js'
import { redraw } from '../column.js'
import { bar, button, empty, scroller } from '../rows.js'

const view = { root: prefs['dev.folder'] || '', listed: new Map(), open: new Set(), file: null, text: '', saved: '', note: '', chosen: false, probed: false }
const nameOf = path => path.split('/').filter(Boolean).pop() || path

async function choose () {
  const folder = await L.dev.chooseFolder(view.root)
  if (!folder) return
  Object.assign(view, { root: folder, listed: new Map(), open: new Set(), file: null, note: '', chosen: true })
  setPref('dev.folder', folder)
  list('')
}

async function list (rel) {
  const entries = await L.dev.list(view.root, rel)
  if (entries?.error === 'not-chosen') { view.chosen = false; return redraw('explorer') }
  view.chosen = true
  view.listed.set(rel, entries?.error ? { error: entries.error } : entries.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name)))
  redraw('explorer')
}

async function openFile (rel) {
  if (view.file && view.text !== view.saved && !(await L.confirm(`Leave ${nameOf(view.file)} without saving?`, 'Its changes are lost.'))) return
  const got = await L.dev.readFile(view.root, rel)
  if (got?.error) { view.note = `${rel}: ${got.error}`; return redraw('explorer') }
  Object.assign(view, { file: rel, text: got.text, saved: got.text, note: '' })
  redraw('explorer')
}

async function save (andReload = false) {
  if (!view.file) return
  const result = await L.dev.writeFile(view.root, view.file, view.text)
  if (result?.error) view.note = result.error
  else { view.saved = view.text; view.note = `Saved ${new Date().toLocaleTimeString()}` }
  redraw('explorer')
  if (!result?.error && andReload) reload(false)
}

function rowsOf (rel, depth, out) {
  const listed = view.listed.get(rel)
  if (!listed) return out
  if (listed.error) { out.push(h('div', 'dev-note', esc(listed.error))); return out }
  for (const e of listed) {
    const path = rel ? `${rel}/${e.name}` : e.name
    const isOpen = view.open.has(path)
    const row = h('button', 'dev-file' + (e.dir ? ' dir' : '') + (view.file === path ? ' chosen' : '') + (e.name.startsWith('.') ? ' dot' : ''),
      `<span class="chevron${e.dir ? (isOpen ? ' open' : '') : ' none'}">›</span><span class="name">${esc(e.name)}</span>`)
    row.style.setProperty('--depth', depth)
    row.addEventListener('click', () => {
      if (!e.dir) return openFile(path)
      if (isOpen) view.open.delete(path)
      else { view.open.add(path); if (!view.listed.has(path)) list(path) }
      redraw('explorer')
    })
    out.push(row)
    if (e.dir && isOpen) rowsOf(path, depth + 1, out)
  }
  return out
}

function editor () {
  const area = h('textarea', 'dev-code dev-editor')
  area.value = view.text
  area.spellcheck = false
  area.dataset.keep = `file-${view.file}`
  area.addEventListener('input', () => {
    const was = view.text === view.saved
    view.text = area.value
    if (was !== (view.text === view.saved)) redraw('explorer')
  })
  area.addEventListener('keydown', e => {
    if (e.key === 's' && e.ctrlKey) { e.preventDefault(); save() }
    // Tab indents in the editor rather than leaving it.
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end'); area.dispatchEvent(new Event('input')) }
  })
  const dirty = view.text !== view.saved
  return [bar(h('span', 'dev-title', esc(view.file + (dirty ? ' · changed' : ''))), h('span', 'dev-spacer'), view.note && h('span', 'dev-note', esc(view.note)),
    button('Save and reload page', () => save(true)), button('Save', () => save(), dirty)), area]
}

function draw () {
  if (!view.root) return [empty('Open a folder to browse and change its files here, beside the page they make.'), bar(button('Open folder…', choose, true))]
  if (!view.chosen) {
    // Once: a folder kept from before is tried, and the answer says whether it was chosen since the start.
    if (!view.probed) { view.probed = true; list('') }
    return [empty(`Leech opens only folders chosen since it started. Choose ${nameOf(view.root)} again to go on.`), bar(button(`Open ${nameOf(view.root)}…`, choose, true))]
  }
  const top = bar(h('span', 'dev-title', esc(nameOf(view.root))), h('span', 'dev-note', esc(view.root)), h('span', 'dev-spacer'), button('Change…', choose))
  const tree = scroller('explorer-tree', ...rowsOf('', 0, []))
  tree.classList.add('dev-tree', view.file ? 'short' : 'tall')
  return [top, tree, ...(view.file ? editor() : [view.note ? h('div', 'dev-note', esc(view.note)) : empty('Choose a file to change it.')])]
}

export const explorerTool = { id: 'explorer', label: 'Explorer', draw }
