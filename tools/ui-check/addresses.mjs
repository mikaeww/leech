// UI check scenario for addresses kept encrypted (ADR 0010), Chromium build only: an address saved through
// Chromium's own settings API comes back whole, and "Web Data" holds it only as encrypted blobs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { connect, sleep } from './cdp.mjs'
import { waitFor } from './pages.mjs'

const FIELDS = [
  { type: 'NAME_FULL', value: 'Wilhelmina Quokkastein' },
  { type: 'ADDRESS_HOME_STREET_ADDRESS', value: 'Quokkaweg 42' },
  { type: 'ADDRESS_HOME_CITY', value: 'Zettelhausen' },
  { type: 'ADDRESS_HOME_ZIP', value: '12345' },
  { type: 'ADDRESS_HOME_COUNTRY', value: 'DE' },
  { type: 'EMAIL_ADDRESS', value: 'quokka@example.invalid' }
]
const PLAIN = ['Wilhelmina Quokkastein', 'Quokkaweg 42', 'Zettelhausen', 'quokka@example.invalid']

// Chromium holds the database open; a copy is read, the journal beside it is searched as it is.
function storedKinds (file, copy) {
  fs.copyFileSync(file, copy)
  const db = new DatabaseSync(copy, { readOnly: true })
  const kinds = db.prepare('SELECT typeof(value) AS kind, count(*) AS n FROM address_type_tokens GROUP BY kind').all()
  db.close()
  return Object.fromEntries(kinds.map(k => [k.kind, k.n]))
}

async function addresses ({ c, dir }) {
  await fetch(`http://127.0.0.1:${c.port}/json/new?chrome://settings/addresses`, { method: 'PUT' })
  const settings = await connect(c.port, url => url.startsWith('chrome://settings'))
  await waitFor(settings, 'return typeof chrome.autofillPrivate?.saveAddress === "function"', 'the settings page')
  await settings.js(`await chrome.autofillPrivate.saveAddress({ fields: ${JSON.stringify(FIELDS)} })`)
  const file = path.join(dir, '..', 'Web Data')
  const copy = path.join(dir, '..', 'web-data-copy')
  let kinds = {}
  for (let i = 0; i < 40 && !kinds.blob; i++) {
    await sleep(250)
    kinds = storedKinds(file, copy)
  }
  assert.ok(kinds.blob > 0 && !kinds.text, `every stored value is an encrypted blob (${JSON.stringify(kinds)})`)
  for (const name of [file, `${file}-journal`].filter(f => fs.existsSync(f))) {
    const bytes = fs.readFileSync(name)
    for (const words of PLAIN) assert.ok(!bytes.includes(words), `"${words}" isn't in ${path.basename(name)} in the clear`)
  }
  const list = await settings.js('return await new Promise(r => chrome.autofillPrivate.getAddressList(r))')
  const read = Object.fromEntries(list[0].fields.map(f => [f.type, f.value]))
  for (const { type, value } of FIELDS.filter(f => f.type !== 'ADDRESS_HOME_COUNTRY')) assert.equal(read[type], value, `${type} comes back whole`)
  settings.close()
}

export const addressScenarios = {
  addresses: { chromium: 'only', run: addresses }
}
