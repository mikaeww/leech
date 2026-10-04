// The UI check: Leech's Electron shell (or with --chromium its Chromium build) in its own Xvfb with a throwaway
// profile, driven over CDP, one fresh profile per scenario. It starts a browser, so it is a long task:
// `npm run check:ui [names] [--shots=dir] [--chromium]`.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { connect, sleep } from './ui-check/cdp.mjs'
import { scenarios } from './ui-check/scenarios.mjs'
import { seedProfile, servePages } from './ui-check/seed.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const chromium = process.argv.includes('--chromium')
const CHROMIUM = process.env.LEECH_CHROMIUM || path.join(os.homedir(), 'Projekte/Apps/leech-chromium/src/out/Leech')
// The check starts sound from a script, without the click a person would give.
const CHROMIUM_FLAGS = ['--no-first-run', '--password-store=basic', '--autoplay-policy=no-user-gesture-required']
// Every host is this machine, so a page can load from an ad host without the network.
const RESOLVE = '--host-resolver-rules=MAP * 127.0.0.1'
// Where each shell looks for Leech's files, and how the UI's own page is known among the targets.
const HOST = chromium
  ? { store: dir => path.join(dir, 'Default', 'Leech'), isUI: url => url.startsWith('chrome://leech'), command: dir => [path.join(CHROMIUM, 'chrome'), `--user-data-dir=${dir}`, ...CHROMIUM_FLAGS, RESOLVE] }
  : { store: dir => dir, isUI: url => url.endsWith('ui/index.html'), command: () => [createRequire(import.meta.url)('electron'), root, '--no-sandbox', RESOLVE] }

function freeDisplay () {
  for (let n = 90; n < 200; n++) if (!fs.existsSync(`/tmp/.X11-unix/X${n}`) && !fs.existsSync(`/tmp/.X${n}-lock`)) return n
  throw new Error('no free X display between :90 and :199')
}

function launch (dir, extraEnv = {}) {
  const display = `:${freeDisplay()}`
  const env = { ...process.env, LEECH_DATA_DIR: dir, LEECH_UI_DIR: path.join(root, 'ui'), DISPLAY: display, ...extraEnv }
  // An installed copy (tools/stage.mjs) is checked with the UI it ships.
  if (chromium && fs.existsSync(path.join(CHROMIUM, 'leech-ui'))) delete env.LEECH_UI_DIR
  // With a Wayland display either shell opens its window there, on the owner's screen, even with DISPLAY set.
  delete env.WAYLAND_DISPLAY
  delete env.XDG_SESSION_TYPE
  // Our own Xvfb on a known display, so keys can be typed into it for real (xdotool), not only through CDP.
  const socket = `/tmp/.X11-unix/X${display.slice(1)}`
  const script = `Xvfb ${display} -screen 0 1280x800x24 -nolisten tcp & while [ ! -e ${socket} ]; do sleep 0.05; done; exec "$@"`
  const args = ['-c', script, 'sh', ...HOST.command(dir), '--ozone-platform=x11', '--remote-debugging-port=0']
  const child = spawn('sh', args, { env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
  const stop = () => {
    // The whole group is ours: the shell, its Xvfb and the browser.
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
  // Real keys and pointer in the private display: through the window system, the way a person's arrive.
  const xdotool = (...args) => execFileSync('xdotool', args.map(String), { env: { ...process.env, DISPLAY: display } })
  const press = chord => xdotool('mousemove', 640, 400, 'key', chord)
  const pointer = (x, y, click) => click ? xdotool('mousemove', x, y, 'click', 1) : xdotool('mousemove', x, y)
  const type = text => xdotool('type', '--delay', 30, text)
  // The whole private display as a person would see it: in the Chromium build the UI's own capture lacks the page.
  const snap = file => execFileSync('sh', ['-c', `xwd -root -silent | ffmpeg -loglevel error -y -f xwd_pipe -i - "${file}"`], { env: { ...process.env, DISPLAY: display } })
  // The display's pixels, for finding what only exists outside the UI's page (Chromium's own bubbles).
  const pixels = () => {
    const raw = execFileSync('sh', ['-c', 'xwd -root -silent | ffmpeg -loglevel error -f xwd_pipe -i - -f rawvideo -pix_fmt rgb24 -'], { env: { ...process.env, DISPLAY: display }, maxBuffer: 64 << 20 })
    return { width: 1280, height: 800, data: raw }
  }
  return { port, stop, press, pointer, type, snap, pixels }
}

async function runOne (name, base, shots) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leech-ui-check-'))
  // What a scenario needs in the profile before the browser reads it.
  scenarios[name].before?.({ dir, chromium })
  // A scenario may give the browser its own environment, inside the throwaway profile.
  const browser = launch(dir, scenarios[name].env?.(dir))
  try {
    seedProfile(HOST.store(dir), base, scenarios[name].seed)
    const c = await connect(await browser.port, HOST.isUI)
    for (let i = 0; i < 40 && !(await c.js('return !!document.querySelector("#side .rows .row, #strip .tab")')); i++) await sleep(250)
    await sleep(500)
    const capture = file => chromium ? browser.snap(file) : c.shot(file)
    const shot = label => shots ? capture(path.join(shots, `${name}-${label}.png`)) : null
    await scenarios[name].run({ c, dir: HOST.store(dir), base, shot, chromium, press: browser.press, pointer: browser.pointer, type: browser.type, pixels: browser.pixels })
    if (shots) await capture(path.join(shots, `${name}.png`))
    c.close()
  } finally {
    browser.stop()
    await sleep(300)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const shots = process.argv.find(a => a.startsWith('--shots='))?.slice(8)
const asked = process.argv.slice(2).filter(a => !a.startsWith('--'))
// Without names, each shell runs the scenarios that apply to it.
const applies = name => chromium ? scenarios[name].chromium : scenarios[name].chromium !== 'only'
const unknown = asked.filter(n => !scenarios[n])
if (unknown.length) throw new Error(`no such scenario: ${unknown.join(', ')} (known: ${Object.keys(scenarios).join(', ')})`)
if (shots) fs.mkdirSync(shots, { recursive: true })
const { server, base } = await servePages()
let failed = 0
for (const name of asked.length ? asked : Object.keys(scenarios).filter(applies)) {
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
