import { host } from './address.js'

export const ENGINES = [
  ['google', 'Google', 'https://www.google.com/search?q=%s&sourceid=chrome&ie=UTF-8'],
  ['duckduckgo', 'DuckDuckGo', 'https://duckduckgo.com/?q=%s'],
  ['bing', 'Bing', 'https://www.bing.com/search?q=%s'],
  ['ecosia', 'Ecosia', 'https://www.ecosia.org/search?q=%s'],
  ['startpage', 'Startpage', 'https://www.startpage.com/sp/search?query=%s'],
  ['kagi', 'Kagi', 'https://kagi.com/search?q=%s'],
  ['brave', 'Brave Search', 'https://search.brave.com/search?q=%s'],
  ['qwant', 'Qwant', 'https://www.qwant.com/?q=%s']
]

/** A custom template counts only if it is http(s), holds %s, and %s isn't part of the host. */
function customHost (template) {
  const t = template.trim()
  if (!t.includes('%s') || !/^https?:\/\//i.test(t)) return null
  const a = host(t.replace('%s', 'a'))
  const b = host(t.replace('%s', 'b'))
  return a && a === b ? a : null
}

const find = id => ENGINES.find(e => e[0] === id) || ENGINES[0]

export function template (id, custom = '') {
  if (id === 'custom' && customHost(custom)) return custom.trim()
  return find(id)[2]
}

export function name (id, custom = '') {
  if (id === 'custom') {
    const h = customHost(custom)
    if (h) return h.replace(/^www\./, '')
  }
  return find(id)[1]
}

export function searchURL (text, tmpl) {
  const words = text.trim()
  if (!words) return null
  const escaped = [...new TextEncoder().encode(words)]
    .map(b => /[A-Za-z0-9\-._~]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '%' + b.toString(16).toUpperCase().padStart(2, '0'))
    .join('')
  return tmpl.replace('%s', escaped)
}
