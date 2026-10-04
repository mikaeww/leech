// UI check scenario for Leech's passkeys (ADR 0009, docs/verification/passkeys.md), Chromium build only: a page
// on http://localhost makes and uses passkeys through the sheet; Node's crypto checks every answer and the file.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { sleep } from './cdp.mjs'
import { openPage, waitFor } from './pages.mjs'

const PIN = 'correct horse'
const NEW_PIN = 'battery staple'
const bytes = text => Buffer.from(text, 'base64')
const sha256 = data => crypto.createHash('sha256').update(data).digest()

// What the page runs: create and get with fixed challenges, every answer as base64, every refusal by name.
const PAGE = `
const enc = b => b ? btoa(String.fromCharCode(...new Uint8Array(b))) : null
const ids = list => (list || []).map(id => ({ type: 'public-key', id: Uint8Array.from(atob(id), c => c.charCodeAt(0)) }))
window.make = (user, exclude) => { window.made = navigator.credentials.create({ publicKey: {
  rp: { name: 'Leech check' }, user: { id: new TextEncoder().encode(user), name: user, displayName: user + ' Example' },
  challenge: new Uint8Array(32).fill(7), pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  excludeCredentials: ids(exclude), extensions: { credProps: true } } }).then(c => ({ rawId: enc(c.rawId),
  clientData: enc(c.response.clientDataJSON), attestation: enc(c.response.attestationObject), spki: enc(c.response.getPublicKey()),
  rk: c.getClientExtensionResults().credProps?.rk, attachment: c.authenticatorAttachment }), e => ({ error: e.name })) }
window.use = allow => { window.used = navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32).fill(9),
  userVerification: 'required', allowCredentials: ids(allow) } }).then(c => ({ rawId: enc(c.rawId),
  clientData: enc(c.response.clientDataJSON), authData: enc(c.response.authenticatorData), signature: enc(c.response.signature),
  userHandle: enc(c.response.userHandle) }), e => ({ error: e.name })) }
`

// Just enough CBOR for an attestation object and a COSE key: unsigned and negative integers, byte and text strings, maps.
function cbor (buf, at = 0) {
  const head = buf[at++]
  const major = head >> 5
  let n = head & 31
  if (n === 24) n = buf[at++]
  else if (n === 25) { n = buf.readUInt16BE(at); at += 2 } else if (n > 25) throw new Error(`cbor: head ${head} isn't expected here`)
  if (major === 0) return [n, at]
  if (major === 1) return [-1 - n, at]
  if (major === 2) return [buf.subarray(at, at + n), at + n]
  if (major === 3) return [buf.subarray(at, at + n).toString('utf8'), at + n]
  if (major !== 5) throw new Error(`cbor: major type ${major} isn't expected here`)
  const map = new Map()
  for (let i = 0; i < n; i++) {
    const [key, next] = cbor(buf, at)
    const [value, after] = cbor(buf, next)
    map.set(key, value)
    at = after
  }
  return [map, at]
}

function checkClient (encoded, type, fill, origin) {
  assert.deepEqual(JSON.parse(bytes(encoded)), { type, challenge: Buffer.alloc(32, fill).toString('base64url'), origin, crossOrigin: false }, `${type} client data`)
}

// Claim 1. Flags: UP 0x01, UV 0x04, AT 0x40 set; BE 0x08, BS 0x10 clear.
function checkMade (made, user, origin) {
  assert.ok(!made.error, `a passkey for ${user} (${made.error})`)
  checkClient(made.clientData, 'webauthn.create', 7, origin)
  const [attestation] = cbor(bytes(made.attestation))
  assert.equal(attestation.get('fmt'), 'none', 'attestation none')
  assert.equal(attestation.get('attStmt').size, 0, 'an empty statement')
  const auth = attestation.get('authData')
  assert.deepEqual(auth.subarray(0, 32), sha256('localhost'), 'the RP ID hash')
  assert.equal(auth[32] & 0x5d, 0x45, `flags UP UV AT, not BE BS (${auth[32]})`)
  const length = auth.readUInt16BE(53)
  assert.deepEqual(auth.subarray(55, 55 + length), bytes(made.rawId), 'the credential id')
  const [cose] = cbor(auth, 55 + length)
  assert.deepEqual([cose.get(1), cose.get(3), cose.get(-1)], [2, -7, 1], 'an ES256 P-256 COSE key')
  const jwk = crypto.createPublicKey({ key: bytes(made.spki), format: 'der', type: 'spki' }).export({ format: 'jwk' })
  assert.deepEqual([cose.get(-2), cose.get(-3)], [Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')], 'the COSE key is the SPKI')
  assert.deepEqual([made.rk, made.attachment], [true, 'platform'], 'discoverable, on this computer')
}

// Claim 2.
function checkUsed (used, made, user, origin) {
  assert.ok(!used.error, `signed in as ${user} (${used.error})`)
  checkClient(used.clientData, 'webauthn.get', 9, origin)
  const auth = bytes(used.authData)
  assert.deepEqual(auth.subarray(0, 32), sha256('localhost'), 'the RP ID hash')
  assert.equal(auth[32] & 0x5d, 0x05, `flags UP UV, nothing else (${auth[32]})`)
  assert.deepEqual(bytes(used.rawId), bytes(made.rawId), `${user}'s passkey`)
  const signed = Buffer.concat([auth, sha256(bytes(used.clientData))])
  assert.ok(crypto.verify('sha256', signed, { key: bytes(made.spki), format: 'der', type: 'spki' }, bytes(used.signature)), 'the signature verifies')
  assert.equal(bytes(used.userHandle).toString(), user, 'the user handle given at creation')
}

// Claim 3: each key opens under the PIN's scrypt key, is the private half, and no other PIN opens it.
function checkFile (dir, pin, made) {
  const file = JSON.parse(fs.readFileSync(path.join(dir, '..', 'Leech Passkeys.json'), 'utf8'))
  const open = (key, entry) => {
    const sealed = bytes(entry.key)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12))
    decipher.setAAD(Buffer.concat([bytes(entry.id), Buffer.from(entry.rp)]))
    decipher.setAuthTag(sealed.subarray(-16))
    return Buffer.concat([decipher.update(sealed.subarray(12, -16)), decipher.final()])
  }
  const keyOf = p => crypto.scryptSync(p, bytes(file.salt), 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const key = keyOf(pin)
  for (const m of made) {
    const entry = file.passkeys.find(e => bytes(e.id).equals(bytes(m.rawId)))
    const pkcs8 = open(key, entry)
    const spki = crypto.createPublicKey(crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' })
    assert.deepEqual(spki, bytes(m.spki), 'the sealed key is the private half')
    assert.ok(!JSON.stringify(file).includes(pkcs8.toString('base64')), 'and not in the file in the clear')
    assert.throws(() => open(keyOf('not the pin'), entry), 'another PIN opens nothing')
  }
  return file
}

const sheet = 'const { panel } = await import(\'./panels/index.js\'); return panel.kind === \'passkey\''

async function answer (c, pins, label, account) {
  await waitFor(c, sheet, 'the passkey sheet')
  await c.js(`const fields = [...document.querySelectorAll('#panel .pin-fields input')];
    ${JSON.stringify(pins)}.forEach((v, i) => { fields[i].value = v; fields[i].dispatchEvent(new Event('input')) })
    ${account === undefined ? '' : `document.querySelectorAll('#panel .line.choice')[${account}].click()`}`)
  await c.js(`[...document.querySelectorAll('#panel .foot button')].find(b => b.textContent === '${label}').click()`)
}

async function saidWrong (c) {
  await waitFor(c, 'return document.querySelector("#panel .said")?.textContent.includes("isn’t the PIN")', 'the sheet to say the PIN is wrong')
}

async function passkeys ({ c, base, dir, shot }) {
  const origin = base.replace('127.0.0.1', 'localhost')
  const page = await openPage(c, origin, '/passkey.html', 'Passkey')
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await page.js(PAGE)
  await page.js('make("ada")')
  await waitFor(c, sheet, 'the sheet for the first passkey')
  // The sheet fades in; the picture is of it at rest.
  await sleep(400)
  await shot?.('setup')
  await answer(c, [PIN, PIN], 'Save')
  const ada = await page.js('return await window.made')
  checkMade(ada, 'ada', origin)
  await page.js(`make("ada", ["${ada.rawId}"])`)
  assert.equal((await page.js('return await window.made')).error, 'InvalidStateError', 'claim 5: excluded, refused')
  await page.js('make("bob")')
  await answer(c, [PIN], 'Save')
  const bob = await page.js('return await window.made')
  checkMade(bob, 'bob', origin)
  checkFile(dir, PIN, [ada, bob])
  await page.js('use()')
  await answer(c, ['wrong pin'], 'Sign in', 1)
  await saidWrong(c)
  await sleep(400)
  await shot?.('wrong-pin')
  await answer(c, [PIN], 'Sign in', 1)
  checkUsed(await page.js('return await window.used'), bob, 'bob', origin)
  await c.js(`const { L } = await import('./state.js'); return await L.passkeys.changePin('${PIN}', '${NEW_PIN}')`)
  checkFile(dir, NEW_PIN, [ada, bob])
  await page.js(`use(["${ada.rawId}"])`)
  await answer(c, [PIN], 'Sign in')
  await saidWrong(c)
  await answer(c, [NEW_PIN], 'Sign in')
  checkUsed(await page.js('return await window.used'), ada, 'ada', origin)
  await c.js(`const { L } = await import('./state.js'); return await L.passkeys.remove('${bytes(bob.rawId).toString('base64url')}')`)
  await sleep(500)
  const file = checkFile(dir, NEW_PIN, [ada])
  assert.equal(file.passkeys.length, 1, 'claim 7: removed from the file')
  await page.js(`use(["${bob.rawId}"])`)
  assert.equal((await page.js('return await window.used')).error, 'NotAllowedError', 'and from sign-in')
  await c.js(`const { actions } = await import('./keys.js'); actions.settings()
    await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.rail-row')].find(b => b.textContent === 'Passwords').click()`)
  await sleep(600)
  await shot?.('settings')
  page.close()
}

export const passkeyScenarios = {
  passkeys: { chromium: 'only', seed: { settings: { passkeys: true } }, run: passkeys }
}
