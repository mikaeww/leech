// A small Chrome DevTools Protocol client: enough to run code in Leech's window, press keys and take pictures.
import fs from 'node:fs'

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Connects to the target whose address matches, once it exists (up to 15 s); a tab's page is a webview in Electron. */
export async function connect (port, matches, types = ['page']) {
  let target = null
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      target = list.find(t => types.includes(t.type) && matches(t.url))
    } catch {
      // The debugger isn't listening yet; try again.
    }
    if (!target) await sleep(250)
  }
  if (!target) throw new Error(`no page target on port ${port}`)
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
  return { ...client(ws), port }
}

function client (ws) {
  let next = 0
  const waiting = new Map()
  ws.addEventListener('message', m => {
    const d = JSON.parse(m.data)
    if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id) }
  })
  const send = (method, params = {}) => new Promise(resolve => {
    const id = ++next
    waiting.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
  return {
    send,
    /** Runs the body as an async function in the window and returns its value. */
    async js (body) {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true, userGesture: true })
      const failed = r.result?.exceptionDetails
      if (failed) throw new Error(failed.exception?.description || failed.text)
      return r.result?.result?.value
    },
    async key (key, code = key, keyCode = 0) {
      for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode })
    },
    async shot (file) {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'))
    },
    close: () => ws.close()
  }
}
