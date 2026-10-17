// The island's Shield: on or off, this site's ads, this site's redirects with what was stopped, the owner's list
// of guarded sites, and what is hidden on this site.
import { actions } from '../keys.js'
import { door, toggle } from '../look/controls.js'
import { card, line, quick } from '../panels/pieces.js'
import { bareHost, isWeb } from '../places/address.js'
import { withSite } from '../places/shield.js'
import { esc, h } from '../elements.js'
import { hidden, prefs } from '../state.js'
import { reload } from '../tabs/tabs.js'
import { change, named, quicks, row } from './parts.js'

const stops = n => n === 1 ? '1 redirect' : `${n} redirects`

function switches (t, host) {
  const paused = prefs['shield.paused']
  const guarded = prefs['shield.guarded']
  // The guard holds a site and everything under it, so the entry that covers this host is the one to take out.
  const entry = host && guarded.find(d => host === d || host.endsWith(`.${d}`))
  return card(
    line('Shield', 'Blocks ads and trackers other sites load', toggle(prefs.shield, v => change('shield', v))),
    prefs.shield && host && line(`Block ads on ${host}`, 'Off if the site breaks; the page reloads',
      toggle(!paused.includes(host), v => { change('shield.paused', withSite(paused, host, !v)); reload() })),
    prefs.shield && host && !paused.includes(host) && line(`Stop redirects on ${host}`,
      t.stopped ? `${stops(t.stopped.count)} stopped on this page, the last to ${t.stopped.host}` : 'Its pages can’t send this tab or a new one to another site',
      toggle(!!entry, v => change('shield.guarded', withSite(guarded, entry || host, v))))
  )
}

function guardedList () {
  const guarded = prefs['shield.guarded']
  if (!guarded.length) return null
  return card(
    line('Kept from redirecting', guarded.length === 1 ? '1 site' : `${guarded.length} sites`),
    ...guarded.map(site => row(named(`<span class="title">${esc(site)}</span>`),
      door('x', `Take ${site} off`, () => change('shield.guarded', withSite(guarded, site, false)))))
  )
}

function hiddenHere (host, close) {
  const count = hidden.on(host).length
  return card(line('Hidden on this site', count ? `${count === 1 ? '1 element' : `${count} elements`}, gone each time it loads` : 'Pick a box, a banner or a bar to hide for good',
    quicks(quick('Hide…', () => { close(); actions.veil() }), count && quick('Undo', () => actions['veil-undo']()))))
}

export const shieldView = {
  id: 'shield',
  glyph: 'shield',
  label: 'Shield',
  shows: () => true,
  fill ({ t, close }) {
    const host = isWeb(t?.url) ? bareHost(t.url) : ''
    const view = h('div', 'island-view')
    view.append(...[switches(t, host), guardedList(), host && hiddenHere(host, close)].filter(Boolean))
    return view
  }
}
