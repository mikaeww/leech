import { bareHost, isWeb, pretty } from './address.js'

const DAY = 86400
const now = () => Date.now() / 1000

const frecency = (v, t) => v.count * Math.exp(-Math.max(0, (t - v.last) / DAY) / 30)

function strip (typed) {
  return typed.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')
}

function rank (key, needle) {
  if (key.startsWith(needle)) return 6
  const host = key.split('/')[0]
  const dot = host.indexOf('.')
  if (dot >= 0 && host.slice(dot + 1).startsWith(needle)) return 3
  // One letter matching inside a name turns "x" into netflix.com.
  if ([...needle].length >= 2 && host.includes(needle)) return 2
  return null
}

/** Visited places first, then famous ones nobody has visited yet; never more than `limit`. */
export function suggest (visits, typed, limit, t = now()) {
  const needle = strip(typed)
  if (!needle) return []
  const scored = []
  for (const v of visits.values()) {
    const r = rank(v.key, needle)
    if (r === null) continue
    scored.push([{ key: v.key, title: v.title, url: v.url, kind: 'visited' }, r + 4 + frecency(v, t) + (v.key.includes('/') ? 0 : 1.5)])
  }
  for (const [key, title] of KNOWN) {
    if (visits.has(key)) continue
    const r = rank(key, needle)
    if (r !== null) scored.push([{ key, title, url: `https://${key}`, kind: 'known' }, r])
  }
  scored.sort((a, b) => b[1] - a[1] || a[0].key.length - b[0].key.length)
  return scored.slice(0, limit).map(s => s[0])
}

/** The rest of the first offered key that starts with what was typed. */
export function completion (typed, offers) {
  const lower = typed.toLowerCase()
  if ([...lower].length < 2) return null
  const hit = offers.find(o => o.kind !== 'open' && o.kind !== 'search' && o.key.startsWith(lower))
  const rest = hit ? hit.key.slice(lower.length) : ''
  return rest || null
}

export class History {
  constructor (list = [], save = () => {}) {
    this.visits = new Map(list.map(v => [v.key, v]))
    this.save = save
    this.timer = null
  }

  record (url, title) {
    if (!isWeb(url)) return
    const key = pretty(url).toLowerCase()
    if (!key) return
    const t = now()
    // A deep page is also a visit to the site, so three letters offer the front door.
    if (key.includes('/')) {
      const root = bareHost(url)
      if (root) {
        const home = this.visits.get(root) || { url: `https://${root}/`, key: root, title: '', count: 0, last: t }
        home.count += 1
        home.last = t
        this.visits.set(root, home)
      }
    }
    const seen = this.visits.get(key) || { url, key, title: '', count: 0, last: t }
    seen.count += 1
    seen.last = t
    seen.url = url
    if (title) seen.title = title
    this.visits.set(key, seen)
    this.later()
  }

  retitle (url, title) {
    const seen = this.visits.get(pretty(url).toLowerCase())
    if (seen && title && seen.title !== title) {
      seen.title = title
      this.later()
    }
  }

  /** Where you have been, newest first, without the front-door credits that have no title of their own. */
  everything (typed = '') {
    const needle = typed.trim().toLowerCase()
    return [...this.visits.values()]
      .filter(v => v.title || v.key.includes('/'))
      .filter(v => !needle || v.key.includes(needle) || v.title.toLowerCase().includes(needle))
      .sort((a, b) => b.last - a.last)
  }

  forget (key) {
    this.visits.delete(key)
    this.later()
  }

  clear () {
    this.visits.clear()
    this.flush()
  }

  suggestions (typed, limit) {
    return suggest(this.visits, typed, limit)
  }

  later () {
    if (this.timer) return
    this.timer = setTimeout(() => { this.timer = null; this.flush() }, 1500)
  }

  list () {
    const t = now()
    return [...this.visits.values()].sort((a, b) => frecency(b, t) - frecency(a, t)).slice(0, 2000)
  }

  flush (now = false) {
    this.save(this.list(), now)
  }
}

const KNOWN = [
  ['google.com', 'Google'], ['mail.google.com', 'Gmail'], ['drive.google.com', 'Google Drive'],
  ['calendar.google.com', 'Google Calendar'], ['maps.google.com', 'Google Maps'], ['youtube.com', 'YouTube'],
  ['github.com', 'GitHub'], ['figma.com', 'Figma'], ['vercel.com', 'Vercel'], ['notion.so', 'Notion'],
  ['linear.app', 'Linear'], ['slack.com', 'Slack'], ['discord.com', 'Discord'], ['x.com', 'X'],
  ['linkedin.com', 'LinkedIn'], ['instagram.com', 'Instagram'], ['reddit.com', 'Reddit'],
  ['news.ycombinator.com', 'Hacker News'], ['stackoverflow.com', 'Stack Overflow'], ['claude.ai', 'Claude'],
  ['chatgpt.com', 'ChatGPT'], ['dribbble.com', 'Dribbble'], ['behance.net', 'Behance'],
  ['awwwards.com', 'Awwwards'], ['mobbin.com', 'Mobbin'], ['are.na', 'Are.na'], ['pinterest.com', 'Pinterest'],
  ['framer.com', 'Framer'], ['webflow.com', 'Webflow'], ['archlinux.org', 'Arch Linux'],
  ['wiki.archlinux.org', 'ArchWiki'], ['aur.archlinux.org', 'AUR'], ['crates.io', 'crates.io'],
  ['docs.rs', 'Docs.rs'], ['npmjs.com', 'npm'], ['supabase.com', 'Supabase'], ['stripe.com', 'Stripe'],
  ['cloudflare.com', 'Cloudflare'], ['netlify.com', 'Netlify'], ['spotify.com', 'Spotify'],
  ['netflix.com', 'Netflix'], ['twitch.tv', 'Twitch'], ['wikipedia.org', 'Wikipedia'], ['deepl.com', 'DeepL'],
  ['amazon.de', 'Amazon'], ['ebay.de', 'eBay'], ['spiegel.de', 'Der Spiegel']
]
