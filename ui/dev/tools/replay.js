// A request sent again from the page, and the same request as a curl command. No DOM; tested in test/.
// A replay leaves out the headers fetch may not set (the browser sets those itself); curl gets them all.
const FORBIDDEN = /^(accept-charset|accept-encoding|access-control-request-.*|connection|content-length|cookie|cookie2|date|dnt|expect|host|keep-alive|origin|referer|te|trailer|transfer-encoding|upgrade|via|user-agent|sec-.*|proxy-.*|:.*)$/i

/** The expression that sends `req` from the page with its cookies and answers the status or the error. */
export function replayScript ({ method, url, headers = {}, body }) {
  const kept = Object.fromEntries(Object.entries(headers).filter(([name]) => !FORBIDDEN.test(name)))
  const init = { method, headers: kept, credentials: 'include' }
  if (body && !/^(GET|HEAD)$/i.test(method)) init.body = body
  return `fetch(${JSON.stringify(url)}, ${JSON.stringify(init)}).then(r => r.status, e => String(e))`
}

const quote = s => `'${String(s).replace(/'/g, '\'\\\'\'')}'`

/** The request as a shell command; HTTP/2 pseudo-headers (":authority") aren't headers to curl. */
export function curlOf ({ method, url, requestHeaders = {} }, body) {
  const parts = ['curl', quote(url)]
  if (method !== 'GET') parts.push('-X', method)
  for (const [name, value] of Object.entries(requestHeaders)) if (!name.startsWith(':')) parts.push('-H', quote(`${name}: ${value}`))
  if (body) parts.push('--data-raw', quote(body))
  return parts.join(' ')
}
