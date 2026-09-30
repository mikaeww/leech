// What every cookie jar gets: Chrome's headers, the shield, permission questions; session cookies kept.
const { app, ipcMain, session } = require('electron')
const { read, write } = require('./store.js')
const { state, send } = require('./window.js')
const { download } = require('./downloads.js')

const PARTITION = 'persist:leech'
// ---- what the UI decides and main applies ----

const config = { downloads: '', ask: false, shield: true, paused: [], capture: {} }
ipcMain.on('configure', (_, next) => { Object.assign(config, next) })
ipcMain.handle('forget-partition', async (_, partition) => {
  const ses = session.fromPartition(partition)
  await ses.clearStorageData()
  await ses.clearCache()
  return true
})
ipcMain.handle('clear', async (_, what) => {
  const ses = session.fromPartition(PARTITION)
  if (what === 'cookies') await ses.clearStorageData()
  if (what === 'cache') await ses.clearCache()
  return true
})

// ---- the shield: Search's own list of ad and tracking hosts, blocked as third parties ----

const BLOCKED = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'googletagservices.com',
  'google-analytics.com', 'googletagmanager.com', 'adservice.google.com', 'amazon-adsystem.com', 'adnxs.com',
  'adsrvr.org', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'casalemedia.com', 'smartadserver.com', 'sharethrough.com', 'indexww.com', 'bidswitch.net',
  '33across.com', 'teads.tv', 'moatads.com', 'adroll.com', 'scorecardresearch.com', 'quantserve.com',
  'chartbeat.com', 'hotjar.com', 'mouseflow.com', 'fullstory.com', 'clarity.ms', 'mixpanel.com', 'amplitude.com',
  'segment.com', 'segment.io', 'branch.io', 'appsflyer.com', 'adjust.com', 'analytics.tiktok.com',
  'connect.facebook.net', 'ads-twitter.com', 'analytics.twitter.com']
const HIDDEN = '.adsbygoogle, ins.adsbygoogle, [id^="google_ads_"], [id^="div-gpt-ad"], [id^="taboola-"], #taboola-below-article, ' +
  'iframe[src*="doubleclick.net"], iframe[src*="googlesyndication"], iframe[src*="amazon-adsystem"] { display: none !important; }'

const hostOf = url => { try { return new URL(url).hostname.toLowerCase() } catch { return '' } }
const under = (host, domain) => host === domain || host.endsWith('.' + domain)
// ponytail: last two labels as the site, so bbc.co.uk and x.co.uk count as one; a public-suffix list if that matters.
const site = host => host.split('.').slice(-2).join('.')
const shielding = pageHost => config.shield && !config.paused.includes(pageHost.replace(/^www\./, ''))

function shield (ses) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const host = hostOf(details.url)
    const page = hostOf(details.webContents?.getURL() || details.referrer || '')
    const blocked = page && shielding(page) && site(host) !== site(page) && BLOCKED.some(d => under(host, d))
    callback({ cancel: blocked })
  })
}

// ---- permissions: asked once per host and kind, in the UI's bottom bar ----

const ASKABLE = { media: 'camera or microphone', geolocation: 'location', notifications: 'notifications', midi: 'MIDI devices', 'display-capture': 'screen' }
const QUIET = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'window-management'])
const asking = new Map()
let asked = 0
ipcMain.on('answer', (_, id, allow) => {
  asking.get(id)?.(allow)
  asking.delete(id)
})

function setUpSession (ses) {
  // Chromium always sends its client hints; one without them reads as a bot to Google. Electron sends none.
  // The brands match what navigator.userAgentData tells the page's scripts, so the two never disagree.
  const major = process.versions.chrome.split('.')[0]
  const hints = {
    'sec-ch-ua': `"Not?A_Brand";v="24", "Chromium";v="${major}"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"'
  }
  const languages = app.getPreferredSystemLanguages().filter(l => /^[a-z]{2}(-[A-Z]{2})?$/.test(l))
  const accept = [...new Set([...languages.flatMap(l => [l, l.split('-')[0]]), 'en-US', 'en'])]
  ses.setUserAgent(app.userAgentFallback, accept.join(','))
  const spell = ses.availableSpellCheckerLanguages
  ses.setSpellCheckerLanguages(accept.filter(l => spell.includes(l)).slice(0, 3))
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://*/*'] }, (details, callback) => {
    if (config.brands) hints['sec-ch-ua'] = config.brands
    callback({ requestHeaders: { ...details.requestHeaders, ...hints } })
  })
  shield(ses)
  ses.on('will-download', (_, item) => download(item, config))
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (QUIET.has(permission)) return callback(true)
    const thing = ASKABLE[permission]
    if (!thing || !state.win) return callback(false)
    const host = hostOf(details.requestingUrl).replace(/^www\./, '')
    const key = `${host}|${permission}`
    if (key in config.capture) return callback(config.capture[key])
    // One question at a time; a second one while the first is open is refused.
    if (asking.size) return callback(false)
    const id = ++asked
    asking.set(id, allow => {
      config.capture[key] = allow
      send('remember', key, allow)
      callback(allow)
    })
    state.win.webContents.send('ask', id, host || 'This page', thing)
  })
}

// ---- session cookies: kept across a restart, as Chrome does when it brings the tabs back ----

async function keepSessionCookies () {
  const ses = session.fromPartition(PARTITION)
  const all = await ses.cookies.get({})
  write('session-cookies', all.filter(c => c.session).map(({ name, value, domain, path, secure, httpOnly, sameSite, hostOnly }) =>
    ({ name, value, domain, path, secure, httpOnly, sameSite, hostOnly })))
}

async function restoreSessionCookies () {
  const ses = session.fromPartition(PARTITION)
  for (const c of read('session-cookies') || []) {
    const host = c.domain.replace(/^\./, '')
    await ses.cookies.set({
      url: `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`,
      name: c.name, value: c.value, path: c.path, secure: c.secure, httpOnly: c.httpOnly,
      sameSite: c.sameSite === 'unspecified' ? undefined : c.sameSite,
      ...(c.hostOnly ? {} : { domain: c.domain })
    }).catch(() => {})
  }
}

module.exports = { PARTITION, config, hostOf, shielding, HIDDEN, setUpSession, keepSessionCookies, restoreSessionCookies }
