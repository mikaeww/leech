// Tools for developers: related tabs move under their repository's tab; downloads land in their kind's folder.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
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

// The Dev UI on a page served over http: each tool sees what the page did, and changes reach the page.
const tool = (c, id) => c.js(`document.querySelector('#dev .dev-tabs [data-tool="${id}"]').click()`)
const texts = (c, selector) => c.js(`return [...document.querySelectorAll(${JSON.stringify(selector)})].map(el => el.textContent)`)
const inPage = (c, code) => c.js(`const { current } = await import('./state.js'); return current().web.executeJavaScript(${JSON.stringify(code)})`)
const clickText = (c, selector, text) => c.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})).click()`)

async function devNetwork (c, shot) {
  await tool(c, 'network')
  // The page's own requests came before the column attached: a reload shows them.
  await c.js('const { current } = await import(\'./state.js\'); current().web.reload()')
  await waitFor(c, 'return [...document.querySelectorAll(\'#dev .dev-request\')].some(r => r.textContent.includes(\'/api/users\') && r.querySelector(\'.status\').textContent === \'200\')', 'the page\'s fetch in Network', 10)
  const rows = await c.js('return [...document.querySelectorAll(\'#dev .dev-request\')].map(r => [...r.children].slice(0, 3).map(x => x.textContent).join(\' \'))')
  assert.ok(rows.includes('GET /dev.html 200'), `the document as "GET /dev.html 200": ${rows.join(' | ')}`)
  await clickText(c, '#dev .dev-request', '/api/users')
  await waitFor(c, 'return [...document.querySelectorAll(\'#dev .dev-code\')].some(p => p.textContent.includes(\'"name":"Ada"\'))', 'the response body')
  assert.ok((await texts(c, '#dev .dev-pair .value')).includes('application/json'), 'the response headers')
  await sleep(1200)
  await shot?.('dev-network')
  await clickText(c, '#dev .dev-button', 'Send again')
  await waitFor(c, 'return [...document.querySelectorAll(\'#dev .dev-request\')].filter(r => r.textContent.includes(\'/api/users\')).length === 2', 'the request sent again')
}

async function devConsoleAndElements (c, shot) {
  await tool(c, 'console')
  await waitFor(c, 'return [...document.querySelectorAll(\'#dev .dev-log .text\')].some(t => t.textContent === \'dev page ready {n: 1}\')', 'the page\'s log line')
  await c.js('const p = document.querySelector(\'#dev .dev-prompt\'); p.value = \'6 * 7\'; p.dispatchEvent(new KeyboardEvent(\'keydown\', { key: \'Enter\', bubbles: true }))')
  await waitFor(c, 'return [...document.querySelectorAll(\'#dev .dev-log.result .text\')].some(t => t.textContent === \'42\')', 'the answer under the line typed')
  await tool(c, 'elements')
  await waitFor(c, 'return [...document.querySelectorAll(\'#dev .dev-node\')].some(n => n.textContent.startsWith(\'›<h1\'))', 'the h1 in the tree')
  await clickText(c, '#dev .dev-node', '<h1')
  await waitFor(c, 'return document.querySelector(\'#dev .dev-title\')?.textContent.startsWith(\'<h1>\')', 'the inspector for the h1')
  await c.js('const f = document.querySelector(\'#dev [data-keep="attr-id"]\'); f.value = \'renamed\'; f.dispatchEvent(new Event(\'change\'))')
  for (let i = 0; i < 20 && await inPage(c, 'document.getElementById("renamed")?.tagName') !== 'H1'; i++) await sleep(150)
  assert.equal(await inPage(c, 'document.getElementById("renamed")?.tagName'), 'H1', 'a changed attribute reaches the page')
  await sleep(1200)
  await shot?.('dev-elements')
}

async function devStorageAndSecurity (c, shot) {
  await tool(c, 'storage')
  await waitFor(c, 'return [...document.querySelectorAll(\'#dev .dev-entry .name\')].some(n => n.textContent === \'sessionid\')', 'the page\'s cookie')
  await clickText(c, '#dev .dev-chip', 'Local')
  await waitFor(c, 'return [...document.querySelectorAll(\'#dev .dev-entry\')].some(e => e.textContent === \'themedark\')', 'local storage')
  await tool(c, 'security')
  await clickText(c, '#dev .dev-button', 'Check this page')
  await waitFor(c, 'return document.querySelectorAll(\'#dev .dev-finding\').length > 0', 'the findings')
  const titles = await texts(c, '#dev .dev-finding .title')
  for (const want of ['Served without TLS', 'Password sent without TLS', 'sessionid: readable by script']) assert.ok(titles.includes(want), `"${want}" among: ${titles.join(' | ')}`)
  assert.equal(titles[0] === 'Served without TLS' || titles[0] === 'Password sent without TLS', true, 'worst first')
  await sleep(1200)
  await shot?.('dev-security')
}

// The folder comes through Chromium's chooser, typed into for real; a folder never chosen is refused.
async function devExplorer (c, dir, { press, type }) {
  const project = path.join(dir, 'project')
  fs.mkdirSync(project, { recursive: true })
  fs.writeFileSync(path.join(project, 'index.html'), '<h1>Before</h1>\n')
  assert.equal((await c.js(`return (await window.leech.dev.list(${JSON.stringify(project)}, ''))?.error`)), 'not-chosen', 'a folder not chosen is refused')
  await tool(c, 'explorer')
  await clickText(c, '#dev .dev-button', 'Open folder')
  await sleep(1500)
  press('ctrl+l')
  type(project)
  await sleep(1200)
  // GTK completes the folder with a selected "/" and answers Return in its location field with no file; its
  // Open button (Alt+O) takes the folder typed.
  press('Delete')
  await sleep(300)
  press('alt+o')
  await waitFor(c, 'return [...document.querySelectorAll(\'#dev .dev-file .name\')].some(n => n.textContent === \'index.html\')', 'the chosen folder\'s files', 10)
  await clickText(c, '#dev .dev-file', 'index.html')
  await waitFor(c, 'return document.querySelector(\'#dev .dev-editor\')?.value === \'<h1>Before</h1>\\n\'', 'the file in the editor')
  await c.js('const e = document.querySelector(\'#dev .dev-editor\'); e.value = \'<h1>After</h1>\\n\'; e.dispatchEvent(new Event(\'input\'))')
  await clickText(c, '#dev .dev-button', 'Save')
  for (let i = 0; i < 20 && fs.readFileSync(path.join(project, 'index.html'), 'utf8') !== '<h1>After</h1>\n'; i++) await sleep(150)
  assert.equal(fs.readFileSync(path.join(project, 'index.html'), 'utf8'), '<h1>After</h1>\n', 'saved to disk')
  assert.equal((await c.js(`return (await window.leech.dev.readFile(${JSON.stringify(project)}, '../../Preferences'))?.error`)), 'That is outside the folder.', 'nothing outside it')
}

// The folder chooser is GTK's, which keeps recently used files in the data folder: here the throwaway profile's,
// never the owner's. The owner's fonts are linked in, read only, so the page and the UI draw as they do for them.
function chooserData (dir) {
  const data = path.join(dir, 'xdg-data')
  fs.mkdirSync(data, { recursive: true })
  const fonts = path.join(os.homedir(), '.local', 'share', 'fonts')
  if (fs.existsSync(fonts)) fs.symlinkSync(fonts, path.join(data, 'fonts'))
  return { XDG_DATA_HOME: data }
}

async function devUI ({ c, dir, base, shot, press, type }) {
  await c.js(`const { setPref } = await import('./state.js'); setPref('dev', true); const { open } = await import('./tabs/tabs.js'); open(${JSON.stringify(`${base}/dev.html`)}, true)`)
  await waitFor(c, 'return !!document.querySelector(\'#app.dev #dev:not([hidden])\') && (await import(\'./dev/protocol.js\')).isAttached()', 'the Dev UI attached to the page', 10)
  await devNetwork(c, shot)
  await devConsoleAndElements(c, shot)
  await devStorageAndSecurity(c, shot)
  await devExplorer(c, dir, { press, type })
  await sleep(1200)
  await shot?.('dev-explorer')
}

export const developerScenarios = {
  'dev-ui': { chromium: 'only', env: chooserData, run: devUI },
  'dev-ui-dark': { seed: { look: 'dark' }, chromium: 'only', env: chooserData, run: devUI },
  'sandbox-panel': { chromium: 'only', run: sandboxPanel },
  'downloads-panel': { chromium: true, before: downloadsFolder, run: downloadsPanel },
  'downloads-panel-dark': { seed: { look: 'dark' }, chromium: true, before: downloadsFolder, run: downloadsPanel },
  'sandbox-panel-dark': { seed: { look: 'dark' }, chromium: 'only', run: sandboxPanel },
  sandbox: { chromium: 'only', run: sandbox },
  related: { chromium: true, run: related },
  'downloads-sorted': { chromium: true, before: downloadsFolder, run: downloadsSorted }
}
