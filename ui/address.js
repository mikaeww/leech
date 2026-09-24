const OURS = ['http', 'https', 'file', 'about', 'data', 'view-source']

function looksLikeHost (host) {
  if (host === 'localhost') return true
  const labels = host.split('.')
  if (labels.length === 4 && labels.every(l => /^\d{1,3}$/.test(l) && Number(l) <= 255)) return true
  if (labels.length < 2) return false
  if (!labels.every(l => l && !l.startsWith('-') && !l.endsWith('-') && /^[\p{L}\p{N}-]+$/u.test(l))) return false
  // Ending in digits is a version number, not a domain.
  const tld = labels[labels.length - 1]
  return [...tld].length >= 2 && /^\p{L}+$/u.test(tld)
}

/** What was typed, as a URL — or null if it can't be a place. */
export function toURL (typed) {
  const text = typed.trim()
  if (!text || text.includes(' ')) return null
  const lower = text.toLowerCase()
  if (/^(about|data|view-source):/.test(lower)) return text
  const split = text.indexOf('://')
  if (split >= 0) return OURS.includes(lower.slice(0, split)) ? text : null
  const head = text.split(/[/?#]/)[0]
  if (head.includes('@')) return null
  const host = head.split(':')[0].toLowerCase()
  if (!looksLikeHost(host)) return null
  // A local server almost never has a certificate.
  const local = host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' ||
    host === '0.0.0.0' || host.startsWith('192.168.') || host.startsWith('10.')
  return (local ? 'http://' : 'https://') + text
}

export function host (url) {
  try { return new URL(url).hostname.toLowerCase() || null } catch { return null }
}

export function bareHost (url) {
  const h = host(url)
  return h && h.startsWith('www.') ? h.slice(4) : h
}

/** Host without www, plus the path unless it is just "/". */
export function pretty (url) {
  let u
  try { u = new URL(url) } catch { return url }
  if (!u.hostname) return url
  const bare = u.hostname.replace(/^www\./, '')
  const path = decodeURI(u.pathname)
  return !path || path === '/' ? bare : bare + path
}

export const isWeb = url => /^https?:\/\//i.test(url || '')
