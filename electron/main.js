// The Electron shell's entry: the older way to run the UI, kept for working on it without a Chromium build.
const { app, Menu, dialog, ipcMain, nativeTheme, session } = require('electron')
const fs = require('node:fs')
const { dataDir, read, write } = require('./store.js')

app.setPath('userData', dataDir)
// Chromium only picks the keyring by itself on a few desktops; Hyprland and friends would get plain text.
app.commandLine.appendSwitch('password-store', 'gnome-libsecret')
app.setName('Leech')
// Google treats an "Electron/…" user agent as a robot or an unsafe browser; look like plain Chrome.
app.userAgentFallback = app.userAgentFallback
  .replace(/ (Electron|leech|Leech)\/\S+/g, '')
  // The reduced form Chromium itself sends since the user-agent reduction.
  .replace(/Chrome\/(\d+)\.[\d.]+/, 'Chrome/$1.0.0.0')

const { state, send, createWindow } = require('./window.js')
const { watchKeys } = require('./keys.js')
const { guest } = require('./pages.js')
const { PARTITION, setUpSession, keepSessionCookies, restoreSessionCookies } = require('./session.js')

// ---- bringing things over, sign-ins ----

const importers = require('./importers.js')
const { Vault } = require('./vault.js')
let vault = null

ipcMain.handle('import:sources', () => importers.sources().map(s => s.name))
const source = name => importers.sources().find(s => s.name === name)
ipcMain.handle('import:bookmarks', (_, name) => importers.bookmarks(source(name)))
ipcMain.handle('import:history', (_, name) => importers.history(source(name)))
ipcMain.handle('import:csv', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(state.win, { filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] })
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

app.on('web-contents-created', (_, contents) => {
  watchKeys(contents)
  if (contents.getType() === 'webview') guest(contents)
})

let quitting = false
app.on('before-quit', event => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  keepSessionCookies().catch(() => {}).finally(() => app.quit())
})

const incoming = process.argv.slice(app.isPackaged ? 1 : 2).filter(a => /^(https?|file):/.test(a))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_, argv) => {
    if (!state.win) return
    for (const url of argv.filter(a => /^(https?|file):/.test(a))) send('open-tab', url, true)
    if (state.win.isMinimized()) state.win.restore()
    state.win.focus()
  })
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    const prefs = read('settings') || {}
    nativeTheme.themeSource = prefs.look || 'system'
    vault = new Vault(read, write)
    setUpSession(session.fromPartition(PARTITION))
    await restoreSessionCookies()
    app.on('session-created', ses => { if (ses !== session.defaultSession && ses !== session.fromPartition(PARTITION)) setUpSession(ses) })
    createWindow()
    state.win.webContents.once('did-finish-load', () => {
      for (const url of incoming) send('open-tab', url, true)
    })
  })
  app.on('window-all-closed', () => app.quit())
}
