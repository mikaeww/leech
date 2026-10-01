// The first run (Welcome.swift): pages glide in from the side, the whole thing fades away when done.
// Everything chosen on a page applies at once.
import { h } from '../elements.js'
import { action } from '../look/controls.js'
import { settle } from '../look/motion.js'
import { L, setPref } from '../state.js'
import { PAGES } from './pages.js'
import { swapPage, turnMark } from './moves.js'

export function createWelcome (ctx) {
  const root = h('div', '', `<div class="w-stage"></div><div class="w-foot"><div class="w-dots"></div><span class="spacer"></span></div>`)
  root.id = 'welcome'
  document.querySelector('#app').append(root)
  const stage = root.querySelector('.w-stage')
  const foot = root.querySelector('.w-foot')
  const dots = root.querySelector('.w-dots')

  let page = 0
  const w = { ctx, sources: [], source: null, want: { bookmarks: true, history: true }, brought: null, bringing: false, isDefault: false, signIn: null }
  L.importSources().then(v => { w.sources = v; w.source = v[0] || null; if (page === 2) show(0) })
  L.defaultBrowser(false).then(v => { w.isDefault = v })

  function show (dir) {
    swapPage(stage, PAGES[page](w), dir)
    paintFoot()
  }

  // The first Continue waits for the mark's turn; presses during it are dropped.
  let turning = false
  async function next () {
    if (turning) return
    if (page === PAGES.length - 1) return finish()
    turning = page === 0
    if (turning) await turnMark(stage)
    turning = false
    page++
    show(1)
  }

  function paintFoot () {
    dots.innerHTML = PAGES.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('')
    foot.querySelectorAll('button').forEach(b => b.remove())
    if (page > 0) foot.append(Object.assign(h('button', 'w-link', 'Back'), { onclick: () => { page--; show(-1) } }))
    if (page < PAGES.length - 1) foot.append(Object.assign(h('button', 'w-link', 'Skip'), { onclick: finish }))
    foot.append(action(page < PAGES.length - 1 ? 'Continue' : 'Start browsing', next, true))
  }

  function finish () {
    setPref('welcomed', true)
    root.classList.add('leaving')
    setTimeout(() => root.remove(), settle.ms)
    document.removeEventListener('keydown', keys, true)
    ctx.done(w.signIn)
  }

  // While it is open the first run has the keys; the blank tab's field underneath doesn't.
  const keys = e => {
    const own = { Enter: () => foot.querySelector('.action.primary')?.click(), ArrowRight: () => page < PAGES.length - 1 && next(), ArrowLeft: () => page > 0 && (page--, show(-1)) }[e.key]
    if (!own) return
    e.preventDefault()
    e.stopPropagation()
    own()
  }
  document.addEventListener('keydown', keys, true)
  document.activeElement?.blur()
  show(0)
}
