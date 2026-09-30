// Sign-ins: offered a place in the keyring once they worked, filled from a list under the box.
import { panels } from '../chrome/panels.js'
import { $, esc, h } from '../elements.js'
import { icon } from '../look/icons.js'
import { bareHost } from '../places/address.js'
import { L, prefs, S, setPref } from '../state.js'
import { hint, toast } from './notices.js'

export function formSaid (t, said) {
  if (said.kind === 'form') t.hasForm = true
  if (said.kind === 'submit' && !t.shy && prefs['passwords.save']) {
    t.signin = { url: t.url, user: said.user, password: said.password, at: Date.now() }
  }
  if (said.kind === 'settled') offerToSave(t)
  if (said.kind === 'focus' && t.id === S.active) accountsFor(t, said.rect)
}

// A sign-in counts as working once the page moved on and no password box came back.
export function signInSettles (t) {
  if (!t.signin) return
  setTimeout(() => { if (!t.hasForm) offerToSave(t) }, 1500)
}

async function offerToSave (t) {
  const s = t.signin
  t.signin = null
  if (!s || Date.now() - s.at > 45000) return
  const host = bareHost(s.url)
  if (!host || prefs['passwords.never'].includes(host)) return
  const question = await L.vault('question', host, s.user, s.password)
  if (!question) return
  const words = question === 'update' ? `Update the password for ${esc(s.user)} on ${esc(host)}?`
    : s.user ? `Save the password for ${esc(s.user)} on ${esc(host)}?` : `Save this password for ${esc(host)}?`
  const el = h('div', 'ask', `<span>${words}</span>`)
  const button = (label, cls, fn) => { const b = h('button', cls, label); b.addEventListener('click', () => { el.remove(); fn() }); el.append(b) }
  button(question === 'update' ? 'Update' : 'Save', 'allow', async () => {
    const result = await L.vault('save', host, s.user, s.password)
    toast(result === 'refused' ? 'The keyring refused it' : `Password ${result === 'updated' ? 'updated' : 'saved'} for ${host}`)
  })
  button('Not now', 'deny', () => {})
  if (question !== 'update') button('Never here', 'deny', () => setPref('passwords.never', [...prefs['passwords.never'], host].sort()))
  $('#asks').insertBefore(el, hint)
}

export const accounts = h('div', 'accounts')
accounts.hidden = true
$('#app').append(accounts)
let accountsTimer = null
// Refocusing the box after a fill would bring the list straight back.
let accountsQuietUntil = 0
export let accountsTab = null

async function accountsFor (t, rect) {
  clearTimeout(accountsTimer)
  if (!rect || !prefs['passwords.fill'] || t.shy || Date.now() < accountsQuietUntil) {
    accountsTimer = setTimeout(() => { accounts.hidden = true }, 200)
    return
  }
  const logins = await L.vault('matching', bareHost(t.url))
  if (!logins.length || t.id !== S.active || panels.kind || Date.now() < accountsQuietUntil) { accounts.hidden = true; return }
  accountsTab = t.id
  const box = t.web.getBoundingClientRect()
  const zoom = t.web.getZoomFactor()
  accounts.style.left = `${box.left + rect.x * zoom}px`
  accounts.style.top = `${box.top + (rect.y + rect.h) * zoom + 6}px`
  accounts.style.width = `${Math.max(240, Math.min(360, rect.w * zoom))}px`
  accounts.innerHTML = ''
  for (const login of logins) {
    const row = h('button', 'account', `<span class="badge">${esc((login.user || login.host).charAt(0).toUpperCase())}</span><span class="who"><span class="user">${esc(login.user || 'No name')}</span><span class="host">${esc(login.host)}</span></span>`)
    row.addEventListener('mousedown', e => e.preventDefault())
    row.addEventListener('click', async () => {
      accounts.hidden = true
      accountsQuietUntil = Date.now() + 1000
      const password = await L.vault('reveal', login.host, login.user)
      if (password !== null && t.ready) t.web.send('fill', login.user, password)
      t.web.focus()
    })
    accounts.append(row)
  }
  accounts.append(h('div', 'from', `${icon('key', 'small')}<span>From your keyring</span>`))
  accounts.hidden = false
}
