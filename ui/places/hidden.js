// Hidden elements: per site, the boxes the picker took away, one rule per selector so a bad one can't spoil the
// rest. hidden.json is {host: [{selector, label, note, date}]}, hosts without www. No DOM, unit-tested.

export class Hidden {
  constructor (map = {}, save = () => {}) {
    this.map = map && typeof map === 'object' && !Array.isArray(map) ? map : {}
    for (const [host, list] of Object.entries(this.map)) {
      if (!Array.isArray(list) || !list.every(e => e && typeof e.selector === 'string')) delete this.map[host]
    }
    this.save = () => save(this.map)
  }

  on (host) {
    return this.map[host] || []
  }

  /** Adds a rule for `host`; the same selector twice stays one rule. */
  hide (host, { selector, label, note }, date) {
    const list = this.map[host] ||= []
    if (!list.some(e => e.selector === selector)) list.push({ selector, label, note, date })
    this.save()
  }

  restore (host, selector) {
    this.set(host, this.on(host).filter(e => e.selector !== selector))
  }

  /** Takes back the last rule added on `host`. */
  undo (host) {
    this.set(host, this.on(host).slice(0, -1))
  }

  restoreAll (host) {
    this.set(host, [])
  }

  set (host, list) {
    if (list.length) this.map[host] = list
    else delete this.map[host]
    this.save()
  }

  /** The stylesheet for `host`, leaving out `except` (the one being peeked at). */
  sheet (host, except = null) {
    return this.on(host).filter(e => e.selector !== except).map(e => `${e.selector} { display: none !important; }`).join('\n')
  }

  /** Every site's stylesheet, for pages the shells start before the UI hears of them. */
  sheets () {
    return Object.fromEntries(Object.keys(this.map).map(host => [host, this.sheet(host)]))
  }
}
