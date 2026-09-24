const { safeStorage } = require('electron')

// Sign-ins in passwords.json; every secret is sealed with safeStorage, which on Linux is the desktop keyring.

const bare = host => String(host || '').trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '')
// ponytail: last two labels as the site, like the shield; a public-suffix list if co.uk-style hosts matter.
const site = host => host.split('.').slice(-2).join('.')

class Vault {
  constructor (read, write) {
    this.logins = read('passwords') || []
    this.write = () => write('passwords', this.logins)
  }

  get ready () {
    return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
  }

  seal (password) {
    return safeStorage.encryptString(password).toString('base64')
  }

  open (login) {
    return safeStorage.decryptString(Buffer.from(login.secret, 'base64'))
  }

  /** What the panel lists: no secrets. */
  list () {
    return this.logins.map(({ host, user, used }) => ({ host, user, used }))
  }

  /** Accounts for a host, then for the rest of its site, most recently used first. */
  matching (host) {
    const h = bare(host)
    return this.logins
      .filter(l => l.host === h || site(l.host) === site(h))
      .sort((a, b) => (b.host === h) - (a.host === h) || (b.used || 0) - (a.used || 0))
      .slice(0, 5)
      .map(({ host, user }) => ({ host, user }))
  }

  reveal (host, user) {
    const login = this.logins.find(l => l.host === bare(host) && l.user === user)
    if (!login) return null
    login.used = Date.now() / 1000
    this.write()
    return this.open(login)
  }

  /** 'saved', 'updated', 'same', or 'refused' when there is no keyring to seal with. */
  save (host, user, password) {
    const h = bare(host)
    if (!h || !password) return 'refused'
    if (!this.ready) return 'refused'
    const old = this.logins.find(l => l.host === h && l.user === user)
    if (old && this.open(old) === password) {
      old.used = Date.now() / 1000
      this.write()
      return 'same'
    }
    const login = { host: h, user, secret: this.seal(password), used: Date.now() / 1000 }
    if (old) Object.assign(old, login)
    else this.logins.push(login)
    this.write()
    return old ? 'updated' : 'saved'
  }

  /** What an offer to save would be: null when nothing needs asking. */
  question (host, user, password) {
    const h = bare(host)
    const old = this.logins.find(l => l.host === h && l.user === user)
    if (!old) return 'save'
    return this.open(old) === password ? null : 'update'
  }

  forget (host, user) {
    this.logins = this.logins.filter(l => !(l.host === bare(host) && l.user === user))
    this.write()
  }

  /** Imported sign-ins; an account already kept keeps the newer password. Returns how many were added or changed. */
  take (entries) {
    if (!this.ready) return -1
    let n = 0
    for (const { host, user = '', password, used = 0 } of entries) {
      const h = bare(host)
      if (!h || !password) continue
      const old = this.logins.find(l => l.host === h && l.user === user)
      if (old && (old.used || 0) >= used) continue
      const login = { host: h, user, secret: this.seal(password), used }
      if (old) Object.assign(old, login)
      else this.logins.push(login)
      n++
    }
    this.write()
    return n
  }
}

module.exports = { Vault, bare }
