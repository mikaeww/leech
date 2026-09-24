// Runs in every page's isolated world: reports how far down the page is, once per frame at most.
const { ipcRenderer } = require('electron')

let queued = false
function send () {
  queued = false
  const max = document.documentElement.scrollHeight - window.innerHeight
  ipcRenderer.sendToHost('scroll', max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0)
}
window.addEventListener('scroll', () => {
  if (!queued) { queued = true; requestAnimationFrame(send) }
}, { passive: true, capture: true })
