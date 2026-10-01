// What the UI check asserts, one function per scenario. Each gets a fresh profile from seed.mjs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sleep } from './cdp.mjs'

const readJSON = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))
const titles = (c, filter) => c.js(`const { tabs } = await import('./state.js'); return tabs.filter(t => ${filter}).map(t => t.title)`)

async function essentials ({ c, dir }) {
  await c.js(`const { tabs } = await import('./state.js'); const { addEssential } = await import('./tabs/groups/essentials.js')
    addEssential(tabs.find(t => t.title === 'Wikipedia'))`)
  await sleep(300)
  assert.equal(await c.js('return document.querySelectorAll("#side .pins .pin").length'), 1, 'one tile in the grid')
  assert.equal(await c.js('return document.querySelectorAll("#side .pinned .row").length'), 2, 'the two pins as rows')
  assert.equal(await c.js('return !document.querySelector("#side .divider").hidden'), true, 'the line shows')
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

const waitFor = async (c, body, what) => {
  for (let i = 0; i < 40; i++) {
    if (await c.js(body)) return
    await sleep(150)
  }
  assert.fail(`waited 6 s for ${what}`)
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

async function carry (c, from, to) {
  const [x0, y0] = await center(c, from)
  const [x1, y1] = await center(c, to)
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 12; i++) {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / 12, y: y0 + (y1 - y0) * i / 12, button: 'left', buttons: 1 })
    await sleep(16)
  }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 })
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
  assert.equal(await c.js('return [...document.querySelectorAll("#welcome .w-dots i")].findIndex(i => i.classList.contains("on"))'), 1, 'the second press during the turn did not skip a page')
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

export const scenarios = {
  'folder-from-menu': { run: folderFromMenu },
  'fold-glide': { run: foldGlide },
  'welcome-turn': { run: welcomeTurn },
  split: { run: split },
  'folder-chips': { seed: { sidebar: false }, run: folderChips },
  folders: { run: folders },
  media: { run: media },
  essentials: { run: essentials },
  archiving: { seed: { settings: { archive: true, 'archive.after': 3600 }, idle: ['A', 'Docs', 'Mail'] }, run: archiving }
}
