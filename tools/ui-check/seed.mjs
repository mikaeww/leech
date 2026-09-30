// A throwaway profile and the pages it opens: every check starts from the same known state.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

export const PAGES = ['Mail', 'Calendar', 'Docs', 'Notes', 'Wikipedia', 'Long']

function pageHTML (name) {
  const title = name === 'Long' ? 'A page with a rather long title that should fade out' : name
  return `<!doctype html><title>${title}</title><body style="font:16px sans-serif;padding:40px;background:#fff"><h1>${name}</h1><p>Some text on the ${name} page.</p>`
}

/** Serves the pages on a free local port; resolves to the server and its base address. */
export function servePages () {
  const server = http.createServer((req, res) => {
    const name = PAGES.find(p => req.url === `/${p.toLowerCase()}.html`)
    res.writeHead(name ? 200 : 404, { 'content-type': 'text/html' })
    res.end(name ? pageHTML(name) : 'not found')
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })))
}

/** Writes Leech's files for a profile: two pinned tabs, a folder, loose tabs, two spaces. */
export function seedProfile (dir, base, { look = 'light', sidebar = true } = {}) {
  const url = name => `${base}/${name.toLowerCase()}.html`
  const write = (name, value) => fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value))
  write('settings', { welcomed: true, look, sidebar, spaces: true })
  write('window', { width: 1280, height: 800 })
  write('spaces', [{ id: 'personal', name: 'Personal', icon: 'home', shares: true }, { id: 'work', name: 'Work', icon: 'briefcase', shares: true }])
  write('session', {
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
  })
  write('session-work', { tabs: [{ url: url('Notes'), title: 'Notes' }], active: 0 })
}
