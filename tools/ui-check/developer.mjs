// Tools for developers: related tabs move under their repository's tab; downloads land in their kind's folder.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sleep } from './cdp.mjs'
import { waitFor } from './pages.mjs'

const order = c => c.js('const { tabs } = await import(\'./state.js\'); return tabs.filter(t => !t.pin && !t.folder).map(t => t.title || t.url)')
const setIn = (c, title) => c.js(`return [...document.querySelectorAll('#side .rows .row')].find(r => r.textContent.includes(${JSON.stringify(title)}))?.classList.contains('related') ?? null`)

async function related ({ c, base, shot }) {
  const port = new URL(base).port
  const repo = `http://github.com:${port}/mikaeww/leech`
  const question = `http://stackoverflow.com:${port}/titled?t=${encodeURIComponent('How do I build Leech on Arch?')}`
  await c.js(`const { open } = await import('./tabs/tabs.js'); open(${JSON.stringify(repo)}, true)`)
  // github.com is on the HSTS list, so the page fails over https here; its address alone is the topic.
  await waitFor(c, 'return (await import(\'./state.js\')).tabs.some(t => t.url?.includes(\'github.com\') && t.ready)', 'the repository tab')
  // From another tab, so only the name relates the two.
  await c.js(`const { tabs } = await import('./state.js'); const { select, open } = await import('./tabs/tabs.js')
    select(tabs.find(t => t.title === 'Notes').id); open(${JSON.stringify(question)}, true)`)
  await waitFor(c, 'return (await import(\'./state.js\')).tabs.some(t => t.title === \'How do I build Leech on Arch?\')', 'the question has its title')
  await sleep(400)
  const titles = await order(c)
  const at = titles.findIndex(t => t.includes('github.com'))
  assert.equal(titles[at + 1], 'How do I build Leech on Arch?', `the question sits under the repository: ${titles.join(' | ')}`)
  assert.equal(await setIn(c, 'How do I build Leech'), true, 'and is set in')
  assert.equal(await setIn(c, 'Notes'), false, 'an unrelated tab is not')
  await shot?.('related')
  await c.js('const { setPref } = await import(\'./state.js\'); setPref(\'tabs.related\', false); (await import(\'./chrome/render.js\')).render()')
  await sleep(300)
  assert.equal(await setIn(c, 'How do I build Leech'), false, 'turned off, nothing is set in')
}

// Into a folder inside the throwaway profile, never the owner's own downloads folder: Chromium is told before
// it starts (its folder is read-only from the UI), Electron through Leech's setting.
const savedIn = dir => path.join(dir, 'saved')
function downloadsFolder ({ dir, chromium }) {
  fs.mkdirSync(savedIn(dir))
  if (!chromium) return
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: savedIn(dir), prompt_for_download: false } }))
}

async function downloadsSorted ({ c, dir, base, chromium }) {
  const folder = savedIn(chromium ? path.join(dir, '..', '..') : dir)
  await c.js(`const { configure, setPref } = await import('./state.js'); setPref('downloads', ${JSON.stringify(folder)}); setPref('downloads.sort', true); configure()`)
  await sleep(300)
  for (const name of ['photo.png', 'notes.md', 'tool.AppImage', 'mix.mp3']) {
    await c.js(`const { open } = await import('./tabs/tabs.js'); open(${JSON.stringify(`${base}/attachment/${name}`)}, false)`)
  }
  const want = ['Images/photo.png', 'Documents/notes.md', 'Installers/tool.AppImage', 'Other/mix.mp3']
  await waitForFiles(folder, want)
  await c.js('const { configure, setPref } = await import(\'./state.js\'); setPref(\'downloads.sort\', false); configure()')
  await sleep(300)
  await c.js(`const { open } = await import('./tabs/tabs.js'); open(${JSON.stringify(`${base}/attachment/later.png`)}, false)`)
  await waitForFiles(folder, ['later.png'])
}

async function waitForFiles (folder, want) {
  for (let i = 0; i < 60 && !want.every(f => fs.existsSync(path.join(folder, f))); i++) await sleep(150)
  const missing = want.filter(f => !fs.existsSync(path.join(folder, f)))
  assert.deepEqual(missing, [], `saved where their kind goes; the folder holds ${fs.readdirSync(folder, { recursive: true }).join(', ')}`)
}

export const developerScenarios = {
  related: { chromium: true, run: related },
  'downloads-sorted': { chromium: true, before: downloadsFolder, run: downloadsSorted }
}
