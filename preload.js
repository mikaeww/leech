const { contextBridge, ipcRenderer } = require('electron')

const on = channel => fn => ipcRenderer.on(channel, (_, ...args) => fn(...args))

contextBridge.exposeInMainWorld('leech', {
  read: name => ipcRenderer.invoke('store:read', name),
  write: (name, value) => ipcRenderer.send('store:write', name, value),
  writeNow: (name, value) => ipcRenderer.sendSync('store:write-sync', name, value),
  window: what => ipcRenderer.send('window', what),
  look: look => ipcRenderer.send('look', look),
  openExternal: url => ipcRenderer.send('open-external', url),
  copy: text => ipcRenderer.send('copy', text),
  paste: () => ipcRenderer.invoke('paste'),
  menu: items => ipcRenderer.invoke('menu', items),
  escapable: on => ipcRenderer.send('escapable', on),
  onShortcut: on('shortcut'),
  onOpenTab: on('open-tab'),
  onSearch: on('search'),
  onToast: on('toast'),
  onFlush: on('flush'),
  onMaximized: on('maximized'),
  onFullscreen: on('fullscreen')
})
