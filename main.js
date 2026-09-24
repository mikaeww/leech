const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeTheme, session, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// LEECH_DATA_DIR sends the Chromium profile and Leech's own files to a throwaway folder, for tests.
const dataDir = process.env.LEECH_DATA_DIR ||
  path.join(process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local/share'), 'leech')
app.setPath('userData', dataDir)
app.setName('Leech')
// Google treats an "Electron/…" user agent as a robot or an unsafe browser; look like plain Chrome.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|leech|Leech)\/\S+/g, '')

const PARTITION = 'persist:leech'
let win = null
// Esc belongs to the page unless something of Leech's is open over it.
let escapable = false

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
ipcMain.on('escapable', (_, on) => { escapable = on })
ipcMain.on('look', (_, look) => { nativeTheme.themeSource = look })
ipcMain.on('open-external', (_, url) => shell.openExternal(url))
ipcMain.on('copy', (_, text) => clipboard.writeText(text))
ipcMain.handle('paste', () => clipboard.readText())

// A native menu built from [{id, label, checked?, enabled?} | '-'] entries; resolves to the chosen id.
ipcMain.handle('menu', (event, items) => new Promise(resolve => {
  let chosen = null
  const template = items.map(item => item === '-'
    ? { type: 'separator' }
    : { label: item.label, enabled: item.enabled !== false, click: () => { chosen = item.id } })
  Menu.buildFromTemplate(template).popup({ window: win, callback: () => setTimeout(() => resolve(chosen), 0) })
}))

// ---- keys: taken before the page, then handed to the UI ----

const SHORTCUTS = [
  ['ctrl+t', 'new-tab'], ['ctrl+shift+t', 'reopen'], ['ctrl+w', 'close-tab'], ['ctrl+shift+n', 'new-tab'],
  ['ctrl+l', 'edit'], ['alt+d', 'edit'], ['f6', 'edit'], ['ctrl+k', 'summon'],
  ['ctrl+r', 'reload'], ['f5', 'reload'], ['ctrl+shift+r', 'reload-hard'],
  ['ctrl+[', 'back'], ['ctrl+]', 'forward'], ['alt+arrowleft', 'back'], ['alt+arrowright', 'forward'],
  ['ctrl+tab', 'next-tab'], ['ctrl+shift+tab', 'previous-tab'], ['ctrl+pagedown', 'next-tab'], ['ctrl+pageup', 'previous-tab'],
  ['ctrl+shift+]', 'next-tab'], ['ctrl+shift+[', 'previous-tab'], ['ctrl+shift+}', 'next-tab'], ['ctrl+shift+{', 'previous-tab'],
  ['ctrl+d', 'duplicate'], ['ctrl+alt+c', 'copy-address'], ['ctrl+shift+v', 'paste-and-go'],
  ['ctrl+f', 'find'], ['ctrl+g', 'find-next'], ['ctrl+shift+g', 'find-previous'], ['f3', 'find-next'],
  ['ctrl+shift+s', 'toggle-sidebar'], ['ctrl+s', 'fold'], ['ctrl+shift+m', 'mute'],
  ['ctrl+=', 'zoom-in'], ['ctrl++', 'zoom-in'], ['ctrl+shift++', 'zoom-in'], ['ctrl+-', 'zoom-out'], ['ctrl+0', 'zoom-reset'],
  ['ctrl+shift+i', 'inspect'], ['f12', 'inspect'], ['ctrl+p', 'print'], ['ctrl+q', 'quit'],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [`ctrl+${n}`, `tab-${n}`])
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
      : shortcutMap.get(chord(input))
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

// Asked once per host and kind for this launch; the bottom-bar question of the original comes later.
const answers = new Map()
const ASKABLE = { media: 'camera or microphone', geolocation: 'location', notifications: 'notifications', midi: 'MIDI devices', 'display-capture': 'screen' }
const QUIET = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'window-management'])

function setUpSession () {
  const ses = session.fromPartition(PARTITION)
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
  ses.on('will-download', (_, item) => {
    const target = unique(app.getPath('downloads'), item.getFilename())
    item.setSavePath(target)
    win?.webContents.send('toast', `Downloading ${path.basename(target)}`)
    item.once('done', (_, state) => {
      win?.webContents.send('toast', state === 'completed' ? `Saved ${path.basename(target)}` : 'Download failed')
    })
  })
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (QUIET.has(permission)) return callback(true)
    const thing = ASKABLE[permission]
    if (!thing || !win) return callback(false)
    let host = ''
    try { host = new URL(details.requestingUrl).hostname } catch {}
    const key = `${host}|${permission}`
    if (answers.has(key)) return callback(answers.get(key))
    dialog.showMessageBox(win, {
      type: 'question', buttons: ['Allow', 'Don’t Allow'], defaultId: 0, cancelId: 1,
      message: `${host || 'This page'} wants to use your ${thing}`
    }).then(({ response }) => {
      answers.set(key, response === 0)
      callback(response === 0)
    })
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
    setUpSession()
    createWindow()
    win.webContents.once('did-finish-load', () => {
      for (const url of incoming) win.webContents.send('open-tab', url, true)
    })
  })
  app.on('window-all-closed', () => app.quit())
}
