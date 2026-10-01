// The Chromium build's stand-in for Electron's ipcRenderer, run in front of page.js in each page's isolated
// world (chromium/leech/page/leech_guest.cc). `config` is the UI's last L.configure, put in by the browser.
/* global config */
globalThis.leechHost = (() => {
  const queue = []
  const listeners = new Map()
  let waiting = null
  const flush = () => {
    if (!waiting || !queue.length) return
    const take = waiting
    waiting = null
    take(queue.splice(0))
  }
  const bare = host => host.replace(/^www\./, '')
  const shields = host => !!config.shield && !(config.paused || []).includes(bare(host))
  // What Electron's main answers synchronously: this site's hidden elements, the shield's boxes.
  const SYNC = {
    'veil:css': host => config.sheets?.[bare(host)] || '',
    'shield:css': host => shields(host) ? config.hide || '' : ''
  }
  return {
    sendToHost (channel, ...args) { queue.push([channel, args]); flush() },
    on (channel, fn) { listeners.set(channel, [...listeners.get(channel) || [], fn]) },
    sendSync (channel, host) { return SYNC[channel]?.(host) ?? null },
    // From the UI, through the browser: what Electron's webview.send delivers.
    hear (channel, args) { for (const fn of listeners.get(channel) || []) fn(null, ...args) },
    // The browser's poll: settles once there is something to take, with all of it.
    next () { return new Promise(resolve => { waiting = resolve; flush() }) }
  }
})()
