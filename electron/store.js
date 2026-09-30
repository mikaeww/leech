// Leech's JSON files: atomic writes, and a file that fails to parse is moved aside, never overwritten.
const { app, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// LEECH_DATA_DIR sends the Chromium profile and Leech's own files to a throwaway folder, for tests.
const dataDir = process.env.LEECH_DATA_DIR ||
  path.join(process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local/share'), 'leech')

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
ipcMain.on('store:write-sync', (event, name, value) => {
  try { write(name, value) } catch (err) { console.error(`leech: couldn't write ${name}.json: ${err.message}`) }
  event.returnValue = true
})

module.exports = { dataDir, read, write }
