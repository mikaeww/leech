const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

// Bookmarks and history from the other browsers on this machine, and sign-ins from a CSV export.

const home = os.homedir()

const CHROMIUMS = [
  ['Chrome', 'google-chrome'], ['Chromium', 'chromium'], ['Brave', 'BraveSoftware/Brave-Browser'],
  ['Vivaldi', 'vivaldi'], ['Edge', 'microsoft-edge']
]
const GECKOS = [['Zen', '.zen'], ['Firefox', '.mozilla/firefox'], ['LibreWolf', '.librewolf']]

function geckoProfiles (dir) {
  const root = path.join(home, dir)
  let ini
  try { ini = fs.readFileSync(path.join(root, 'profiles.ini'), 'utf8') } catch { return [] }
  const found = []
  for (const block of ini.split(/^\[/m)) {
    const p = /^Path=(.+)$/m.exec(block)?.[1]?.trim()
    if (!p) continue
    const full = /^IsRelative=0$/m.test(block) ? p : path.join(root, p)
    if (fs.existsSync(path.join(full, 'places.sqlite'))) found.push(full)
  }
  // The most used profile first: the one with the biggest history.
  return found.sort((a, b) => fs.statSync(path.join(b, 'places.sqlite')).size - fs.statSync(path.join(a, 'places.sqlite')).size)
}

/** Every browser there is something to bring in from. */
function sources () {
  const list = []
  for (const [name, dir] of CHROMIUMS) {
    const profile = path.join(home, '.config', dir, 'Default')
    if (fs.existsSync(path.join(profile, 'History')) || fs.existsSync(path.join(profile, 'Bookmarks'))) list.push({ name, kind: 'chromium', profile })
  }
  for (const [name, dir] of GECKOS) {
    const profile = geckoProfiles(dir)[0]
    if (profile) list.push({ name, kind: 'gecko', profile })
  }
  return list
}

/** A running browser keeps its SQLite files locked or mid-write: read a copy. */
function withCopy (file, fn) {
  if (!fs.existsSync(file)) return null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leech-import-'))
  const copy = path.join(dir, 'db')
  try {
    fs.copyFileSync(file, copy)
    for (const extra of ['-wal', '-shm']) if (fs.existsSync(file + extra)) fs.copyFileSync(file + extra, copy + extra)
    const db = new DatabaseSync(copy, { readOnly: true })
    try { return fn(db) } finally { db.close() }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const web = url => /^https?:/i.test(url || '')

function bookmarks (source) {
  if (source.kind === 'chromium') {
    const file = path.join(source.profile, 'Bookmarks')
    if (!fs.existsSync(file)) return []
    const roots = JSON.parse(fs.readFileSync(file, 'utf8')).roots
    const take = list => list.flatMap(n => n.type === 'folder'
      ? [{ title: n.name, children: take(n.children || []) }]
      : web(n.url) ? [{ title: n.name, url: n.url }] : [])
    const bar = take(roots.bookmark_bar?.children || [])
    const other = take(roots.other?.children || [])
    const mobile = take(roots.synced?.children || [])
    return [...bar, ...(other.length ? [{ title: 'Other', children: other }] : []), ...(mobile.length ? [{ title: 'Mobile', children: mobile }] : [])]
  }
  return withCopy(path.join(source.profile, 'places.sqlite'), db => {
    const rows = db.prepare(`SELECT b.id, b.parent, b.type, b.title, b.position, p.url
      FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk ORDER BY b.parent, b.position`).all()
    const children = new Map()
    for (const r of rows) {
      if (!children.has(r.parent)) children.set(r.parent, [])
      children.get(r.parent).push(r)
    }
    const take = id => (children.get(id) || []).flatMap(r => r.type === 2
      ? [{ title: r.title || 'Folder', children: take(r.id) }]
      : r.type === 1 && web(r.url) ? [{ title: r.title || r.url, url: r.url }] : [])
    // Gecko's roots: toolbar first, like Chromium's bar, then the menu, then everything else.
    const guid = name => db.prepare('SELECT id FROM moz_bookmarks WHERE guid = ?').get(name)?.id
    const toolbar = take(guid('toolbar_____'))
    const menu = take(guid('menu________'))
    const unfiled = take(guid('unfiled_____'))
    return [...toolbar, ...(menu.length ? [{ title: 'Menu', children: menu }] : []), ...(unfiled.length ? [{ title: 'Other', children: unfiled }] : [])]
  }) || []
}

function history (source) {
  if (source.kind === 'chromium') {
    return withCopy(path.join(source.profile, 'History'), db => db.prepare(
      'SELECT url, title, visit_count AS count, last_visit_time AS last FROM urls WHERE hidden = 0 AND visit_count > 0 ORDER BY last_visit_time DESC LIMIT 3000'
    ).all().filter(r => web(r.url)).map(r => ({ url: r.url, title: r.title || '', count: r.count, last: Number(r.last) / 1e6 - 11644473600 }))) || []
  }
  return withCopy(path.join(source.profile, 'places.sqlite'), db => db.prepare(
    'SELECT url, title, visit_count AS count, last_visit_date AS last FROM moz_places WHERE hidden = 0 AND visit_count > 0 ORDER BY last_visit_date DESC LIMIT 3000'
  ).all().filter(r => web(r.url)).map(r => ({ url: r.url, title: r.title || '', count: r.count, last: Number(r.last || 0) / 1e6 }))) || []
}

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
function parseCSV (text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(Boolean))
}

/** Sign-ins from the CSV that Chrome, Brave, Firefox, Zen and Bitwarden export. */
function csvLogins (text) {
  const [head, ...rows] = parseCSV(text.replace(/^﻿/, ''))
  if (!head) return []
  const names = head.map(h => h.trim().toLowerCase())
  const col = options => names.findIndex(n => options.includes(n))
  const url = col(['url', 'login_uri', 'website', 'site', 'origin'])
  const user = col(['username', 'login_username', 'user', 'email'])
  const pass = col(['password', 'login_password'])
  if (url < 0 || pass < 0) return []
  return rows.map(r => ({ host: r[url] || '', user: user >= 0 ? r[user] || '' : '', password: r[pass] || '' }))
    .filter(l => l.host && l.password)
}

module.exports = { sources, bookmarks, history, csvLogins, parseCSV }
