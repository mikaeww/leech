// UI check scenarios about what happens inside pages: the page script and what rides on it. Both shells.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { connect, sleep } from './cdp.mjs'

const readJSON = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))

export const waitFor = async (c, body, what, seconds = 6) => {
  for (let i = 0; i < seconds * 1000 / 150; i++) {
    if (await c.js(body)) return
    await sleep(150)
  }
  assert.fail(`waited ${seconds} s for ${what}`)
}

/** Opens `path` in a new tab on screen and connects to the page itself, for input the page sees as real. */
export async function openPage (c, base, path, title) {
  await c.js(`const { open } = await import('./tabs/tabs.js'); open('${base}${path}', true)`)
  await waitFor(c, `const { current } = await import('./state.js'); return current().ready && current().title === '${title}'`, `the ${title} page`)
  return connect(c.port, url => url === `${base}${path}`, ['page', 'webview'])
}

/** A real click on an element of the page, sent to the page itself: it focuses the page and the element. */
export async function clickIn (page, selector) {
  const [x, y] = await page.js(`const r = document.querySelector('${selector}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`)
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
}

const onScreen = body => `const { current } = await import('./state.js'); const t = current(); ${body}`

async function pageScript ({ c, base }) {
  const page = await openPage(c, base, '/form.html', 'Form')
  assert.equal(await page.js('return typeof globalThis.leechHost'), 'undefined', 'the page\'s own scripts never see the page script')
  await page.js('scrollTo(0, document.body.scrollHeight)')
  await waitFor(c, onScreen('return t.reading > 0.9'), 'the reading progress to follow the scroll')
  const unsaved = onScreen('const { hasUnsaved } = await import(\'./tabs/sleep.js\'); return hasUnsaved(t)')
  assert.equal(await c.js(unsaved), false, 'nothing typed: the page says so (and so it hears the question)')
  await page.js('scrollTo(0, 0)')
  await clickIn(page, '#box')
  await page.send('Input.insertText', { text: 'hello' })
  await sleep(200)
  assert.equal(await page.js('return document.querySelector("#box").value'), 'hello', 'the box took the typing')
  assert.equal(await c.js(unsaved), true, 'typed and not sent: the page holds input')
  page.close()
}

const shown = (page, selector) => page.js(`return getComputedStyle(document.querySelector('${selector}')).display !== 'none'`)

async function veil ({ c, base, dir, press }) {
  let page = await openPage(c, base, '/ads.html', 'Ads')
  assert.equal(await shown(page, 'ins.adsbygoogle'), false, 'the shield hides the ad slot')
  await c.js('const { actions } = await import(\'./keys.js\'); actions.veil()')
  await sleep(200)
  await clickIn(page, '#box')
  await sleep(500)
  assert.equal(await shown(page, '#box'), false, 'the picked box is gone')
  assert.deepEqual(readJSON(dir, 'hidden'), await c.js('const { hidden } = await import(\'./state.js\'); return hidden.map'), 'hidden.json holds the rule')
  assert.equal(readJSON(dir, 'hidden')['127.0.0.1'][0].selector, '#box', 'by its id')
  await c.js('const { actions } = await import(\'./keys.js\'); actions.escape()')
  page.close()
  await c.js(onScreen('t.web.reload()'))
  await sleep(1200)
  page = await connect(c.port, url => url === `${base}/ads.html`, ['page', 'webview'])
  assert.equal(await shown(page, '#box'), false, 'after a reload it is still gone, before the UI hears of the page')
  // Ctrl+Z while picking, typed for real (CDP keys skip the browser's shortcuts): the UI's undo, not the page's.
  await c.js('const { actions } = await import(\'./keys.js\'); actions.veil()')
  await sleep(200)
  press('ctrl+z')
  await sleep(300)
  assert.equal(await shown(page, '#box'), true, 'Ctrl+Z while picking brings it back in the open page')
  await sleep(1300)
  assert.deepEqual(readJSON(dir, 'hidden'), {}, 'and out of hidden.json')
  page.close()
}

const byTitle = title => `const { tabs } = await import('./state.js'); const t = tabs.find(x => x.title === '${title}');`

async function typeInto (c, base, path, title) {
  const page = await openPage(c, base, path, title)
  await clickIn(page, '#box')
  await page.send('Input.insertText', { text: 'not sent' })
  page.close()
}

async function sleeping ({ c, base, chromium }) {
  // A tab with two pages behind each other, and one holding typed input; then another tab on screen.
  await openPage(c, base, '/form.html', 'Form').then(p => p.close())
  await c.js(onScreen(`const { go } = await import('./tabs/views.js'); go(t, '${base}/ads.html')`))
  await waitFor(c, onScreen('return t.ready && t.title === \'Ads\' && t.canBack'), 'the second page in the same tab')
  await typeInto(c, base, '/form.html?typed', 'Form')
  await c.js(`const { tabs } = await import('./state.js'); const { select } = await import('./tabs/tabs.js')
    select(tabs.find(t => t.title === 'Wikipedia').id)
    for (const t of tabs) if (t.title !== 'Wikipedia') t.touched = 0`)
  await waitFor(c, `${byTitle('Ads')} return !t.web`, 'the idle tab to fall asleep (checked every 5 s)', 12)
  await sleep(1500)
  assert.equal(await c.js(`const { tabs } = await import('./state.js'); return !!tabs.find(t => t.url?.endsWith('?typed')).web`), true, 'the tab holding typed input stays awake')
  await c.js(`${byTitle('Ads')} const { select } = await import('./tabs/tabs.js'); select(t.id)`)
  await waitFor(c, onScreen('return t.ready && t.title === \'Ads\''), 'it to wake on the page it slept on')
  if (!chromium) return
  assert.equal(await c.js(onScreen('return t.canBack')), true, 'with its back history (the Chromium build discards in place)')
  await c.js(onScreen('t.web.goBack()'))
  await waitFor(c, onScreen('return t.ready && t.title === \'Form\''), 'Back to lead to the page before')
}

async function clearTyped ({ c, base }) {
  await typeInto(c, base, '/form.html', 'Form')
  await c.js('const { clearTabs } = await import(\'./tabs/archive.js\'); await clearTabs()')
  await sleep(400)
  assert.deepEqual(await c.js('const { tabs, blank } = await import(\'./state.js\'); return tabs.filter(t => !t.pin && !blank(t)).map(t => t.title)'), ['Form'], 'Clear took every other tab and left the one holding typed input')
  assert.match(await c.js('return document.querySelector("#toast")?.textContent || ""'), /stays/, 'and said why')
}

/** A real click at a point of the UI's window: the window's place on the private display is learned once. */
async function clickAt (c, pointer, x, y) {
  if (!c.origin) {
    await c.js('window.__origin = null; addEventListener("mousemove", e => { window.__origin = [e.screenX - e.clientX, e.screenY - e.clientY] }, { once: true, capture: true })')
    // Near the window's left edge is the UI's (the sidebar or the strip), never a page.
    const [sx, sy, h] = await c.js('return [screenX, screenY, innerHeight]')
    pointer(sx + 4, sy + Math.round(h / 2))
    await waitFor(c, 'return !!window.__origin', 'the pointer to reach the window')
    c.origin = await c.js('return window.__origin')
  }
  pointer(Math.round(c.origin[0] + x), Math.round(c.origin[1] + y), true)
}

const peeked = c => c.js('const { peekView } = await import(\'./page/peek.js\'); return !!peekView')

async function peeking ({ c, base, pointer, press, shot }) {
  const page = await openPage(c, base, '/links.html', 'Links')
  const [x, y] = await page.js('const r = document.querySelector("#link").getBoundingClientRect(); return [r.left + 5, r.top + 5]')
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, modifiers: 8 })
  await waitFor(c, 'const { peekView } = await import(\'./page/peek.js\'); return !!peekView', 'shift-click to peek at the link')
  const inside = await connect(c.port, url => url === `${base}/wikipedia.html`, ['page', 'webview'])
  await waitFor(inside, 'return document.title === \'Wikipedia\'', 'the peeked page to load')
  await sleep(400)
  await shot?.('open')
  assert.equal(await c.js(onScreen('return t.url')), `${base}/links.html`, 'the tab stays where it was')
  // A real click in the middle of the frame's hole reaches the peeked page, not the UI or the tab under it.
  await inside.js('window.__clicked = 0; addEventListener("mousedown", () => window.__clicked++, true)')
  await page.js('window.__clicked = 0; addEventListener("mousedown", () => window.__clicked++, true)')
  const [hx, hy] = await c.js('const r = document.querySelector(".peek-page").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]')
  await clickAt(c, pointer, hx, hy)
  await sleep(300)
  assert.deepEqual([await inside.js('return window.__clicked'), await page.js('return window.__clicked')], [1, 0], 'the click went to the peeked page alone')
  inside.close()
  press('Escape')
  await waitFor(c, 'const { peekView } = await import(\'./page/peek.js\'); return !peekView', 'Esc, typed in the peeked page, to close it')
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, modifiers: 8 })
  await waitFor(c, 'const { peekView } = await import(\'./page/peek.js\'); return !!peekView', 'a second peek')
  await sleep(500)
  await c.js('document.querySelectorAll(".peek-doors .knob")[1].click()')
  await waitFor(c, onScreen(`return t.url === '${base}/wikipedia.html' && t.ready`), 'Open as a tab to keep the page as a tab on screen')
  assert.equal(await peeked(c), false, 'and the peek is gone')
  page.close()
}

/** Where the most pixels of one colour sit in the busiest band of rows: a filled button, not a line of text. */
function spot ({ width, height, data }, [r, g, b], band = 24) {
  const rows = new Array(height).fill(null).map(() => [])
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < 24) rows[y].push(x)
    }
  }
  let best = 0
  for (let y = 0; y + band <= height; y++) if (rows.slice(y, y + band).flat().length > rows.slice(best, best + band).flat().length) best = y
  const hits = rows.slice(best, best + band).flatMap((xs, k) => xs.map(x => [x, best + k]))
  if (hits.length < 200) return null
  return [hits.reduce((s, p) => s + p[0], 0) / hits.length, hits.reduce((s, p) => s + p[1], 0) / hits.length]
}

// Chromium's own manager in the Chromium build: its bubble hangs from the stage's top right, saving works and the
// next visit is filled. Electron has Leech's keyring instead.
async function passwords ({ c, base, shot, pointer, pixels }) {
  let page = await openPage(c, base, '/signin.html', 'Sign in')
  await clickIn(page, '#user')
  await page.send('Input.insertText', { text: 'mika' })
  await clickIn(page, '#pass')
  await page.send('Input.insertText', { text: 'hunter22' })
  await clickIn(page, '#go')
  await waitFor(c, onScreen('return t.title === \'Signed in\''), 'the sign-in to go through')
  page.close()
  await sleep(1500)
  await shot?.('asked')
  // Save is Chromium's blue filled button (#0b57d0).
  const save = spot(pixels(), [11, 87, 208])
  assert.ok(save, 'Chromium asks to save the password')
  const [sx, sy] = await c.js('return [screenX, screenY]')
  const stage = await c.js('const r = document.querySelector("#stage").getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]')
  const [x, y] = [save[0] - sx, save[1] - sy]
  assert.ok(x > (stage[0] + stage[2]) / 2 && y < (stage[1] + stage[3]) / 2, `its bubble hangs at the stage's top right (${Math.round(x)}, ${Math.round(y)})`)
  pointer(Math.round(save[0]), Math.round(save[1]), true)
  await sleep(800)
  assert.equal(spot(pixels(), [11, 87, 208]), null, 'Save closes the bubble')
  page = await openPage(c, base, '/signin.html?again', 'Sign in')
  // Chromium hands a filled password to the page's scripts only after a real click on the page.
  await clickIn(page, 'h1')
  await waitFor(page, 'return document.querySelector("#pass").value === \'hunter22\' && document.querySelector("#user").value === \'mika\'', 'the next visit to be filled')
  page.close()
}

async function shielding ({ c, base, shot }) {
  const page = await openPage(c, base, '/shield.html', 'Shield')
  const ad = async () => {
    await waitFor(page, 'return !!document.body.dataset.ad', 'the image to load or be refused')
    return page.js('return document.body.dataset.ad')
  }
  // A changed setting reaches the shell (and Chromium's rules) a moment later; then the page starts again.
  const reloadWith = async settings => {
    await c.js(`const { configure, setPref } = await import('./state.js'); for (const [k, v] of Object.entries(${JSON.stringify(settings)})) setPref(k, v); configure()`)
    await sleep(500)
    await page.js('location.reload()')
    await sleep(300)
  }
  assert.equal(await ad(), 'blocked', 'an ad host loaded by another site is blocked')
  await reloadWith({ 'shield.paused': ['127.0.0.1'] })
  assert.equal(await ad(), 'loaded', 'paused on this site, it loads')
  await reloadWith({ 'shield.paused': [], shield: false })
  assert.equal(await ad(), 'loaded', 'with the shield off, it loads')
  await reloadWith({ shield: true })
  assert.equal(await ad(), 'blocked', 'and on again, it is blocked')
  page.close()
  await c.js(`const { actions } = await import('./keys.js'); actions.settings()
    await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.rail-row')].find(b => b.textContent === 'Privacy').click()`)
  await sleep(400)
  const lines = await c.js('return [...document.querySelectorAll("#panel .line .name, #panel .line .label, #panel .line")].map(l => l.textContent)')
  assert.ok(lines.some(l => l.includes('Block ads and trackers')) && lines.some(l => l.includes('Block on 127.0.0.1')), 'Settings › Privacy has the shield and its switch for this site')
  await shot?.('settings')
}

export const pageScenarios = {
  'page-script': { chromium: true, run: pageScript },
  veil: { chromium: true, run: veil },
  sleep: { chromium: true, seed: { settings: { 'sleep.after': 2 } }, run: sleeping },
  'clear-typed': { chromium: true, run: clearTyped },
  peek: { chromium: true, seed: { settings: { 'links.peek': true } }, run: peeking },
  passwords: { chromium: 'only', run: passwords },
  shield: { chromium: true, run: shielding }
}
