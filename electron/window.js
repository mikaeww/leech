// The one frameless window and what the UI asks of it.
const { BrowserWindow, app, clipboard, dialog, ipcMain, nativeTheme, shell } = require('electron')
const { execFile } = require('node:child_process')
const path = require('node:path')
const { read, write } = require('./store.js')

// Esc belongs to the page unless something of Leech's is open over it.
const state = { win: null, escapable: false, veiling: false }
const send = (channel, ...args) => state.win?.webContents.send(channel, ...args)

ipcMain.handle('confirm', async (_, message, detail, action) => {
  const { response } = await dialog.showMessageBox(state.win, { type: 'question', message, detail, buttons: [action, 'Cancel'], defaultId: 1, cancelId: 1 })
  return response === 0
})

ipcMain.on('window', (_, what) => {
  if (!state.win) return
  if (what === 'close') state.win.close()
  if (what === 'minimize') state.win.minimize()
  if (what === 'maximize') state.win.isMaximized() ? state.win.unmaximize() : state.win.maximize()
  if (what === 'fullscreen') state.win.setFullScreen(!state.win.isFullScreen())
})
ipcMain.on('escapable', (_, on, veil) => { state.escapable = on; state.veiling = !!veil })
ipcMain.on('look', (_, look) => { nativeTheme.themeSource = look })
ipcMain.on('open-external', (_, url) => shell.openExternal(url))
ipcMain.on('copy', (_, text) => clipboard.writeText(text))
ipcMain.handle('paste', () => clipboard.readText())
ipcMain.handle('choose-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(state.win, { properties: ['openFile'] })
  return canceled ? null : filePaths[0]
})
ipcMain.handle('choose-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(state.win, { properties: ['openDirectory', 'createDirectory'] })
  return canceled ? null : filePaths[0]
})
const DESKTOP = 'dev.mikaeww.Leech.desktop'
const run = (command, args) => new Promise(resolve => execFile(command, args, (err, out, stderr) => {
  if (err) console.error(`${command} ${args.join(' ')}: ${stderr.trim() || err.message}`)
  resolve(err ? null : out)
}))
// xdg-settings leaves application/xhtml+xml to whoever had it; the answer is what get says afterwards.
ipcMain.handle('default-browser', async (_, make) => {
  if (make && await run('xdg-settings', ['set', 'default-web-browser', DESKTOP]) !== null) await run('xdg-mime', ['default', DESKTOP, 'application/xhtml+xml'])
  return (await run('xdg-settings', ['get', 'default-web-browser']))?.trim() === DESKTOP
})

ipcMain.on('info', event => { event.returnValue = { version: app.getVersion(), home: app.getPath('home'), downloads: app.getPath('downloads') } })

function createWindow () {
  const bounds = read('window') || {}
  state.win = new BrowserWindow({
    width: bounds.width || 1180,
    height: bounds.height || 780,
    minWidth: 640,
    minHeight: 420,
    frame: false,
    show: false,
    title: 'Leech',
    icon: path.join(__dirname, '../assets/leech.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1c' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload/window.js'),
      webviewTag: true,
      spellcheck: false
    }
  })
  if (bounds.maximized) state.win.maximize()
  state.win.once('ready-to-show', () => state.win.show())
  state.win.on('close', () => {
    const { width, height } = state.win.getNormalBounds()
    write('window', { width, height, maximized: state.win.isMaximized() })
    state.win.webContents.send('flush')
  })
  state.win.on('closed', () => { state.win = null })
  state.win.on('focus', () => state.win.webContents.send('active', true))
  state.win.on('blur', () => state.win.webContents.send('active', false))
  state.win.on('maximize', () => state.win.webContents.send('maximized', true))
  state.win.on('unmaximize', () => state.win.webContents.send('maximized', false))
  state.win.on('enter-full-screen', () => state.win.webContents.send('fullscreen', true))
  state.win.on('leave-full-screen', () => state.win.webContents.send('fullscreen', false))
  state.win.loadFile(path.join(__dirname, '../ui/index.html'))
}

module.exports = { state, send, createWindow }
