// Every page: popups, its right-click menu, the hidden-elements sheet, the picture it sleeps on.
const { clipboard, ipcMain, screen, webContents } = require('electron')
const { read, write } = require('./store.js')
const { state, send } = require('./window.js')
const { bare } = require('./vault.js')
const { hostOf, shielding, HIDDEN } = require('./session.js')

function guest (contents) {
  contents.setWindowOpenHandler(({ url, disposition, features }) => {
    // A popup with a size (sign-in windows) keeps its opener; links to new tabs become tabs.
    if (disposition === 'new-window' && features) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true } }
    }
    send('open-tab', url, disposition !== 'background-tab')
    return { action: 'deny' }
  })
  contents.on('context-menu', (_, p) => pageMenu(contents, p))
  contents.on('dom-ready', () => {
    if (shielding(hostOf(contents.getURL()))) contents.insertCSS(HIDDEN).catch(() => {})
  })
}

// The page's right-click menu is drawn by the UI, like every other menu, so it looks the same on any desktop.
const pageActions = new Map()
ipcMain.on('page-menu', (_, id) => { pageActions.get(id)?.(); pageActions.clear() })

function pageMenu (contents, p) {
  const tab = (url, fg) => send('open-tab', url, fg)
  const items = []
  let n = 0
  const add = (label, run, enabled = true, keys) => {
    const id = `p${n++}`
    pageActions.set(id, run)
    items.push({ id, label, enabled, keys })
  }
  const rule = () => { if (items.length && items[items.length - 1] !== '-') items.push('-') }
  pageActions.clear()
  if (p.linkURL) {
    add('Open Link in New Tab', () => tab(p.linkURL, false))
    add('Copy Link', () => clipboard.writeText(p.linkURL))
    rule()
  }
  if (p.mediaType === 'image' && p.srcURL) {
    add('Open Image in New Tab', () => tab(p.srcURL, true))
    add('Copy Image', () => contents.copyImageAt(p.x, p.y))
    add('Copy Image Address', () => clipboard.writeText(p.srcURL))
    add('Download Image', () => contents.downloadURL(p.srcURL))
    rule()
  }
  if (p.misspelledWord) {
    for (const word of p.dictionarySuggestions.slice(0, 4)) add(word, () => contents.replaceMisspelling(word))
    rule()
  }
  if (p.isEditable) {
    add('Cut', () => contents.cut(), p.editFlags.canCut)
    add('Copy', () => contents.copy(), p.editFlags.canCopy)
    add('Paste', () => contents.paste(), p.editFlags.canPaste)
    add('Select All', () => contents.selectAll())
    rule()
  } else if (p.selectionText.trim()) {
    const words = p.selectionText.trim()
    add('Copy', () => contents.copy())
    add(`Search for “${words.length > 32 ? words.slice(0, 30) + '…' : words}”`, () => send('search', words))
    rule()
  }
  if (!p.linkURL && !p.isEditable && !p.selectionText.trim() && p.mediaType === 'none') {
    add('Back', () => contents.navigationHistory.goBack(), contents.navigationHistory.canGoBack())
    add('Forward', () => contents.navigationHistory.goForward(), contents.navigationHistory.canGoForward())
    add('Reload', () => contents.reload())
    rule()
  }
  add('Inspect Element', () => contents.inspectElement(p.x, p.y))
  // Where the pointer really is in the window: the page's own coordinates don't know about zoom or the frame around it.
  const cursor = screen.getCursorScreenPoint()
  const box = state.win?.getContentBounds()
  send('page-menu', items, cursor.x - (box?.x || 0), cursor.y - (box?.y || 0))
}

// hidden.json: {host: [{selector, label, note, date}]}, one rule per selector so a bad one can't spoil the rest.

let hidden = read('hidden') || {}
const veilCSS = host => (hidden[bare(host)] || []).map(e => `${e.selector} { display: none !important; }`).join('\n')
function veilChanged (host) {
  write('hidden', hidden)
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview' && bare(hostOf(contents.getURL())) === bare(host)) contents.send('veil-css', veilCSS(host))
  }
  send('hidden', bare(host), hidden[bare(host)] || [])
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

ipcMain.handle('snapshot', async (_, id) => {
  const contents = webContents.fromId(id)
  if (!contents) return null
  const image = await contents.capturePage()
  return image.isEmpty() ? null : `data:image/jpeg;base64,${image.toJPEG(55).toString('base64')}`
})

module.exports = { guest }
