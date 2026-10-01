// UI check scenarios about what happens inside pages: the page script and what rides on it. Both shells.
import assert from 'node:assert/strict'
import { connect, sleep } from './cdp.mjs'

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

export const pageScenarios = {
  'page-script': { chromium: true, run: pageScript }
}
