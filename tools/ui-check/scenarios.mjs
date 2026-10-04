// What the UI check asserts, one function per scenario. Each gets a fresh profile from seed.mjs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { connect, sleep } from './cdp.mjs'
import { pageScenarios, waitFor } from './pages.mjs'
import { addressScenarios } from './addresses.mjs'
import { paintScenarios } from './paint.mjs'
import { passwordScenarios } from './passwords.mjs'

const readJSON = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))
const titles = (c, filter) => c.js(`const { tabs } = await import('./state.js'); return tabs.filter(t => ${filter}).map(t => t.title)`)

async function essentials ({ c, dir, shot }) {
  const tiles = '#side .pins .pin'
  await carry(c, rowOf('Wikipedia'), 'document.querySelector("#side .pins")', () => shot?.('free-tile'))
  await sleep(500)
  assert.equal(await c.js(`return document.querySelectorAll('${tiles}').length`), 1, 'carried up onto the empty grid, one tile')
  assert.equal(await c.js('return document.querySelectorAll("#side .pinned .row").length'), 2, 'the two pins as rows')
  assert.equal(await c.js('return !document.querySelector("#side .divider").hidden'), true, 'the line shows')
  await carry(c, rowOf('A page'), `document.querySelector('${tiles}')`)
  await sleep(500)
  assert.deepEqual(await titles(c, 't.essential'), ['Wikipedia', 'A page with a rather long title that should fade out'], 'carried onto a tile, a second one after it')
  await carry(c, `document.querySelectorAll('${tiles}')[1]`, `document.querySelectorAll('${tiles}')[0]`)
  await sleep(500)
  assert.deepEqual(await titles(c, 't.essential'), ['A page with a rather long title that should fade out', 'Wikipedia'], 'the second tile carried onto the first takes its place')
  await c.js(`const { tabs } = await import('./state.js'); const { removeEssential } = await import('./tabs/groups/essentials.js')
    removeEssential(tabs.find(t => t.title.startsWith('A page')))`)
  await sleep(300)
  await c.js('const { enter } = await import(\'./tabs/spaces.js\'); await enter(\'work\')')
  await sleep(300)
  assert.deepEqual(await titles(c, 't.essential'), ['Wikipedia'], 'the essential came along to Work')
  assert.deepEqual(await titles(c, '!t.essential'), ['Notes'], 'Work kept its own tabs')
  await c.js('const { enter } = await import(\'./tabs/spaces.js\'); await enter(\'personal\')')
  await sleep(1600)
  assert.deepEqual(readJSON(dir, 'essentials').map(e => e.title), ['Wikipedia'], 'essentials.json holds it')
  assert.ok(!readJSON(dir, 'session').tabs.some(e => e.title === 'Wikipedia'), 'the space session does not')
  assert.ok(!readJSON(dir, 'session-work').tabs.some(e => e.title === 'Wikipedia'), 'nor does Work\'s')
  await c.js(`const { tabs } = await import('./state.js'); const { removeEssential } = await import('./tabs/groups/essentials.js')
    removeEssential(tabs.find(t => t.title === 'Wikipedia'))`)
  await sleep(1600)
  assert.deepEqual(readJSON(dir, 'essentials'), [], 'removed from essentials.json')
  assert.ok(readJSON(dir, 'session').tabs.some(e => e.title === 'Wikipedia'), 'back in the space as a tab')
}

async function archiving ({ c, dir, shot }) {
  await sleep(1500)
  assert.deepEqual(await titles(c, 'true'), ['Mail', 'Calendar', 'Docs', 'Notes', 'Wikipedia'], 'the idle loose tab left; pinned and folder tabs stayed')
  assert.deepEqual(readJSON(dir, 'archive').map(e => e.title), ['A page with a rather long title that should fade out'], 'archive.json holds it')
  await c.js('const { actions } = await import(\'./keys.js\'); actions.archive()')
  await sleep(500)
  await shot?.('panel')
  await c.js('document.querySelector("#panel .entry").click()')
  await sleep(1600)
  assert.ok((await titles(c, 'true')).some(t => t.startsWith('A page')), 'opened again from the panel')
  assert.deepEqual(readJSON(dir, 'archive'), [], 'and out of the archive')
  await c.js(`const { actions } = await import('./keys.js'); actions.settings()
    await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.rail-row')].find(b => b.textContent === 'Tabs').click()`)
  await sleep(500)
  await shot?.('settings')
}

async function media ({ c, base, shot }) {
  await c.js(`const { open } = await import('./tabs/tabs.js'); open('${base}/tone.html', true)`)
  await waitFor(c, 'const { current } = await import(\'./state.js\'); return current().ready && current().title === \'Tone\'', 'the tone page')
  await c.js('const { current } = await import(\'./state.js\'); await current().web.executeJavaScript(\'document.querySelector("audio").play()\', true)')
  await waitFor(c, 'const { current } = await import(\'./state.js\'); return current().audible', 'the tab to be heard')
  assert.equal(await c.js('return document.querySelector("#side .media").hidden'), true, 'no bar while the playing tab is on screen')
  await c.js('const { tabs } = await import(\'./state.js\'); const { select } = await import(\'./tabs/tabs.js\'); select(tabs.find(t => t.title === \'Wikipedia\').id)')
  await sleep(400)
  assert.equal(await c.js('const b = document.querySelector("#side .media"); return !b.hidden && b.querySelector(".title").textContent'), 'Tone', 'the bar names the playing tab')
  await shot?.('playing')
  await c.js('document.querySelector("#side .media [data-act=play]").click()')
  await waitFor(c, 'const { tabs } = await import(\'./state.js\'); return !tabs.find(t => t.title === \'Tone\').audible', 'play/pause to pause it')
  await sleep(200)
  assert.equal(await c.js('return document.querySelector("#side .media [data-act=play]").title'), 'Play', 'the button now plays')
  await c.js('document.querySelector("#side .media [data-act=go]").click()')
  await sleep(400)
  assert.equal(await c.js('const { current } = await import(\'./state.js\'); return current().title'), 'Tone', 'the bar leads back to the tab')
  assert.equal(await c.js('return document.querySelector("#side .media").hidden'), true, 'and hides there')
}

const center = (c, selector) => c.js(`const r = ${selector}.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`)
const rowOf = title => `[...document.querySelectorAll('#side .rows .row')].find(r => r.textContent.includes('${title}'))`

// `held` runs before the release, while the carried thing is still over its target.
async function carry (c, from, to, held) {
  const [x0, y0] = await center(c, from)
  const [x1, y1] = await center(c, to)
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 12; i++) {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / 12, y: y0 + (y1 - y0) * i / 12, button: 'left', buttons: 1 })
    await sleep(16)
  }
  await held?.()
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 })
}

const loadsShown = c => c.js('return [...document.querySelectorAll(".loads-door")].map(b => !b.hidden)')

// The right-click menu on the empty strip turns the downloads door off and on, in the strip and the sidebar alike.
async function downloadsDoor ({ c, dir }) {
  assert.deepEqual(await loadsShown(c), [true, true], 'the downloads door is there before anything downloads')
  const flip = async () => {
    await c.js('document.querySelector("#strip .drag").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 600, clientY: 20 }))')
    await sleep(300)
    await c.js('[...document.querySelectorAll(".menu-row")].find(r => r.textContent.includes("Show Downloads Button")).click()')
    await sleep(1600)
  }
  await flip()
  assert.deepEqual(await loadsShown(c), [false, false], 'turned off in the strip and the sidebar alike')
  assert.equal(readJSON(dir, 'settings')['downloads.door'], false, 'settings.json remembers it')
  await flip()
  assert.deepEqual(await loadsShown(c), [true, true], 'and on again')
}

async function folderChips ({ c, shot }) {
  const chip = 'document.querySelector("#strip .folder-chip")'
  assert.equal(await c.js(`return ${chip}?.querySelector('.name').textContent`), 'Work', 'the folder has a chip in the strip')
  await c.js(`${chip}.click()`)
  await sleep(500)
  assert.equal(await c.js('return document.querySelectorAll("#strip .tab.folded-away").length'), 2, 'folded, its two tabs tuck away')
  assert.equal(await c.js(`return ${chip}.querySelector('.count').textContent`), '2', 'and the chip counts them')
  await shot?.('folded')
  await c.js(`${chip}.click()`)
  await sleep(500)
  assert.equal(await c.js('return document.querySelectorAll("#strip .tab.folded-away").length'), 0, 'unfolded again')
}

async function folders ({ c, dir }) {
  await carry(c, rowOf('Wikipedia'), 'document.querySelector("#side .folder-row")')
  await sleep(500)
  assert.deepEqual(await titles(c, 't.folder === \'f1\''), ['Docs', 'Notes', 'Wikipedia'], 'dropped on the folder, the tab went in')
  await c.js(`const { setPref, tabs } = await import('./state.js'); const { select } = await import('./tabs/tabs.js'); setPref('folders.fold', true)
    select(tabs.find(t => t.title === 'Docs').id); select(tabs.find(t => t.title.startsWith('A page')).id)`)
  await sleep(300)
  assert.equal(await c.js('const { S } = await import(\'./state.js\'); return S.folders[0].open'), false, 'leaving it folded the folder')
  await c.js('document.querySelector("#side .folder-row").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 60, clientY: 150 }))')
  await sleep(300)
  for (let i = 0; i < 4; i++) await c.key('ArrowDown', 'ArrowDown', 40)
  await c.key('Enter', 'Enter', 13)
  await sleep(1600)
  assert.deepEqual(await c.js('const { S, spaces } = await import(\'./state.js\'); return [spaces.find(s => s.id === S.space).name, S.folders.length]'), ['Work', 0], 'Turn into a Space: in a space named after it')
  assert.deepEqual(await titles(c, '!t.essential'), ['Docs', 'Notes', 'Wikipedia'], 'with its tabs')
  const personal = readJSON(dir, 'session').tabs.map(e => e.title)
  assert.ok(!personal.includes('Docs') && personal.includes('Mail'), 'and they left Personal')
}

const paneWidths = c => c.js('return [...document.querySelectorAll("#stage webview:not(.hidden)")].map(w => Math.round(w.getBoundingClientRect().width))')

async function split ({ c, shot }) {
  await c.js(`const { tabs } = await import('./state.js'); const { splitWith } = await import('./tabs/groups/split.js')
    splitWith(tabs.find(t => t.title === 'Wikipedia'), tabs.find(t => t.title.startsWith('A page')))`)
  await sleep(1200)
  const [a, b] = await paneWidths(c)
  assert.ok(Math.abs(a - b) <= 1 && a > 400, `two panes of half the stage each (${a}, ${b})`)
  assert.equal(await c.js('const g = document.querySelectorAll("#side .split-ground"); return g.length === 1 && Math.round(g[0].getBoundingClientRect().height)'), 58, 'one ground under the two rows')
  assert.ok(await c.js(`const g = document.querySelector('#side .split-ground').getBoundingClientRect(); const i = document.querySelector('#side .split-mark svg')?.getBoundingClientRect()
    return !!i && Math.abs((i.top + i.height / 2) - (g.top + g.height / 2)) <= 1 && i.left >= g.left`), 'the split icon sits at the ground\'s left, centred over both rows')
  await shot?.('half')
  await carry(c, 'document.querySelector(".split-edge")', '({ getBoundingClientRect: () => { const r = document.querySelector("#stage").getBoundingClientRect(); return { left: r.left + r.width * 0.3, top: r.top + r.height / 2, width: 0, height: 0 } } })')
  await sleep(300)
  const [a2, b2] = await paneWidths(c)
  assert.ok(a2 < b2 * 0.5, `the divider moved the split to about 30/70 (${a2}, ${b2})`)
  await shot?.('dragged')
  await c.js('const { tabs } = await import(\'./state.js\'); const { select } = await import(\'./tabs/tabs.js\'); select(tabs.find(t => t.title === \'Notes\').id)')
  await sleep(400)
  assert.equal((await paneWidths(c)).length, 1, 'another tab shows alone')
  await c.js('const { tabs } = await import(\'./state.js\'); const { closeTab } = await import(\'./tabs/tabs.js\'); closeTab(tabs.find(t => t.title.startsWith(\'A page\')).id)')
  await sleep(300)
  assert.equal(await c.js('const { tabs } = await import(\'./state.js\'); return tabs.find(t => t.title === \'Wikipedia\').split'), null, 'closing a pane frees its partner')
  assert.equal(await c.js('return document.querySelectorAll("#side .split-ground").length'), 0, 'and the ground goes with the pair')
}

// A split saved in the session comes back as one, both pages on screen; separating and splitting again are saved.
async function splitSession ({ c, dir, base }) {
  const pair = 'const { tabs } = await import(\'./state.js\'); const w = tabs.find(t => t.title === \'Wikipedia\'); const l = tabs.find(t => t.title.startsWith(\'A page\'))'
  await waitFor(c, `${pair}; return w.split === l.id && l.split === w.id && w.ready && l.ready`, 'the saved pair back as a split, both pages loaded')
  for (const page of ['wikipedia', 'long']) {
    const p = await connect(c.port, url => url === `${base}/${page}.html`, ['page', 'webview'])
    await waitFor(p, 'return document.visibilityState === \'visible\'', `the ${page} page on screen`)
    p.close()
  }
  const saved = () => readJSON(dir, 'session').tabs.map(e => e.split ?? null)
  await c.js(`${pair}; const { unpair } = await import('./tabs/groups/split.js'); unpair(w)`)
  await sleep(1600)
  assert.deepEqual(saved(), [null, null, null, null, null, null], 'separated, the session holds no split')
  await c.js(`${pair}; const { splitWith } = await import('./tabs/groups/split.js'); splitWith(w, l)`)
  await sleep(1600)
  assert.deepEqual(saved(), [null, null, null, null, 5, 4], 'split again, each names the other')
}

async function welcomeTurn ({ c, shot }) {
  await c.js('const { actions } = await import(\'./keys.js\'); actions.welcome()')
  await sleep(1000)
  // Samples the mark's turn every frame from the first press on, while the mark is on the page; a second
  // press comes mid-turn.
  await c.js(`window.__turn = []; const mark = document.querySelector('.w-mark'); const t0 = performance.now()
    const tick = () => {
      const running = mark.getAnimations().some(x => x.effect.getKeyframes().some(k => k.rotate))
      if (mark.isConnected) window.__turn.push([running, getComputedStyle(mark).rotate])
      if (performance.now() - t0 < 1400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick); document.querySelector('#welcome .action.primary').click()`)
  await sleep(300)
  await shot?.('turning')
  await c.js('document.querySelector(\'#welcome .action.primary\').click()')
  await sleep(1300)
  const frames = await c.js('return window.__turn')
  const turning = frames.filter(([running]) => running).map(([, r]) => parseFloat(r) || 0)
  assert.ok(turning.length >= 10, `the turn ran for several frames (${turning.length})`)
  assert.ok(turning.every((r, i) => i === 0 || r >= turning[i - 1] - 0.01), 'the mark only ever turns forward')
  assert.ok(turning.at(-1) > 300, `it nearly completes the turn while sampled (${turning.at(-1)})`)
  const after = frames.slice(frames.findLastIndex(([running]) => running) + 1)
  assert.ok(after.length > 0 && after.every(([, r]) => r === 'none'), `then it rests exactly where it began (${after.map(x => x[1]).join(', ')})`)
  assert.equal(await c.js('return [...document.querySelectorAll("#welcome .rail-row")].findIndex(i => i.classList.contains("on"))'), 1, 'the second press during the turn did not skip a page')
}

async function foldGlide ({ c }) {
  // The card's left edge, every frame from folding the sidebar away until it rests.
  const lefts = await c.js(`const st = document.querySelector('#stage'); const out = []; const { actions } = await import('./keys.js')
    actions.fold()
    await new Promise(done => { const t0 = performance.now(); const tick = () => { out.push(st.getBoundingClientRect().left); performance.now() - t0 < 900 ? requestAnimationFrame(tick) : done() }; requestAnimationFrame(tick) })
    return out`)
  const between = lefts.filter(x => x > 9 && x < 231)
  assert.ok(between.length >= 3, `the card glides through in-between places (${lefts.map(Math.round).join(' ')})`)
  assert.equal(Math.round(lefts.at(-1)), 8, 'and rests at the window\'s edge')
}

async function folderFromMenu ({ c }) {
  await c.js(`${rowOf('Wikipedia')}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 200 }))`)
  await sleep(300)
  await c.js('[...document.querySelectorAll(".menu .menu-row")].find(r => r.textContent === "New Folder with Tab").click()')
  await sleep(300)
  await c.send('Input.insertText', { text: 'Reading' })
  await c.key('Enter', 'Enter', 13)
  await sleep(500)
  assert.deepEqual(await c.js(`const { S, tabs } = await import('./state.js'); const f = S.folders.find(x => x.name === 'Reading'); return f && tabs.filter(t => t.folder === f.id).map(t => t.title)`), ['Wikipedia'], 'a right-click made a folder named Reading holding the tab')
}

const click = async (c, selector) => {
  const [x, y] = await center(c, selector)
  for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
}

async function clearTabs ({ c, dir, shot }) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 300 })
  await sleep(300)
  await shot?.('hovered')
  await click(c, 'document.querySelector("#side .quiet .clear")')
  await sleep(1600)
  assert.deepEqual(await titles(c, 't.pin'), ['Mail', 'Calendar'], 'the pinned tabs stayed')
  assert.deepEqual(await c.js('const { tabs, blank, S } = await import(\'./state.js\'); return [tabs.filter(t => !t.pin).map(t => blank(t)), S.folders.length]'), [[true], 0], 'every other tab and the folder went; one new tab is left')
  assert.deepEqual(readJSON(dir, 'archive').map(e => e.title).sort(), ['A page with a rather long title that should fade out', 'Docs', 'Notes', 'Wikipedia'], 'into the archive')
  assert.equal(await c.js('const { blank, current } = await import(\'./state.js\'); return blank(current())'), true, 'the new tab is on screen')
  assert.equal(await c.js('return document.querySelector("#side .quiet .clear").hidden'), true, 'nothing left to clear, no button')
}

async function tabAddress ({ c, base, shot }) {
  await c.js(`const { setPref } = await import('./state.js'); setPref('search.engine', 'custom'); setPref('search.custom', '${base}/notes.html?q=%s')`)
  await click(c, rowOf('Wikipedia'))
  await sleep(300)
  assert.equal(await c.js('return document.activeElement?.className'), 'tab-field', 'a click on the tab on screen opens its address')
  await c.send('Input.insertText', { text: 'typed' })
  await c.key('Enter', 'Enter', 13)
  // Loaded, not only asked for: in Electron a page that commits takes focus back from the field (known gap).
  await waitFor(c, `const { current } = await import('./state.js'); return current().url === '${base}/notes.html?q=typed' && current().ready && !current().loading`, 'Enter to search what was typed')
  await click(c, 'document.querySelector("#side .rows .row.live")')
  await sleep(300)
  await c.send('Input.insertText', { text: 'leech' })
  await sleep(300)
  const keys = await c.js('return [...document.querySelectorAll(".site-card.offering .offer")].map(o => (o.querySelector(".glass") ? "search:" : "") + o.querySelector(".key").textContent)')
  assert.ok(keys.includes('search:leech'), `typing turns the card into suggestions with a search (${keys.join(', ')})`)
  await shot?.('offering')
  for (let i = 0; i <= keys.indexOf('search:leech'); i++) await c.key('ArrowDown', 'ArrowDown', 40)
  assert.equal(await c.js('return document.querySelector(".site-card .offer.picked .key")?.textContent'), 'leech', 'the arrows pick the search')
  await c.key('Enter', 'Enter', 13)
  await waitFor(c, `const { current } = await import('./state.js'); return current().url === '${base}/notes.html?q=leech'`, 'the tab to search')
  assert.equal(await c.js('return !!document.querySelector(".site-card")'), false, 'and the card is gone')
}

// A link wrapped over lines (copied from a terminal) and pasted for real goes there, in a tab's address and in the
// address field, not to the search engine.
async function pasteWrapped ({ c, base, press, pointer }) {
  await c.js(`const { setPref } = await import('./state.js'); setPref('search.engine', 'custom'); setPref('search.custom', '${base}/notes.html?q=%s')`)
  const link = `${base}/docs.html?from=paste&x=1`
  await c.js(`const { L } = await import('./state.js'); L.copy(${JSON.stringify(link.replace('?', '?\n  '))})`)
  const opened = what => waitFor(c, `const { current } = await import('./state.js'); return current().url === '${link}'`, what)
  // A real click: keys typed for real reach the UI only once the window system gave it the focus.
  const [x, y] = await center(c, rowOf('Wikipedia'))
  pointer(Math.round(x), Math.round(y), true)
  await sleep(300)
  press('ctrl+v')
  press('Return')
  await opened('the link pasted into the tab to open')
  press('ctrl+t')
  await sleep(500)
  press('ctrl+v')
  press('Return')
  await opened('the link pasted into a new tab to open')
}

// A double click on a tab not on screen opens its address; typing finishes a visited address inline, the finished
// part selected, and Backspace takes it away.
async function tabCompletion ({ c, chromium }) {
  await waitFor(c, 'const { history } = await import(\'./state.js\'); return history.visits.has(\'127.0.0.1/wikipedia.html\')', 'the page on screen to be in the history')
  const [x, y] = await center(c, rowOf('Notes'))
  const press = clickCount => ['mousePressed', 'mouseReleased'].reduce((p, type) => p.then(() => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount })), Promise.resolve())
  if (chromium) {
    await press(1)
    await press(2)
  } else {
    // In Electron the page waking under the field takes focus back as it commits (known gap): click once it is in.
    await press(1)
    await waitFor(c, 'const { current } = await import(\'./state.js\'); return current().title === \'Notes\' && current().ready && !current().loading', 'Notes to load')
    await press(1)
  }
  await sleep(300)
  assert.deepEqual(await c.js('const { current } = await import(\'./state.js\'); return [current().title, document.activeElement?.className]'), ['Notes', 'tab-field'], 'a double click chose the tab and opened its address')
  await c.send('Input.insertText', { text: '127.0.0.1/wi' })
  await sleep(200)
  const field = 'const f = document.querySelector(".tab-field"); return [f.value, f.selectionStart, f.selectionEnd]'
  assert.deepEqual(await c.js(field), ['127.0.0.1/wikipedia.html', 12, 24], 'the visited address is finished, the finished part selected')
  await c.key('Backspace', 'Backspace', 8)
  await sleep(200)
  assert.deepEqual(await c.js(field), ['127.0.0.1/wi', 12, 12], 'Backspace takes the finished part away and finishes nothing')
  await c.key('Escape', 'Escape', 27)
}

// Every page of the first run, walked with the arrow keys, each pictured with --shots.
async function welcomePages ({ c, shot }) {
  await c.js('const { actions } = await import(\'./keys.js\'); actions.welcome()')
  await sleep(900)
  for (let i = 0; i < 5; i++) {
    await shot?.(`page-${i + 1}`)
    assert.equal(await c.js('return [...document.querySelectorAll("#welcome .rail-row")].findIndex(d => d.classList.contains("on"))'), i, `on page ${i + 1}`)
    assert.ok(await c.js('return !!document.querySelector("#welcome .w-stage > .w-page:last-child h1")'), `page ${i + 1} has its title`)
    assert.ok(await c.js('const [r, , b] = getComputedStyle(document.querySelector("#welcome .rail-row.on")).backgroundColor.match(/\\d+/g).map(Number); return b > r + 100'), `page ${i + 1}: the step on screen wears the mark's blue`)
    await c.js('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))')
    await sleep(i === 0 ? 1600 : 700)
  }
}

export const scenarios = {
  ...pageScenarios,
  ...paintScenarios,
  ...addressScenarios,
  ...passwordScenarios,
  'clear-tabs': { chromium: true, run: clearTabs },
  'tab-address': { seed: { look: 'dark' }, chromium: true, run: tabAddress },
  'paste-wrapped': { chromium: 'only', run: pasteWrapped },
  'tab-completion': { chromium: true, run: tabCompletion },
  'folder-from-menu': { chromium: true, run: folderFromMenu },
  'fold-glide': { chromium: true, run: foldGlide },
  'welcome-turn': { chromium: true, run: welcomeTurn },
  'welcome-pages': { chromium: true, run: welcomePages },
  'welcome-pages-dark': { seed: { look: 'dark' }, chromium: true, run: welcomePages },
  split: { run: split },
  'split-session': { chromium: true, seed: { split: ['Wikipedia', 'A'] }, run: splitSession },
  'folder-chips': { seed: { sidebar: false }, chromium: true, run: folderChips },
  folders: { chromium: true, run: folders },
  media: { chromium: true, run: media },
  essentials: { chromium: true, run: essentials },
  'downloads-door': { seed: { sidebar: false }, chromium: true, run: downloadsDoor },
  archiving: { chromium: true, seed: { settings: { archive: true, 'archive.after': 3600 }, idle: ['A', 'Docs', 'Mail'] }, run: archiving }
}
