// UI check scenarios about what happens inside pages: the page script and what rides on it. Both shells.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { connect, sleep } from './cdp.mjs'

const readJSON = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))

export const waitFor = async (c, body, what) => {
  for (let i = 0; i < 40; i++) {
    if (await c.js(body)) return
    await sleep(150)
  }
  assert.fail(`waited 6 s for ${what}`)
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

export const pageScenarios = {
  'page-script': { chromium: true, run: pageScript },
  veil: { chromium: true, run: veil }
}
