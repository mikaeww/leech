// Passwords (PasswordsPanel): the keyring's sign-ins, revealed for a moment, added by hand.
import { esc, h } from '../elements.js'
import { action } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { toast } from '../page/notices.js'
import { L } from '../state.js'
import { ctx, paint, panel, titled } from './index.js'
import { card, hunt, nothing, quick } from './pieces.js'
import { importCSV } from './settings/leech.js'

export async function loadVault () {
  // A password shown before a change may be the old one; Show reads it again.
  panel.shown.clear()
  panel.vaultList = await L.vault('list')
  if (panel.kind === 'passwords') paint()
}

// Chromium's store changes from elsewhere too: a sign-in saved through its bubble while the panel is open.
L.onVaultChanged(() => { if (panel.kind === 'passwords') loadVault() })

function addForm () {
  const form = h('div', 'add-form')
  const field = (placeholder, type = 'text') => {
    const i = h('input', 'plain-field')
    i.placeholder = placeholder
    i.type = type
    i.spellcheck = false
    return i
  }
  const site = field('Site')
  const user = field('Username')
  const pass = field('Password', 'password')
  site.autofocus = true
  const save = action('Save', async () => {
    if (!site.value.trim() || !pass.value) return
    const result = await L.vault('save', site.value.trim(), user.value.trim(), pass.value)
    if (result === 'refused') return toast('The keyring refused it')
    panel.adding = false
    loadVault()
  }, true)
  pass.addEventListener('keydown', e => { if (e.key === 'Enter') save.click() })
  const top = h('div', 'pair')
  top.append(site, user)
  const bottom = h('div', 'pair')
  bottom.append(pass, save)
  form.append(top, bottom)
  return card(form)
}

export function passwordsPlate () {
  const needle = panel.vaultQuery.trim().toLowerCase()
  const matches = panel.vaultList.filter(l => !needle || l.host.includes(needle) || l.user.toLowerCase().includes(needle))
  const sites = [...new Set(matches.map(l => l.host))].sort()
  const top = h('div', 'search-bar')
  top.append(hunt('Search sites and accounts', panel.vaultQuery, v => { panel.vaultQuery = v; paint() }, 'vault'), action(panel.adding ? 'Cancel' : 'Add', () => { panel.adding = !panel.adding; paint() }, !panel.adding))
  const parts = [top]
  if (panel.adding) parts.push(addForm())
  if (!sites.length) parts.push(nothing(panel.vaultList.length ? 'Nothing matches.' : 'Nothing kept yet. Sign in somewhere and say yes, or bring yours in below.'))
  else {
    const list = h('div', 'list passwords')
    const box = h('div', 'card')
    sites.forEach(host => {
      const logins = matches.filter(l => l.host === host)
      const isOpen = panel.openSite === host
      const extra = logins.length > 1 ? `${logins.length} accounts` : (!isOpen && logins[0].user) || ''
      const row = h('div', 'site-row' + (isOpen ? ' open' : ''), `${ctx.markFor('https://' + host, 16)}<span class="host">${esc(host)}</span>${extra ? `<span class="extra">${esc(extra)}</span>` : ''}<span class="chevron${isOpen ? ' open' : ''}">${icon('forward', 'small')}</span>`)
      row.addEventListener('click', () => { panel.openSite = isOpen ? null : host; paint() })
      box.append(row)
      if (!isOpen) return
      const accounts = h('div', 'accounts-of')
      for (const a of logins) {
        const key = `${a.host}|${a.user}`
        const secret = panel.shown.get(key)
        const acc = h('div', 'account-row' + (secret ? ' keep' : ''), `<span class="user${a.user ? '' : ' none'}">${esc(a.user || 'No username')}</span><span class="secret${secret ? ' shown' : ''}">${secret ? esc(secret) : '•'.repeat(10)}</span>`)
        acc.append(
          quick(secret ? 'Hide' : 'Show', async () => {
            if (secret) panel.shown.delete(key)
            else {
              panel.shown.set(key, await L.vault('reveal', a.host, a.user))
              setTimeout(() => { panel.shown.delete(key); if (panel.kind === 'passwords') paint() }, 15000)
            }
            paint()
          }),
          quick('Copy', async () => { L.copy(await L.vault('reveal', a.host, a.user)); toast('Password copied') }),
          quick('Remove', async () => { await L.vault('forget', a.host, a.user); loadVault() }, true))
        accounts.append(acc)
      }
      box.append(accounts)
    })
    list.append(box)
    parts.push(list)
  }
  return titled('Passwords', 620, parts, [
    h('span', 'foot-note', 'Bring in from'),
    action('CSV file…', importCSV),
    h('span', 'spacer'),
    h('span', 'foot-note', panel.vaultList.length === 1 ? '1 password' : `${panel.vaultList.length} passwords`),
    h('span', 'foot-small', `Export them as CSV in Chrome, Brave, Firefox or Zen first. Everything lands in ${L.native ? 'Chromium’s password store, which fills your sign-ins' : 'your own keyring, under Leech'}.`)
  ])
}
