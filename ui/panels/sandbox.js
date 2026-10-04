// The sandbox panel (ADR 0012): what makes this window a sandbox, shown rather than claimed. The page's cookies here
// against the same site's in the normal window, everything the sandbox holds site by site, how long it has been
// open, and a fresh start. Read from Chromium again every two seconds while the panel is open.
import { esc, h } from '../elements.js'
import { action } from '../look/controls.js'
import { L } from '../state.js'
import { ctx, paint, panel, titled } from './index.js'
import { bytes, caption, card, line, nothing } from './pieces.js'

const EVERY = 2000
let timer = null

export async function loadSandbox () {
  clearTimeout(timer)
  if (panel.kind !== 'sandbox') return
  panel.sandbox = await L.sandboxReport(ctx.currentURL())
  if (panel.kind !== 'sandbox') return
  paint()
  timer = setTimeout(loadSandbox, EVERY)
}

function openFor (made) {
  const minutes = Math.floor((Date.now() / 1000 - made) / 60)
  if (minutes < 1) return 'Opened less than a minute ago'
  return minutes < 60 ? `Open for ${minutes} min` : `Open for ${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

// A cookie jar: how many, and their names (never their values), so two jars can be told apart at a glance.
function stat (names, label) {
  const shown = names.length ? names.slice(0, 6).join(', ') + (names.length > 6 ? ` and ${names.length - 6} more` : '') : 'none'
  return h('div', 'stat', `<span class="number">${names.length}</span><span class="label">${esc(label)}</span><span class="names">${esc(shown)}</span>`)
}

// The proof that matters most: the same site, two cookie jars.
function hereCard (here) {
  if (!here) return nothing('No web page on screen. Open one to compare its cookies with your normal window.')
  const pair = h('div', 'compare')
  pair.append(stat(here.sandbox, 'cookies in this sandbox'), stat(here.normal, 'in your normal window'))
  const word = !here.sandbox.length && here.normal.length
    ? 'The site sees none of what it keeps in your normal window: no sign-in, no history with it.'
    : here.sandbox.length && !here.normal.length
      ? 'What the site set here stays here: your normal window has none of it.'
      : 'The two jars are counted apart: a cookie set on one side is never on the other.'
  return card(line(here.host, word), pair)
}

function siteLine (site) {
  const parts = [site.cookies && `${site.cookies} ${site.cookies === 1 ? 'cookie' : 'cookies'}`, ...site.kinds.filter(k => k !== 'cookies'), site.size > 0 && bytes(site.size)].filter(Boolean)
  return line(site.site, parts.join(' · '))
}

export function sandboxPlate () {
  const report = panel.sandbox
  const parts = [card(
    line('Apart from your normal window', 'Its own cookies, storage, cache, permissions and extensions, on a profile made for this window alone'),
    line('Keeps nothing', 'Nothing it does is written to disk. All of it is gone when this window closes'),
    report?.made ? line(openFor(report.made), null) : null
  )]
  if (report) {
    const list = h('div', 'list short')
    list.append(caption('This page'), hereCard(report.here), caption('What this sandbox holds'),
      report.sites.length ? card(...report.sites.map(siteLine)) : nothing('Nothing yet. Sites that set cookies or keep data show up here as they do.'))
    parts.push(list)
  }
  const url = ctx.currentURL()
  return titled('Sandbox', 560, parts, [
    action('Start over', () => { L.sandbox(url); L.window('close') }, true),
    action('Close sandbox', () => L.window('close')),
    h('span', 'spacer'),
    h('span', 'foot-note', 'Start over opens this page in a fresh sandbox')
  ])
}
