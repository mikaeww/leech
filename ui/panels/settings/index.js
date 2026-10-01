// Settings (Settings.swift): a rail of pages beside the page shown. The Chromium build adds the pages for
// Chromium's own settings (chromium.js); every other page is Leech's (leech.js), with Chromium's lines where
// Chromium does the job.
import { h } from '../../elements.js'
import { door } from '../../look/controls.js'
import { icon } from '../../look/icons.js'
import { L, setPref } from '../../state.js'
import { close, ctx, paint, panel } from '../index.js'
import { languages, sites, system } from './chromium.js'
import { colours } from './colours.js'
import { about, downloads, general, passwords, privacy, tabs } from './leech.js'

const PAGES = [['general', 'General', 'window', general], ['colours', 'Colours', 'palette', colours], ['tabs', 'Tabs', 'tabs', tabs], ['passwords', 'Passwords', 'key', passwords],
  ['downloads', 'Downloads', 'download', downloads], ['privacy', 'Privacy', 'hand', privacy],
  ...(L.chromiumSettings ? [['sites', 'Sites', 'globe', sites], ['languages', 'Languages', 'languages', languages], ['system', 'System', 'cpu', system]] : []),
  ['about', 'About', 'info', about]]

export function settingsPlate () {
  if (!PAGES.some(p => p[0] === panel.settingsPage)) panel.settingsPage = 'general'
  const el = h('div', 'plate settings')
  const rail = h('div', 'rail', '<div class="rail-title">Settings</div>')
  const content = h('div', 'content')
  for (const [id, title, glyph] of PAGES) {
    const b = h('button', 'rail-row' + (panel.settingsPage === id ? ' on' : ''), `${icon(glyph)}<span>${title}</span>`)
    b.addEventListener('click', () => {
      if (panel.settingsPage === id) return
      panel.settingsPage = id
      setPref('settings.page', id)
      rail.querySelectorAll('.rail-row').forEach(x => x.classList.toggle('on', x === b))
      fillSettings(content, true)
    })
    rail.append(b)
  }
  fillSettings(content, false)
  el.append(rail, content)
  return el
}

function fillSettings (content, fresh) {
  const page = PAGES.find(p => p[0] === panel.settingsPage)
  const head = h('div', 'head', `<div class="heading">${page[1]}</div>`)
  head.append(door('close', 'Done   esc', close))
  const body = h('div', 'scroll' + (fresh ? ' fresh' : ''))
  body.append(...page[3]().filter(Boolean))
  content.replaceChildren(head, body)
}

// Only the settings page, in place, when a choice changes what the page shows.
export function refill () {
  const content = panel.plate?.querySelector('.content')
  if (content) {
    const top = content.querySelector('.scroll')?.scrollTop || 0
    fillSettings(content, false)
    content.querySelector('.scroll').scrollTop = top
  } else paint()
}

// Switches and segments have already moved; only a choice that adds or removes lines redraws the page.
const RESHAPES = new Set(['search.engine', 'passwords.never', 'shield', 'downloads', 'archive'])
export function set (key, value) {
  setPref(key, value)
  ctx.prefsChanged(key)
  if (RESHAPES.has(key)) refill()
}
