// UI check scenarios for the owner's colours (ADR 0008, docs/verification/paint.md claim 5). Both shells.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { contrast } from '../../ui/paint/colour.js'
import { PRESETS } from '../../ui/paint/presets.js'
import { sleep } from './cdp.mjs'
import { waitFor } from './pages.mjs'

const readJSON = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))
const sideLooks = c => c.js('const s = document.querySelector("#side"); const cs = getComputedStyle(s); return { image: cs.backgroundImage, colour: cs.backgroundColor, ink: s.className.match(/ink-\\w+/)?.[0] || null }')

// Seeded with a dark gradient and an accent; then through the Colours page to one pale colour and back to grey.
async function paint ({ c, dir, shot }) {
  await waitFor(c, 'return getComputedStyle(document.querySelector("#side")).backgroundImage.startsWith("url(\\"blob:")', 'the saved gradient as dithered pixels')
  let side = await sideLooks(c)
  assert.equal(side.ink, 'ink-dark', 'with light text on its dark colours')
  assert.equal(await c.js('return getComputedStyle(document.documentElement).getPropertyValue("--chip-on").trim()'), '#d4512a', 'the accent takes the inverted role')
  await shot?.('seeded')
  await c.js('const { actions } = await import("./keys.js"); actions["new-tab"]()')
  await sleep(600)
  const blankTab = await c.js('const s = document.querySelector("#stage"); return { image: getComputedStyle(s).backgroundImage, field: getComputedStyle(document.querySelector("#omni .field")).backgroundImage, ink: document.querySelector("#omni").className.match(/ink-\\w+/)?.[0] || null, blank: s.classList.contains("blank") }')
  assert.ok(blankTab.blank && blankTab.image.startsWith(side.image), `a blank tab without a sheet wears the window's gradient (${JSON.stringify(blankTab)})`)
  assert.equal(blankTab.ink, 'ink-dark', 'and its address field the window\'s ink')
  assert.match(blankTab.field, /linear-gradient/, 'the address field wears the window\'s colours')
  await shot?.('blank-tab')

  await c.js(`const { actions } = await import('./keys.js'); actions.settings()
    await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.rail-row')].find(b => b.textContent === 'Colours').click()`)
  await sleep(400)
  await shot?.('page')
  await c.js('[...document.querySelectorAll("#panel .segmented button")].find(b => b.textContent === "Colour").click()')
  await sleep(300)
  await c.js('document.querySelector("#panel .swatch[aria-label=\\"Window colour\\"]").click()')
  await sleep(200)
  await c.js('const f = document.querySelector(".picker-hex input"); f.value = "#ebe1d1"; f.dispatchEvent(new Event("input", { bubbles: true }))')
  await sleep(200)
  await shot?.('picker')
  side = await sideLooks(c)
  assert.equal(side.colour, 'rgb(235, 225, 209)', 'the hex typed in the picker paints the sidebar at once')
  assert.equal(side.ink, 'ink-light', 'and its text turns dark on the pale colour')
  await c.js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))')
  await sleep(200)
  assert.deepEqual(await c.js('return [!!document.querySelector(".picker"), !document.querySelector("#panel").hidden]'), [false, true], 'Escape puts the picker away, the panel stays')
  await sleep(1200)
  assert.equal(readJSON(dir, 'settings').paint?.window?.colours?.[0], '#ebe1d1', 'the colour is saved')

  await c.js('[...document.querySelectorAll("#panel .action")].find(b => b.textContent === "Reset").click()')
  await sleep(300)
  side = await sideLooks(c)
  assert.ok(/^none(, none)*$/.test(side.image) && side.colour === 'rgb(242, 242, 242)' && side.ink === null, `Reset gives the stock grey back (${JSON.stringify(side)})`)

  await c.js('const { setPaint } = await import("./paint/apply.js"); setPaint({ window: { kind: "gradient", dither: true } })')
  await waitFor(c, 'return getComputedStyle(document.querySelector("#side")).backgroundImage.startsWith("url(\\"blob:")', 'the dithered gradient')
  const under = await c.js('return getComputedStyle([...document.querySelectorAll("#side .pill")].find(p => p.getBoundingClientRect().width)).backdropFilter')
  assert.match(under, /^blur\(/, `the live tab's pill blurs the dots behind it (${under})`)
  await shot?.('dithered')
}

// Every preset on a blank tab in the dark look: its sidebar text reads on each of its colours at 4.5:1 or more.
async function presets ({ c, shot }) {
  await c.js('const { actions } = await import("./keys.js"); actions["new-tab"]()')
  await sleep(600)
  await c.js('document.activeElement?.blur()')
  for (const [name, paint] of PRESETS.filter(([, p]) => p)) {
    await c.js(`const { setPref } = await import('./state.js'); const { applyPaint } = await import('./paint/apply.js'); setPref('paint', ${JSON.stringify(paint)}); applyPaint()`)
    await sleep(paint.window.dither ? 900 : 300)
    const fg = await c.js('return getComputedStyle(document.querySelector("#side")).getPropertyValue("--fg").trim()')
    const worst = Math.min(...paint.window.colours.slice(0, paint.window.kind === 'colour' ? 1 : 3).map(stop => contrast(stop, fg)))
    assert.ok(worst >= 4.5, `${name}: sidebar text ${fg} reads at ${worst.toFixed(2)}:1 on its worst colour`)
    await shot?.(name.toLowerCase())
  }
}

export const paintScenarios = {
  'paint-presets': { chromium: true, seed: { look: 'dark' }, run: presets },
  paint: {
    chromium: true,
    seed: { settings: { paint: { window: { kind: 'gradient', colours: ['#0b2a6f', '#6d4cf5'], shape: 'linear', angle: 160 }, accent: '#d4512a' } } },
    run: paint
  }
}
