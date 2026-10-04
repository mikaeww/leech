// The Security tool's checks: passive, from what the page already sent (headers, cookies, requests, forms).
// Nothing is probed or sent. No DOM; tested in test/. A finding is { level, title, detail }, level one of
// high, medium, low, info.

const lower = headers => Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]))
const https = url => /^https:/i.test(url || '')
const find = (level, title, detail) => ({ level, title, detail })

// The CSP's directives as a map of name to its sources, lowercase.
function policy (csp) {
  const map = new Map()
  for (const part of (csp || '').split(';')) {
    const [name, ...sources] = part.trim().toLowerCase().split(/\s+/)
    if (name && !map.has(name)) map.set(name, sources)
  }
  return map
}

function cspFindings (csp) {
  if (!csp) return [find('medium', 'No Content-Security-Policy', 'Any script that gets into the page runs: nothing limits where scripts come from.')]
  const p = policy(csp)
  const scripts = p.get('script-src') || p.get('default-src')
  const out = []
  if (!scripts) out.push(find('medium', 'CSP doesn’t limit scripts', 'Neither script-src nor default-src is set.'))
  else {
    if (scripts.includes('\'unsafe-inline\'') && !scripts.some(s => s.startsWith('\'nonce-') || s.startsWith('\'sha'))) out.push(find('medium', 'CSP allows inline scripts', '\'unsafe-inline\' without a nonce or hash lets injected markup run script.'))
    if (scripts.includes('\'unsafe-eval\'')) out.push(find('low', 'CSP allows eval', '\'unsafe-eval\' lets strings run as code.'))
    if (scripts.some(s => s === '*' || s === 'http:' || s === 'https:' || s === 'data:')) out.push(find('medium', 'CSP allows scripts from anywhere', `script sources: ${scripts.join(' ')}`))
  }
  return out
}

/** What the main document's response headers say about the page at `url`. */
export function auditHeaders (headers, url) {
  const h = lower(headers)
  const out = []
  if (!https(url)) out.push(find('high', 'Served without TLS', 'Anyone on the way can read and change the page.'))
  else if (!h['strict-transport-security']) out.push(find('medium', 'No HSTS', 'The first visit by http can be taken over before the redirect.'))
  else {
    const age = Number(/max-age=(\d+)/i.exec(h['strict-transport-security'])?.[1] || 0)
    if (age < 15552000) out.push(find('low', 'Short HSTS', `max-age is ${age} s, under 180 days.`))
  }
  const csp = h['content-security-policy']
  out.push(...cspFindings(csp))
  if (!h['x-frame-options'] && !policy(csp).has('frame-ancestors')) out.push(find('medium', 'Can be framed', 'Neither X-Frame-Options nor frame-ancestors: open to clickjacking.'))
  if ((h['x-content-type-options'] || '').toLowerCase() !== 'nosniff') out.push(find('low', 'No nosniff', 'X-Content-Type-Options: nosniff is missing.'))
  if (!h['referrer-policy']) out.push(find('info', 'No Referrer-Policy', 'The browser’s default applies (strict-origin-when-cross-origin).'))
  for (const name of ['server', 'x-powered-by', 'x-aspnet-version']) {
    if (/\d/.test(h[name] || '')) out.push(find('low', `Version in ${name}`, h[name]))
  }
  const origin = h['access-control-allow-origin']
  if (origin === '*' && h['access-control-allow-credentials'] === 'true') out.push(find('high', 'CORS: any origin with credentials', 'Allow-Origin * together with Allow-Credentials true.'))
  else if (origin === '*') out.push(find('info', 'CORS: any origin', 'Access-Control-Allow-Origin: *'))
  return out
}

const SECRET = /sess|sid|token|auth|jwt|login|remember/i

/** One cookie (as the DevTools protocol gives it) on the page at `url`. */
export function auditCookie (cookie, url) {
  const out = []
  const name = cookie.name
  if (https(url) && !cookie.secure) out.push(find('medium', `${name}: not Secure`, 'It is also sent over plain http.'))
  if (!cookie.httpOnly && SECRET.test(name)) out.push(find('medium', `${name}: readable by script`, 'Looks like a session cookie but has no HttpOnly.'))
  if (cookie.sameSite === 'None' && !cookie.secure) out.push(find('medium', `${name}: SameSite=None without Secure`, 'Browsers refuse it, or send it everywhere.'))
  if (!cookie.sameSite) out.push(find('info', `${name}: no SameSite`, 'Treated as Lax by the browser.'))
  return out
}

/** Requests over http from a page served over https; scripts, frames and fetches are worse than pictures. */
export function auditMixed (url, requests) {
  if (!https(url)) return []
  const ACTIVE = new Set(['Script', 'Document', 'XHR', 'Fetch', 'WebSocket', 'Stylesheet'])
  return requests.filter(r => /^(http|ws):/i.test(r.url)).map(r =>
    find(ACTIVE.has(r.type) ? 'high' : 'medium', `Mixed content: ${r.type || 'request'}`, r.url))
}

/** Forms as the page reports them ({ action, method, password }) on the page at `url`. */
export function auditForms (url, forms) {
  const out = []
  for (const f of forms) {
    const action = f.action || url
    if (f.password && !https(action)) out.push(find('high', 'Password sent without TLS', `A password form posts to ${action}.`))
    else if (https(url) && /^http:/i.test(action)) out.push(find('high', 'Form posts to http', action))
    if (f.password && (f.method || 'get').toLowerCase() === 'get') out.push(find('medium', 'Password in the address', 'A password form uses GET, so the password lands in history and logs.'))
  }
  return out
}

/** The certificate and connection the page's document came over (the protocol's securityDetails), at time `now` in seconds. */
export function auditTLS (details, now) {
  if (!details) return []
  const out = []
  if (/^TLS 1\.[01]$|^SSL/.test(details.protocol)) out.push(find('high', `Old protocol: ${details.protocol}`, 'TLS 1.0 and 1.1 are broken and retired.'))
  const days = Math.floor((details.validTo - now) / 86400)
  if (days < 0) out.push(find('high', 'Certificate expired', `It ran out ${-days} days ago.`))
  else if (days < 14) out.push(find('medium', 'Certificate expires soon', `In ${days} days.`))
  out.push(find('info', `Certificate from ${details.issuer}`, `For ${details.subjectName}, valid until ${new Date(details.validTo * 1000).toISOString().slice(0, 10)}; ${details.protocol}, ${details.cipher}.`))
  return out
}

/** Scripts that name a source map: not fetched here, only said, since a reachable map shows the original source. */
export function auditSourceMaps (maps) {
  if (!maps.length) return []
  return [find('low', `${maps.length} ${maps.length === 1 ? 'script names' : 'scripts name'} a source map`, `If served, the original source is readable: ${maps.slice(0, 3).join(', ')}${maps.length > 3 ? ', …' : ''}`)]
}

const RANK = { high: 0, medium: 1, low: 2, info: 3 }
/** Worst first. */
export const ranked = findings => [...findings].sort((a, b) => RANK[a.level] - RANK[b.level])
