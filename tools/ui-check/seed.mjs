// A throwaway profile and the pages it opens: every check starts from the same known state.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

export const PAGES = ['Mail', 'Calendar', 'Docs', 'Notes', 'Wikipedia', 'Long']

function pageHTML (name) {
  const title = name === 'Long' ? 'A page with a rather long title that should fade out' : name
  return `<!doctype html><title>${title}</title><body style="font:16px sans-serif;padding:40px;background:#fff"><h1>${name}</h1><p>Some text on the ${name} page.</p>`
}

// One second of a quiet 440 Hz tone as 8 kHz mono 16-bit WAV, for a tab that plays sound.
function toneWAV () {
  const rate = 8000
  const data = Buffer.alloc(rate * 2)
  for (let i = 0; i < rate; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 2000), i * 2)
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

// A page taller than the window with a box to type in, for the page script.
const FORM = `<!doctype html><title>Form</title><body style="font:16px sans-serif;padding:40px;background:#fff">
<h1>Form</h1><input id="box" type="text"><div style="height:3000px"></div><p>End</p>`

// A box to hide, and an ad slot the shield's sheet hides.
const ADS = `<!doctype html><title>Ads</title><body style="font:16px sans-serif;padding:40px;background:#fff">
<h1>Ads</h1><div id="box" style="width:200px;height:80px;background:#ccc">Box</div><ins class="adsbygoogle" style="display:block">Ad</ins>`

const EXTRA = {
  '/form.html': ['text/html', FORM],
  '/ads.html': ['text/html', ADS],
  '/tone.html': ['text/html', '<!doctype html><title>Tone</title><body style="background:#fff"><h1>Tone</h1><audio loop src="/tone.wav"></audio>'],
  '/tone.wav': ['audio/wav', toneWAV()]
}

/** Serves the pages on a free local port; resolves to the server and its base address. */
export function servePages () {
  const server = http.createServer((req, res) => {
    if (EXTRA[req.url]) {
      res.writeHead(200, { 'content-type': EXTRA[req.url][0] })
      return res.end(EXTRA[req.url][1])
    }
    const name = PAGES.find(p => req.url === `/${p.toLowerCase()}.html`)
    res.writeHead(name ? 200 : 404, { 'content-type': 'text/html' })
    res.end(name ? pageHTML(name) : 'not found')
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })))
}

/**
 * Writes Leech's files for a profile: two pinned tabs, a folder, loose tabs, two spaces. `settings` adds to
 * the settings; the tabs named in `idle` were last looked at two hours ago.
 */
export function seedProfile (dir, base, { look = 'light', sidebar = true, settings = {}, idle = [] } = {}) {
  const url = name => `${base}/${name.toLowerCase()}.html`
  fs.mkdirSync(dir, { recursive: true })
  const write = (name, value) => fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value))
  write('settings', { welcomed: true, look, sidebar, spaces: true, ...settings })
  write('window', { width: 1280, height: 800 })
  write('spaces', [{ id: 'personal', name: 'Personal', icon: 'home', shares: true }, { id: 'work', name: 'Work', icon: 'briefcase', shares: true }])
  const idleSince = Math.round(Date.now() / 1000) - 7200
  const session = {
    tabs: [
      { url: url('Mail'), title: 'Mail', pin: 'M' },
      { url: url('Calendar'), title: 'Calendar', pin: 'C' },
      { url: url('Docs'), title: 'Docs', folder: 'f1' },
      { url: url('Notes'), title: 'Notes', folder: 'f1' },
      { url: url('Wikipedia'), title: 'Wikipedia' },
      { url: url('Long'), title: 'A page with a rather long title that should fade out' }
    ],
    folders: [{ id: 'f1', name: 'Work', open: true }],
    active: 4
  }
  for (const t of session.tabs) if (idle.includes(t.title.split(' ')[0])) t.touched = idleSince
  write('session', session)
  write('session-work', { tabs: [{ url: url('Notes'), title: 'Notes' }], active: 0 })
}
