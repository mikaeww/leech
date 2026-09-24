const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeTheme, session, shell, webContents } = require('electron')
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// LEECH_DATA_DIR sends the Chromium profile and Leech's own files to a throwaway folder, for tests.
const dataDir = process.env.LEECH_DATA_DIR ||
  path.join(process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local/share'), 'leech')
app.setPath('userData', dataDir)
// Chromium only picks the keyring by itself on a few desktops; Hyprland and friends would get plain text.
app.commandLine.appendSwitch('password-store', 'gnome-libsecret')
app.setName('Leech')
// Google treats an "Electron/…" user agent as a robot or an unsafe browser; look like plain Chrome.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|leech|Leech)\/\S+/g, '')

const PARTITION = 'persist:leech'
let win = null
// Esc belongs to the page unless something of Leech's is open over it.
let escapable = false
let veiling = false

// ---- files ----

const file = name => path.join(dataDir, `${name}.json`)

function read (name) {
  let text
  try { text = fs.readFileSync(file(name), 'utf8') } catch { return null }
  try { return JSON.parse(text) } catch (err) {
    console.error(`leech: ${name}.json is unreadable (${err.message}), moving it aside`)
    fs.renameSync(file(name), path.join(dataDir, `${name}.unreadable-${Math.floor(Date.now() / 1000)}.json`))
    return null
  }
}

function write (name, value) {
  fs.mkdirSync(dataDir, { recursive: true })
  const tmp = file(name) + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(value))
  fs.renameSync(tmp, file(name))
}

ipcMain.handle('store:read', (_, name) => read(name))
ipcMain.on('store:write', (_, name, value) => {
  try { write(name, value) } catch (err) { console.error(`leech: couldn't write ${name}.json: ${err.message}`) }
})
ipcMain.on('store:remove', (_, name) => fs.rm(file(name), { force: true }, () => {}))
ipcMain.handle('confirm', async (_, message, detail, action) => {
  const { response } = await dialog.showMessageBox(win, { type: 'question', message, detail, buttons: [action, 'Cancel'], defaultId: 1, cancelId: 1 })
  return response === 0
})
ipcMain.on('store:write-sync', (event, name, value) => {
  try { write(name, value) } catch (err) { console.error(`leech: couldn't write ${name}.json: ${err.message}`) }
  event.returnValue = true
})

// ---- window ----

ipcMain.on('window', (_, what) => {
  if (!win) return
  if (what === 'close') win.close()
  if (what === 'minimize') win.minimize()
  if (what === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
})
ipcMain.on('escapable', (_, on, veil) => { escapable = on; veiling = !!veil })
ipcMain.on('look', (_, look) => { nativeTheme.themeSource = look })
ipcMain.on('open-external', (_, url) => shell.openExternal(url))
ipcMain.on('copy', (_, text) => clipboard.writeText(text))
ipcMain.handle('paste', () => clipboard.readText())

// A native menu from [{id, label, enabled?, checked?, keys?, items?} | '-'] entries; resolves to the chosen id.
ipcMain.handle('menu', (event, items, at) => new Promise(resolve => {
  let chosen = null
  const build = list => list.map(item => item === '-'
    ? { type: 'separator' }
    : {
        label: item.label,
        enabled: item.enabled !== false,
        ...(item.checked !== undefined && { type: 'checkbox', checked: item.checked }),
        ...(item.keys && { accelerator: item.keys, registerAccelerator: false }),
        ...(item.items ? { submenu: build(item.items) } : { click: () => { chosen = item.id } })
      })
  Menu.buildFromTemplate(build(items)).popup({ window: win, ...(at || {}), callback: () => setTimeout(() => resolve(chosen), 0) })
}))

// ---- bringing things over, sign-ins, hidden elements ----

const importers = require('./importers.js')
const { Vault, bare } = require('./vault.js')
let vault = null

ipcMain.handle('import:sources', () => importers.sources().map(s => s.name))
const source = name => importers.sources().find(s => s.name === name)
ipcMain.handle('import:bookmarks', (_, name) => importers.bookmarks(source(name)))
ipcMain.handle('import:history', (_, name) => importers.history(source(name)))
ipcMain.handle('import:csv', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] })
  if (canceled) return null
  return vault.take(importers.csvLogins(fs.readFileSync(filePaths[0], 'utf8')))
})

ipcMain.handle('vault:ready', () => vault.ready)
ipcMain.handle('vault:list', () => vault.list())
ipcMain.handle('vault:matching', (_, host) => vault.matching(host))
ipcMain.handle('vault:reveal', (_, host, user) => vault.reveal(host, user))
ipcMain.handle('vault:question', (_, host, user, password) => vault.question(host, user, password))
ipcMain.handle('vault:save', (_, host, user, password) => vault.save(host, user, password))
ipcMain.handle('vault:forget', (_, host, user) => vault.forget(host, user))

// hidden.json: {host: [{selector, label, note, date}]}, one rule per selector so a bad one can't spoil the rest.
let hidden = read('hidden') || {}
const veilCSS = host => (hidden[bare(host)] || []).map(e => `${e.selector} { display: none !important; }`).join('\n')
function veilChanged (host) {
  write('hidden', hidden)
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview' && bare(hostOf(contents.getURL())) === bare(host)) contents.send('veil-css', veilCSS(host))
  }
  win?.webContents.send('hidden', bare(host), hidden[bare(host)] || [])
}
ipcMain.on('veil:css', (event, host) => { event.returnValue = veilCSS(host) })
ipcMain.handle('veil:list', (_, host) => hidden[bare(host)] || [])
ipcMain.on('veil:hide', (_, host, entry) => {
  const list = hidden[bare(host)] ||= []
  if (!list.some(e => e.selector === entry.selector)) list.push({ ...entry, date: Date.now() / 1000 })
  veilChanged(host)
})
ipcMain.on('veil:restore', (_, host, selector) => {
  hidden[bare(host)] = (hidden[bare(host)] || []).filter(e => e.selector !== selector)
  if (!hidden[bare(host)].length) delete hidden[bare(host)]
  veilChanged(host)
})
ipcMain.on('veil:undo', (_, host) => {
  hidden[bare(host)]?.pop()
  veilChanged(host)
})
ipcMain.on('veil:restore-all', (_, host) => { delete hidden[bare(host)]; veilChanged(host) })

// ---- keys: taken before the page, then handed to the UI ----

const SHORTCUTS = [
  ['ctrl+t', 'new-tab'], ['ctrl+shift+t', 'reopen'], ['ctrl+w', 'close-tab'], ['ctrl+shift+n', 'private-tab'],
  ['ctrl+l', 'edit'], ['alt+d', 'edit'], ['f6', 'edit'], ['ctrl+k', 'summon'],
  ['ctrl+r', 'reload'], ['f5', 'reload'], ['ctrl+f5', 'reload-hard'], ['shift+f5', 'reload-hard'],
  ['ctrl+shift+r', 'reader'], ['ctrl+shift+p', 'pip'],
  ['ctrl+[', 'back'], ['ctrl+]', 'forward'], ['alt+arrowleft', 'back'], ['alt+arrowright', 'forward'],
  ['ctrl+tab', 'next-tab'], ['ctrl+shift+tab', 'previous-tab'], ['ctrl+pagedown', 'next-tab'], ['ctrl+pageup', 'previous-tab'],
  ['ctrl+shift+]', 'next-tab'], ['ctrl+shift+[', 'previous-tab'], ['ctrl+shift+}', 'next-tab'], ['ctrl+shift+{', 'previous-tab'],
  ['ctrl+d', 'duplicate'], ['ctrl+alt+c', 'copy-address'], ['ctrl+shift+v', 'paste-and-go'],
  ['ctrl+f', 'find'], ['ctrl+g', 'find-next'], ['ctrl+shift+g', 'find-previous'], ['f3', 'find-next'],
  ['ctrl+shift+s', 'toggle-sidebar'], ['ctrl+s', 'fold'], ['ctrl+shift+m', 'mute'],
  ['ctrl+=', 'zoom-in'], ['ctrl++', 'zoom-in'], ['ctrl+shift++', 'zoom-in'], ['ctrl+-', 'zoom-out'], ['ctrl+0', 'zoom-reset'],
  ['ctrl+,', 'settings'], ['ctrl+h', 'history'], ['ctrl+y', 'history'], ['ctrl+j', 'downloads'],
  ['ctrl+shift+b', 'bookmark'], ['ctrl+shift+o', 'bookmarks'],
  ['ctrl+shift+h', 'veil'], ['ctrl+shift+u', 'hidden'],
  ['ctrl+shift+i', 'inspect'], ['f12', 'inspect'], ['ctrl+p', 'print'], ['ctrl+q', 'quit'],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [`ctrl+${n}`, `tab-${n}`]),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [`alt+${n}`, `space-${n}`])
]
const shortcutMap = new Map(SHORTCUTS)

function chord (input) {
  const parts = []
  if (input.control) parts.push('ctrl')
  if (input.alt) parts.push('alt')
  if (input.shift) parts.push('shift')
  // Digits by physical key so Ctrl+1 works on every layout (Shift+1 is "!" on most).
  const digit = /^Digit(\d)$/.exec(input.code)
  parts.push(digit ? digit[1] : input.key.toLowerCase())
  return parts.join('+')
}

app.on('web-contents-created', (_, contents) => {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !win) return
    const action = input.key === 'Escape' && !input.control && !input.alt && !input.shift
      ? (escapable ? 'escape' : null)
      : veiling && chord(input) === 'ctrl+z' ? 'veil-undo' : shortcutMap.get(chord(input))
    if (!action) return
    event.preventDefault()
    win.webContents.send('shortcut', action)
  })
  contents.on('before-mouse-event', (event, mouse) => {
    if (mouse.type !== 'mouseDown' || !win) return
    if (mouse.button === 'back' || mouse.button === 'forward') {
      event.preventDefault()
      win.webContents.send('shortcut', mouse.button)
    }
  })
  if (contents.getType() === 'webview') guest(contents)
})

// ---- pages ----

function guest (contents) {
  contents.setWindowOpenHandler(({ url, disposition, features }) => {
    // A popup with a size (sign-in windows) keeps its opener; links to new tabs become tabs.
    if (disposition === 'new-window' && features) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true } }
    }
    win?.webContents.send('open-tab', url, disposition !== 'background-tab')
    return { action: 'deny' }
  })
  contents.on('context-menu', (_, p) => pageMenu(contents, p))
  contents.on('dom-ready', () => {
    if (shielding(hostOf(contents.getURL()))) contents.insertCSS(HIDDEN).catch(() => {})
  })
}

function pageMenu (contents, p) {
  const tab = (url, fg) => win?.webContents.send('open-tab', url, fg)
  const items = []
  if (p.linkURL) {
    items.push(
      { label: 'Open Link in New Tab', click: () => tab(p.linkURL, false) },
      { label: 'Copy Link Address', click: () => clipboard.writeText(p.linkURL) },
      { type: 'separator' })
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: 'Open Image in New Tab', click: () => tab(p.srcURL, true) },
      { label: 'Copy Image', click: () => contents.copyImageAt(p.x, p.y) },
      { label: 'Copy Image Address', click: () => clipboard.writeText(p.srcURL) },
      { label: 'Download Image', click: () => contents.downloadURL(p.srcURL) },
      { type: 'separator' })
  }
  if (p.misspelledWord) {
    for (const word of p.dictionarySuggestions.slice(0, 4)) {
      items.push({ label: word, click: () => contents.replaceMisspelling(word) })
    }
    if (p.dictionarySuggestions.length) items.push({ type: 'separator' })
  }
  if (p.isEditable) {
    items.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy },
      { role: 'paste', enabled: p.editFlags.canPaste }, { role: 'selectAll' }, { type: 'separator' })
  } else if (p.selectionText.trim()) {
    const words = p.selectionText.trim().slice(0, 40)
    items.push({ role: 'copy' },
      { label: `Search for “${words}”`, click: () => win?.webContents.send('search', p.selectionText.trim()) },
      { type: 'separator' })
  }
  if (!p.linkURL && !p.isEditable && !p.selectionText.trim() && p.mediaType === 'none') {
    items.push(
      { label: 'Back', enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() },
      { label: 'Forward', enabled: contents.navigationHistory.canGoForward(), click: () => contents.navigationHistory.goForward() },
      { label: 'Reload', click: () => contents.reload() },
      { type: 'separator' })
  }
  items.push({ label: 'Inspect Element', click: () => contents.inspectElement(p.x, p.y) })
  Menu.buildFromTemplate(items).popup({ window: win })
}

function unique (dir, name) {
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  let candidate = path.join(dir, name)
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(dir, `${stem} ${n}${ext}`)
  return candidate
}

// ---- what the UI decides and main applies ----

let config = { downloads: '', ask: false, shield: true, paused: [], capture: {} }
ipcMain.on('configure', (_, next) => { config = { ...config, ...next } })

ipcMain.handle('choose-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
  return canceled ? null : filePaths[0]
})
ipcMain.handle('default-browser', (_, make) => new Promise(resolve => {
  const desktop = 'dev.mikaeww.Leech.desktop'
  const args = make ? ['set', 'default-web-browser', desktop] : ['get', 'default-web-browser']
  execFile('xdg-settings', args, (err, out) => resolve(!err && (make || out.trim() === desktop)))
}))
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
ipcMain.handle('snapshot', async (_, id) => {
  const contents = webContents.fromId(id)
  if (!contents) return null
  const image = await contents.capturePage()
  return image.isEmpty() ? null : `data:image/jpeg;base64,${image.toJPEG(55).toString('base64')}`
})
ipcMain.on('info', event => { event.returnValue = { version: app.getVersion(), home: app.getPath('home'), downloads: app.getPath('downloads') } })

// ---- downloads ----

let loot = read('downloads') || []
const sendLoot = () => win?.webContents.send('downloads', loot)
ipcMain.handle('downloads', () => loot)
ipcMain.on('downloads:open', (_, file) => shell.openPath(file))
ipcMain.on('downloads:show', (_, file) => shell.showItemInFolder(file))
ipcMain.on('downloads:remove', (_, file) => { loot = loot.filter(d => d.path !== file); write('downloads', loot); sendLoot() })
ipcMain.on('downloads:clear', () => { loot = []; write('downloads', loot); sendLoot() })

function download (item, contents) {
  const dir = config.downloads || app.getPath('downloads')
  const from = (() => { try { return new URL(item.getURL()).hostname.replace(/^www\./, '') } catch { return '' } })()
  if (config.ask) item.setSaveDialogOptions({ defaultPath: path.join(dir, item.getFilename()) })
  else item.setSavePath(unique(dir, item.getFilename()))
  win?.webContents.send('toast', `Downloading ${item.getFilename()}`)
  item.once('done', (_, state) => {
    if (state !== 'completed') {
      if (state === 'interrupted') win?.webContents.send('toast', 'Download failed')
      return
    }
    const file = item.getSavePath()
    loot = [{ name: path.basename(file), from, path: file, date: Date.now() / 1000 }, ...loot.filter(d => d.path !== file)].slice(0, 50)
    write('downloads', loot)
    sendLoot()
    win?.webContents.send('toast', `Saved ${path.basename(file)}`)
  })
}

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
  // Chrome always sends its client hints; a Chrome without them reads as a bot to Google. Electron sends none.
  const major = process.versions.chrome.split('.')[0]
  const hints = {
    'sec-ch-ua': `"Not)A;Brand";v="8", "Chromium";v="${major}", "Google Chrome";v="${major}"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"'
  }
  const languages = app.getPreferredSystemLanguages().filter(l => /^[a-z]{2}(-[A-Z]{2})?$/.test(l))
  const accept = [...new Set([...languages.flatMap(l => [l, l.split('-')[0]]), 'en-US', 'en'])]
  ses.setUserAgent(app.userAgentFallback, accept.join(','))
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://*/*'] }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, ...hints } })
  })
  shield(ses)
  ses.on('will-download', (_, item, contents) => download(item, contents))
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (QUIET.has(permission)) return callback(true)
    const thing = ASKABLE[permission]
    if (!thing || !win) return callback(false)
    const host = hostOf(details.requestingUrl).replace(/^www\./, '')
    const key = `${host}|${permission}`
    if (key in config.capture) return callback(config.capture[key])
    // One question at a time; a second one while the first is open is refused.
    if (asking.size) return callback(false)
    const id = ++asked
    asking.set(id, allow => {
      config.capture[key] = allow
      win?.webContents.send('remember', key, allow)
      callback(allow)
    })
    win.webContents.send('ask', id, host || 'This page', thing)
  })
}

// ---- app ----

function createWindow () {
  const bounds = read('window') || {}
  win = new BrowserWindow({
    width: bounds.width || 1180,
    height: bounds.height || 780,
    minWidth: 640,
    minHeight: 420,
    frame: false,
    show: false,
    title: 'Leech',
    icon: path.join(__dirname, 'data/leech.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1c' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      spellcheck: false
    }
  })
  if (bounds.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  win.on('close', () => {
    const { width, height } = win.getNormalBounds()
    write('window', { width, height, maximized: win.isMaximized() })
    win.webContents.send('flush')
  })
  win.on('closed', () => { win = null })
  win.on('maximize', () => win.webContents.send('maximized', true))
  win.on('unmaximize', () => win.webContents.send('maximized', false))
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false))
  win.loadFile(path.join(__dirname, 'ui/index.html'))
}

const incoming = process.argv.slice(app.isPackaged ? 1 : 2).filter(a => /^(https?|file):/.test(a))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_, argv) => {
    if (!win) return
    for (const url of argv.filter(a => /^(https?|file):/.test(a))) win.webContents.send('open-tab', url, true)
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    const prefs = read('settings') || {}
    nativeTheme.themeSource = prefs.look || 'system'
    vault = new Vault(read, write)
    setUpSession(session.fromPartition(PARTITION))
    app.on('session-created', ses => { if (ses !== session.defaultSession && ses !== session.fromPartition(PARTITION)) setUpSession(ses) })
    createWindow()
    win.webContents.once('did-finish-load', () => {
      for (const url of incoming) win.webContents.send('open-tab', url, true)
    })
  })
  app.on('window-all-closed', () => app.quit())
}
