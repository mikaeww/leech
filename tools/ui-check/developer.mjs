// Tools for developers: related tabs move under their repository's tab; downloads land in their kind's folder.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { connect, sleep } from './cdp.mjs'
import { waitFor } from './pages.mjs'

const order = c => c.js('const { tabs } = await import(\'./state.js\'); return tabs.filter(t => !t.pin && !t.folder).map(t => t.title || t.url)')
const setIn = (c, title) => c.js(`return [...document.querySelectorAll('#side .rows .row')].find(r => r.textContent.includes(${JSON.stringify(title)}))?.classList.contains('related') ?? null`)

async function related ({ c, base, shot }) {
  const port = new URL(base).port
  const repo = `http://github.com:${port}/mikaeww/leech`
  const question = `http://stackoverflow.com:${port}/titled?t=${encodeURIComponent('How do I build Leech on Arch?')}`
  await c.js(`const { open } = await import('./tabs/tabs.js'); open(${JSON.stringify(repo)}, true)`)
  // github.com is on the HSTS list, so the page fails over https here; its address alone is the topic.
  await waitFor(c, 'return (await import(\'./state.js\')).tabs.some(t => t.url?.includes(\'github.com\') && t.ready)', 'the repository tab')
  // From another tab, so only the name relates the two.
  await c.js(`const { tabs } = await import('./state.js'); const { select, open } = await import('./tabs/tabs.js')
    select(tabs.find(t => t.title === 'Notes').id); open(${JSON.stringify(question)}, true)`)
  await waitFor(c, 'return (await import(\'./state.js\')).tabs.some(t => t.title === \'How do I build Leech on Arch?\')', 'the question has its title')
  await sleep(400)
  const titles = await order(c)
  const at = titles.findIndex(t => t.includes('github.com'))
  assert.equal(titles[at + 1], 'How do I build Leech on Arch?', `the question sits under the repository: ${titles.join(' | ')}`)
  assert.equal(await setIn(c, 'How do I build Leech'), true, 'and is set in')
  assert.equal(await setIn(c, 'Notes'), false, 'an unrelated tab is not')
  await shot?.('related')
  await c.js('const { setPref } = await import(\'./state.js\'); setPref(\'tabs.related\', false); (await import(\'./chrome/render.js\')).render()')
  await sleep(300)
  assert.equal(await setIn(c, 'How do I build Leech'), false, 'turned off, nothing is set in')
}

// Into a folder inside the throwaway profile, never the owner's own downloads folder: Chromium is told before
// it starts (its folder is read-only from the UI), Electron through Leech's setting.
const savedIn = dir => path.join(dir, 'saved')
function downloadsFolder ({ dir, chromium }) {
  fs.mkdirSync(savedIn(dir))
  if (!chromium) return
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: savedIn(dir), prompt_for_download: false } }))
}

async function downloadsSorted ({ c, dir, base, chromium }) {
  const folder = savedIn(chromium ? path.join(dir, '..', '..') : dir)
  await c.js(`const { configure, setPref } = await import('./state.js'); setPref('downloads', ${JSON.stringify(folder)}); setPref('downloads.sort', true); configure()`)
  await sleep(300)
  for (const name of ['photo.png', 'notes.md', 'tool.AppImage', 'mix.mp3']) {
    await c.js(`const { open } = await import('./tabs/tabs.js'); open(${JSON.stringify(`${base}/attachment/${name}`)}, false)`)
  }
  const want = ['Images/photo.png', 'Documents/notes.md', 'Installers/tool.AppImage', 'Other/mix.mp3']
  await waitForFiles(folder, want)
  await c.js('const { configure, setPref } = await import(\'./state.js\'); setPref(\'downloads.sort\', false); configure()')
  await sleep(300)
  await c.js(`const { open } = await import('./tabs/tabs.js'); open(${JSON.stringify(`${base}/attachment/later.png`)}, false)`)
  await waitForFiles(folder, ['later.png'])
}

async function waitForFiles (folder, want) {
  for (let i = 0; i < 60 && !want.every(f => fs.existsSync(path.join(folder, f))); i++) await sleep(150)
  const missing = want.filter(f => !fs.existsSync(path.join(folder, f)))
  assert.deepEqual(missing, [], `saved where their kind goes; the folder holds ${fs.readdirSync(folder, { recursive: true }).join(', ')}`)
}

// The panel shows each download with the folder it really landed in, and the kind folders with what went in.
// Nothing here opens a folder or a file: that would start the desktop's file manager outside the private display.
async function downloadsPanel ({ c, dir, base, chromium, shot }) {
  const folder = savedIn(chromium ? path.join(dir, '..', '..') : dir)
  await c.js(`const { configure, setPref } = await import('./state.js'); setPref('downloads', ${JSON.stringify(folder)}); setPref('downloads.sort', true); configure()`)
  await sleep(300)
  for (const name of ['photo.png', 'notes.md']) {
    await c.js(`const { open } = await import('./tabs/tabs.js'); open(${JSON.stringify(`${base}/attachment/${name}`)}, false)`)
  }
  await waitForFiles(folder, ['Images/photo.png', 'Documents/notes.md'])
  await c.js('(await import(\'./chrome/panels.js\')).panels.open(\'downloads\')')
  await waitFor(c, 'return document.querySelectorAll(\'#panel .entry.download\').length === 2', 'both downloads in the panel')
  const went = await c.js('return Object.fromEntries([...document.querySelectorAll(\'#panel .entry.download\')].map(r => [r.querySelector(\'.name\').textContent, r.querySelector(\'.went\')?.textContent]))')
  assert.deepEqual(went, { 'photo.png': 'Images', 'notes.md': 'Documents' }, 'each says the folder it went into')
  const folders = () => c.js('return [...document.querySelectorAll(\'#panel .site-row.folder\')].map(r => r.querySelector(\'.host\').textContent + \': \' + r.querySelector(\'.extra\').textContent)')
  assert.deepEqual(await folders(), ['saved: Nothing yet', 'Images: 1 file', 'Documents: 1 file', 'Code: Nothing yet', 'Installers: Nothing yet', 'Other: Nothing yet'], 'every kind folder, with what went in')
  await c.js('[...document.querySelectorAll(\'#panel .site-row.folder\')].find(r => r.textContent.startsWith(\'Images\')).click()')
  await waitFor(c, 'return document.querySelector(\'#panel .accounts-of .entry .name\')?.textContent === \'photo.png\'', 'the Images folder opens to its file')
  await sleep(chromium ? 1500 : 300)
  await shot?.('downloads-panel')
  await c.js('document.querySelector(\'#panel .card .switch\').click()')
  await waitFor(c, 'return document.querySelectorAll(\'#panel .site-row.folder\').length === 3', 'sorting off: only the folders something went into')
}

// Each window's page keeps its cookies; a sandbox sees none of the main window's and leaves none behind.
const cookie = (c, set) => c.js(`const { current } = await import('./state.js')
  return current().web.executeJavaScript(${JSON.stringify(set ? `document.cookie = '${set}=1; max-age=3600'; document.cookie` : 'document.cookie')})`)
const isUI = (url, t) => url.startsWith('chrome://leech') && t
async function sandbox ({ c, dir, base, shot }) {
  await c.js('const { tabs } = await import(\'./state.js\'); const { select } = await import(\'./tabs/tabs.js\'); select(tabs.find(t => t.title === \'Notes\').id)')
  await waitFor(c, 'const { current } = await import(\'./state.js\'); return current().ready', 'the Notes page')
  assert.match(await cookie(c, 'main'), /main=1/, 'the main window keeps its cookie')
  await c.js(`window.leech.sandbox(${JSON.stringify(`${base}/docs.html`)})`)
  const box = await connect(c.port, (url, t) => isUI(url, t) && t.id !== c.id)
  await waitFor(box, 'if (!window.leech || !document.querySelector(\'#strip .tab, #side .row\')) return false; const { current } = await import(\'./state.js\'); return current()?.ready && current().title === \'Docs\'', 'the sandbox\'s page')
  assert.equal(await box.js('return document.getElementById(\'app\').classList.contains(\'sandbox\')'), true, 'the window says it is a sandbox')
  assert.deepEqual(await box.js('return (await import(\'./state.js\')).tabs.map(t => t.title)'), ['Docs'], 'with its one page and none of the owner\'s tabs')
  assert.doesNotMatch(await cookie(box, 'inside'), /main=1/, 'the main window\'s cookie isn\'t there')
  // xwd lags about a second behind the screen.
  await sleep(1500)
  await shot?.('sandbox')
  assert.doesNotMatch(await cookie(c), /inside=1/, 'and the sandbox\'s doesn\'t reach the main window')
  await box.js('window.leech.window(\'close\')')
  box.close()
  await sleep(1500)
  // A sandbox writing its session would leave its one Docs tab there.
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')).tabs.length, 6, 'the sandbox wrote nothing over the session')
  await c.js(`window.leech.sandbox(${JSON.stringify(`${base}/docs.html`)})`)
  const again = await connect(c.port, (url, t) => isUI(url, t) && t.id !== c.id)
  await waitFor(again, 'if (!window.leech || !document.querySelector(\'#strip .tab, #side .row\')) return false; const { current } = await import(\'./state.js\'); return current()?.ready', 'a second sandbox')
  assert.doesNotMatch(await cookie(again), /inside=1/, 'a new sandbox starts empty')
  again.close()
}

// The sandbox panel shows the separation: the page's cookies here against the normal window's, and what it holds.
const report = box => box.js('return [...document.querySelectorAll(\'#panel .stat .number\')].map(n => Number(n.textContent))')
async function sandboxPanel ({ c, base, shot }) {
  await c.js('const { tabs } = await import(\'./state.js\'); const { select } = await import(\'./tabs/tabs.js\'); select(tabs.find(t => t.title === \'Notes\').id)')
  await waitFor(c, 'const { current } = await import(\'./state.js\'); return current().ready', 'the Notes page')
  await cookie(c, 'main')
  await c.js(`window.leech.sandbox(${JSON.stringify(`${base}/docs.html`)})`)
  const box = await connect(c.port, (url, t) => isUI(url, t) && t.id !== c.id)
  await waitFor(box, 'if (!window.leech || !document.querySelector(\'#strip .tab, #side .row\')) return false; const { current } = await import(\'./state.js\'); return current()?.ready && current().title === \'Docs\'', 'the sandbox\'s page')
  await box.js('document.querySelector(\'.sandbox-mark\').click()')
  await waitFor(box, 'return document.querySelectorAll(\'#panel .stat\').length === 2', 'the panel compares the cookie jars')
  assert.deepEqual(await report(box), [0, 1], 'none here, the normal window\'s one there')
  assert.match(await box.js('return document.querySelector(\'#panel .list\').textContent'), /Nothing yet/, 'the sandbox holds nothing yet')
  await cookie(box, 'inside')
  await waitFor(box, 'return document.querySelector(\'#panel .stat .number\')?.textContent === \'1\'', 'the panel sees the new cookie')
  assert.deepEqual(await report(box), [1, 1], 'the cookie set here counts here only')
  assert.deepEqual(await box.js('return [...document.querySelectorAll(\'#panel .stat .names\')].map(n => n.textContent)'), ['inside', 'main'], 'each side names its own cookie')
  assert.match(await box.js('return document.querySelector(\'#panel .list\').textContent'), /127\.0\.0\.1|localhost|1 cookie/, 'and the site shows in what the sandbox holds')
  await sleep(1500)
  await shot?.('sandbox-panel')
  box.close()
}

export const developerScenarios = {
  'sandbox-panel': { chromium: 'only', run: sandboxPanel },
  'downloads-panel': { chromium: true, before: downloadsFolder, run: downloadsPanel },
  'downloads-panel-dark': { seed: { look: 'dark' }, chromium: true, before: downloadsFolder, run: downloadsPanel },
  'sandbox-panel-dark': { seed: { look: 'dark' }, chromium: 'only', run: sandboxPanel },
  sandbox: { chromium: 'only', run: sandbox },
  related: { chromium: true, run: related },
  'downloads-sorted': { chromium: true, before: downloadsFolder, run: downloadsSorted }
}
