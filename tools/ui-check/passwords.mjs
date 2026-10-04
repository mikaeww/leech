// UI check scenario for the Passwords panel over Chromium's store (ADR 0011), Chromium build only: accounts added,
// changed, revealed, removed and imported through the panel, each step held against the profile's "Login Data".
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { sleep } from './cdp.mjs'
import { waitFor } from './pages.mjs'

// Chromium holds the database open; a copy is read.
function storedAccounts (dir) {
  const copy = path.join(dir, '..', 'login-data-copy')
  fs.copyFileSync(path.join(dir, '..', 'Login Data'), copy)
  const db = new DatabaseSync(copy, { readOnly: true })
  const rows = db.prepare('SELECT origin_url, username_value FROM logins WHERE blacklisted_by_user = 0').all()
  db.close()
  return rows.map(r => `${new URL(r.origin_url).host}|${r.username_value}`).sort()
}

async function storedBecomes (dir, expected, what) {
  let got = []
  for (let i = 0; i < 40; i++) {
    got = storedAccounts(dir)
    if (JSON.stringify(got) === JSON.stringify(expected)) return
    await sleep(250)
  }
  assert.deepEqual(got, expected, what)
}

const listed = c => c.js('const { panel } = await import(\'./panels/index.js\'); return panel.vaultList.map(l => `${l.host}|${l.user}`).sort()')
const vault = (c, ...args) => c.js(`const { L } = await import('./state.js'); return L.vault(${args.map(a => JSON.stringify(a)).join(', ')})`)
const click = (c, selector, text) => c.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent === ${JSON.stringify(text)}).click()`)

async function addThroughForm (c, site, user, password) {
  await click(c, '#panel .search-bar button', 'Add')
  await sleep(200)
  await c.js(`const [s, u, p] = document.querySelectorAll('#panel .add-form input')
    s.value = ${JSON.stringify(site)}; u.value = ${JSON.stringify(user)}; p.value = ${JSON.stringify(password)}`)
  await click(c, '#panel .add-form button', 'Save')
  await waitFor(c, 'return !document.querySelector("#panel .add-form")', 'the form to close once saved')
}

// The file input's chooser is Chromium's own dialog; here the chosen file is handed to the input as a person's would be.
async function importThroughInput (c, csv) {
  return c.js(`const proto = HTMLInputElement.prototype; const click = proto.click
    proto.click = function () {
      proto.click = click
      const files = new DataTransfer(); files.items.add(new File([${JSON.stringify(csv)}], 'passwords.csv', { type: 'text/csv' }))
      this.files = files.files; this.dispatchEvent(new Event('change'))
    }
    const { L } = await import('./state.js'); return L.importCSV()`)
}

async function passwordsPanel ({ c, dir, shot }) {
  await c.js('const { open } = await import(\'./panels/index.js\'); open(\'passwords\')')
  await waitFor(c, 'return document.querySelector("#panel .heading")?.textContent === "Passwords"', 'the Passwords panel')
  assert.equal(await c.js('const { tabs } = await import(\'./state.js\'); return tabs.some(t => (t.url || \'\').startsWith(\'chrome://password\'))'), false, 'no Chromium password page opened')
  await addThroughForm(c, 'alpha.example', 'ana', 'pw-alpha-1')
  await addThroughForm(c, 'https://www.beta.example/login', 'ben', 'pw-beta-1')
  await addThroughForm(c, 'beta.example', 'bea', 'pw-beta-2')
  const three = ['alpha.example|ana', 'www.beta.example|ben', 'beta.example|bea'].sort()
  await storedBecomes(dir, three, 'three accounts in Login Data')
  await waitFor(c, 'const { panel } = await import(\'./panels/index.js\'); return panel.vaultList.length === 3', 'the panel to list three')
  assert.deepEqual(await listed(c), ['alpha.example|ana', 'beta.example|bea', 'beta.example|ben'], 'listed bare, one per site and username')
  assert.equal(await vault(c, 'reveal', 'beta.example', 'ben'), 'pw-beta-1', 'revealed as saved')
  await c.js('[...document.querySelectorAll("#panel .site-row")].find(r => r.querySelector(".host").textContent === "alpha.example").click()')
  await sleep(200)
  await click(c, '#panel .account-row button', 'Show')
  await waitFor(c, 'return document.querySelector("#panel .account-row .secret.shown")?.textContent === "pw-alpha-1"', 'Show to reveal the password')
  await shot?.('revealed')
  assert.equal(await vault(c, 'save', 'alpha.example', 'ana', 'pw-alpha-2'), 'updated', 'a kept account takes a new password')
  await waitFor(c, 'return document.querySelector("#panel .account-row .secret")?.textContent === "••••••••••"', 'the old password hidden once it changed')
  assert.equal(await vault(c, 'save', 'alpha.example', 'ana', 'pw-alpha-2'), 'same', 'the same password changes nothing')
  assert.equal(await vault(c, 'reveal', 'alpha.example', 'ana'), 'pw-alpha-2', 'the new password is kept')
  await storedBecomes(dir, three, 'a change adds no account')
  await vault(c, 'forget', 'beta.example', 'bea')
  await storedBecomes(dir, ['alpha.example|ana', 'www.beta.example|ben'], 'only that account removed')
  const csv = 'name,url,username,password\ngamma,https://gamma.example/,gus,pw-gamma-1\nalpha,https://alpha.example/,ana,pw-alpha-from-file\nbroken,,nobody,pw-none\n'
  const brought = await importThroughInput(c, csv)
  assert.equal(typeof brought, 'number', `the import answered a count (${brought})`)
  await storedBecomes(dir, ['alpha.example|ana', 'gamma.example|gus', 'www.beta.example|ben'], 'the new row came in, the invalid one did not')
  assert.equal(await vault(c, 'reveal', 'gamma.example', 'gus'), 'pw-gamma-1', 'the imported password as written')
  assert.equal(await vault(c, 'reveal', 'alpha.example', 'ana'), 'pw-alpha-2', 'a kept account keeps its password over the file\'s')
  assert.equal(await importThroughInput(c, 'not,a\npassword,file\n'), 'That file is not a password CSV', 'a file that is no password CSV says so')
  await waitFor(c, 'const { panel } = await import(\'./panels/index.js\'); return panel.vaultList.length === 3', 'the panel to follow the import')
  await shot?.('after-import')
}

export const passwordScenarios = {
  'passwords-panel': { chromium: 'only', run: passwordsPanel }
}
