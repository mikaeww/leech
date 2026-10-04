// Downloads (DownloadsPanel): where files go now, the latest ones with the folder they really landed in, and every
// folder with what went into it. The list is the shell's: Chromium's own in the Chromium build, main's in Electron.
import { esc, h } from '../../elements.js'
import { action, toggle } from '../../look/controls.js'
import { icon } from '../../look/icons.js'
import { foldersOf, landedIn } from '../../places/sorting/landed.js'
import { KINDS, OTHER } from '../../places/sorting/kinds.js'
import { L, prefs } from '../../state.js'
import { ctx, paint, panel, titled } from '../index.js'
import { bytes, caption, card, line, nothing, quick, said } from '../pieces.js'
import { set } from '../settings/index.js'

const LATEST = 5
const root = () => (L.native ? L.info.downloads : prefs.downloads || ctx.downloadsFolder) || ''
const tilde = path => ctx.home && path.startsWith(ctx.home) ? '~' + path.slice(ctx.home.length) : path
const rootName = () => root().split('/').filter(Boolean).pop() || 'Downloads'
const folderName = rel => rel === '' ? rootName() : rel.startsWith('/') ? tilde(rel) : rel
const running = d => d.state === 'running' || d.state === 'paused'
const percent = d => d.total > 0 ? Math.floor(d.received / d.total * 100) : null

function detailOf (d) {
  const from = d.from ? `${d.from} · ` : ''
  if (d.state === 'running') return percent(d) === null ? `${bytes(d.received)} so far · ${d.from}` : `${percent(d)} % of ${bytes(d.total)} · ${d.from}`
  if (d.state === 'paused') return `Paused${percent(d) === null ? '' : ` at ${percent(d)} %`} · ${d.from}`
  if (d.state === 'failed') return `${from}Failed`
  if (d.state === 'cancelled') return `${from}Cancelled`
  if (d.state === 'gone') return `${from}Deleted from disk`
  return `${from}${said(d.date)}${d.total > 0 ? ` · ${bytes(d.total)}` : ''}`
}

function quicksOf (d) {
  if (d.state === 'running') return [quick('Pause', () => L.downloadAction('pause', d.path)), quick('Cancel', () => L.downloadAction('cancel', d.path), true)]
  if (d.state === 'paused') return [quick('Resume', () => L.downloadAction('resume', d.path)), quick('Cancel', () => L.downloadAction('cancel', d.path), true)]
  const show = d.state === 'done' || !d.state ? [quick('Show in Folder', () => L.showFile(d.path))] : []
  return [...show, quick('Remove', () => L.forgetDownload(d.path), true)]
}

// One download; `went` says which folder it landed in, for the latest ones.
function entry (d, went) {
  const done = d.state === 'done' || !d.state
  const row = h('div', 'entry download' + (done ? '' : ' keep') + (d.state === 'gone' || d.state === 'failed' || d.state === 'cancelled' ? ' gone' : ''),
    `<span class="doc">${icon('doc')}</span><div class="words"><div class="name">${esc(d.name)}</div><div class="detail">${esc(detailOf(d))}</div></div>`)
  if (running(d) && percent(d) !== null) {
    const bar = h('div', 'progress')
    bar.style.setProperty('--done', `${percent(d)}%`)
    row.querySelector('.words').append(bar)
  }
  if (went !== undefined) row.append(h('span', 'went', `${icon('folder', 'small')}<span>${esc(folderName(went))}</span>`))
  row.append(...quicksOf(d))
  if (done) row.addEventListener('click', () => L.openFile(d.path))
  return row
}

function smartCard () {
  const kinds = [...KINDS.map(([kind]) => kind), OTHER]
  const detail = prefs['downloads.sort']
    ? `New files go into ${kinds.slice(0, -1).join(', ')} or ${kinds.at(-1)} inside ${tilde(root())}, by their type`
    : `New files land in ${tilde(root())} itself. On, each goes into a folder of its type`
  return card(line('Smart download', detail, toggle(prefs['downloads.sort'], v => { set('downloads.sort', v); paint() })))
}

function latestCard () {
  const latest = panel.loot.slice(0, LATEST)
  if (!latest.length) return nothing('Nothing downloaded yet. Files show here with the folder they went into.')
  return card(...latest.map(d => entry(d, landedIn(d.path, root()))))
}

function folderRow (f) {
  const isOpen = panel.loadsFolder === f.rel && f.items.length > 0
  const count = f.items.length ? `${f.items.length} ${f.items.length === 1 ? 'file' : 'files'}` : 'Nothing yet'
  const row = h('div', 'site-row folder' + (isOpen ? ' open' : '') + (f.items.length ? '' : ' empty'),
    `<span class="doc">${icon('folder')}</span><span class="host">${esc(folderName(f.rel))}</span><span class="extra">${esc(count)}</span>`)
  if (f.items.length) {
    row.append(quick('Open', () => L.openFolder(f.path)), h('span', 'chevron' + (isOpen ? ' open' : ''), icon('forward', 'small')))
    row.addEventListener('click', () => { panel.loadsFolder = isOpen ? null : f.rel; paint() })
  }
  if (!isOpen) return [row]
  const inside = h('div', 'accounts-of')
  inside.append(...f.items.map(d => entry(d)))
  return [row, inside]
}

export function downloadsPlate () {
  const folders = foldersOf(panel.loot, root(), prefs['downloads.sort'])
  const list = h('div', 'list downloads')
  list.append(caption('Latest'), latestCard(), caption('Folders'), card(...folders.flatMap(folderRow)))
  const count = panel.loot.length
  return titled('Downloads', 620, [smartCard(), list], [
    h('span', 'foot-note', count ? 'Clearing the list leaves the files where they are' : `Files land in ${esc(tilde(root()))}`),
    h('span', 'spacer'),
    count && h('span', 'foot-note', count === 1 ? '1 download' : `${count} downloads`),
    panel.loot.some(d => !running(d)) && action('Clear list', () => L.clearDownloads())
  ])
}
