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

export const scenarios = {
  essentials: { run: essentials },
  archiving: { seed: { settings: { archive: true, 'archive.after': 3600 }, idle: ['A', 'Docs', 'Mail'] }, run: archiving }
}
