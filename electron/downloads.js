// Downloads: saved without asking unless told to, listed in downloads.json, one ring for all that run.
const { app, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { kindOf } = require('../ui/places/sorting/kinds.js')
const { read, write } = require('./store.js')
const { send } = require('./window.js')

function unique (dir, name) {
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  let candidate = path.join(dir, name)
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(dir, `${stem} ${n}${ext}`)
  return candidate
}

let loot = read('downloads') || []
const sendLoot = () => send('downloads', loot)
ipcMain.handle('downloads', () => loot)
ipcMain.on('downloads:open', (_, file) => shell.openPath(file))
ipcMain.on('downloads:show', (_, file) => shell.showItemInFolder(file))
ipcMain.on('downloads:remove', (_, file) => { loot = loot.filter(d => d.path !== file); write('downloads', loot); sendLoot() })
ipcMain.on('downloads:clear', () => { loot = []; write('downloads', loot); sendLoot() })

// All running downloads as one fraction, for the ring around the downloads door.
const running = new Set()
function progress () {
  let got = 0
  let total = 0
  for (const item of running) { got += item.getReceivedBytes(); total += item.getTotalBytes() }
  send('download-progress', running.size, total ? got / total : null)
}

// Sorted: the folder of its kind under the downloads folder.
function sorted (dir, name) {
  const folder = path.join(dir, kindOf(name))
  fs.mkdirSync(folder, { recursive: true })
  return folder
}

function download (item, config) {
  const dir = config.downloads || app.getPath('downloads')
  const from = (() => { try { return new URL(item.getURL()).hostname.replace(/^www\./, '') } catch { return '' } })()
  if (config.ask) item.setSaveDialogOptions({ defaultPath: path.join(dir, item.getFilename()) })
  else item.setSavePath(unique(config.sort ? sorted(dir, item.getFilename()) : dir, item.getFilename()))
  send('toast', `Downloading ${item.getFilename()}`)
  running.add(item)
  item.on('updated', progress)
  item.once('done', () => { running.delete(item); progress() })
  item.once('done', (_, state) => {
    if (state !== 'completed') {
      if (state === 'interrupted') send('toast', 'Download failed')
      return
    }
    const file = item.getSavePath()
    loot = [{ name: path.basename(file), from, path: file, date: Date.now() / 1000 }, ...loot.filter(d => d.path !== file)].slice(0, 50)
    write('downloads', loot)
    sendLoot()
    send('toast', `Saved ${path.basename(file)}`)
  })
}

module.exports = { download }
