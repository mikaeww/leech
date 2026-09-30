// The UI check: Leech's Electron shell in its own Xvfb with a throwaway profile, driven over CDP, one fresh
// profile per scenario. It starts a browser, so it is a long task: `npm run check:ui [names] [--shots=dir]`.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { connect, sleep } from './ui-check/cdp.mjs'
import { scenarios } from './ui-check/scenarios.mjs'
import { seedProfile, servePages } from './ui-check/seed.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const electron = createRequire(import.meta.url)('electron')

function launch (dir) {
  const env = { ...process.env, LEECH_DATA_DIR: dir }
  // With a Wayland display Electron opens its window there, on the owner's screen, even inside xvfb-run.
  delete env.WAYLAND_DISPLAY
  delete env.XDG_SESSION_TYPE
  const args = ['-a', '-s', '-screen 0 1280x800x24', electron, root, '--no-sandbox', '--ozone-platform=x11', '--remote-debugging-port=0']
  const child = spawn('xvfb-run', args, { env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
  const stop = () => {
    // The whole group is ours: xvfb-run, its Xvfb and the browser it started.
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
  }
  const port = new Promise((resolve, reject) => {
    let log = ''
    child.stderr.on('data', d => {
      log += d
      const m = log.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)
      if (m) resolve(Number(m[1]))
    })
    child.on('exit', code => reject(new Error(`the browser exited (${code}) before its debugger listened:\n${log.slice(-1500)}`)))
  })
  return { port, stop }
}

async function runOne (name, base, shots) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leech-ui-check-'))
  const browser = launch(dir)
  try {
    seedProfile(dir, base, scenarios[name].seed)
    const c = await connect(await browser.port, url => url.endsWith('ui/index.html'))
    for (let i = 0; i < 40 && !(await c.js('return !!document.querySelector("#side .rows .row, #strip .tab")')); i++) await sleep(250)
    await sleep(500)
    const shot = label => shots ? c.shot(path.join(shots, `${name}-${label}.png`)) : null
    await scenarios[name].run({ c, dir, base, shot })
    if (shots) await c.shot(path.join(shots, `${name}.png`))
    c.close()
  } finally {
    browser.stop()
    await sleep(300)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const shots = process.argv.find(a => a.startsWith('--shots='))?.slice(8)
const asked = process.argv.slice(2).filter(a => !a.startsWith('--'))
const unknown = asked.filter(n => !scenarios[n])
if (unknown.length) throw new Error(`no such scenario: ${unknown.join(', ')} (known: ${Object.keys(scenarios).join(', ')})`)
if (shots) fs.mkdirSync(shots, { recursive: true })
const { server, base } = await servePages()
let failed = 0
for (const name of asked.length ? asked : Object.keys(scenarios)) {
  const started = Date.now()
  try {
    await runOne(name, base, shots)
    console.log(`ui-check: ${name} passed (${Date.now() - started} ms)`)
  } catch (err) {
    failed++
    console.error(`ui-check: ${name} FAILED: ${err.message}`)
  }
}
server.close()
process.exitCode = failed ? 1 : 0
