// The first run (Welcome.swift), laid out like the window it sets up: its steps on a rail on the window's grey,
// each step on a page beside it. Pages glide in from the side, the whole thing fades away when done; everything
// chosen on a page applies at once.
import { h } from '../elements.js'
import { createBackdrop } from '../look/backdrop.js'
import { action } from '../look/controls.js'
import { icon } from '../look/icons.js'
import { settle } from '../look/motion.js'
import { L, setPref } from '../state.js'
import { PAGES, STEPS } from './pages.js'
import { swapPage, turnMark } from './moves.js'

// The rail of steps on the window's grey and the sheet the pages stand on; a step chosen on the rail goes there.
function frame (go) {
  const root = h('div', '', `<nav class="w-rail"><div class="w-brand"><span class="w-brand-mark"></span><span>Leech</span></div></nav>
    <div class="w-sheet"><div class="w-stage"></div><div class="w-foot"><span class="spacer"></span></div></div>`)
  root.id = 'welcome'
  document.querySelector('#app').append(root)
  const steps = STEPS.map(([title, glyph], i) => {
    const b = h('button', 'rail-row', `${icon(glyph)}<span>${title}</span>`)
    b.addEventListener('click', () => go(i))
    return b
  })
  root.querySelector('.w-rail').append(...steps)
  // The first page wears one of the new tab's pictures, the one whose subject sits in its middle.
  const art = createBackdrop(root.querySelector('.w-sheet'), 'blue-marble.jpg')
  return { root, steps, art, stage: root.querySelector('.w-stage'), foot: root.querySelector('.w-foot') }
}

export function createWelcome (ctx) {
  const { root, steps, art, stage, foot } = frame(i => go(i))
  let page = 0
  const w = { ctx, sources: [], source: null, want: { bookmarks: true, history: true }, brought: null, bringing: false, isDefault: false, signIn: null }
  L.importSources().then(v => { w.sources = v; w.source = v[0] || null; if (page === 2) show(0) })
  L.defaultBrowser(false).then(v => { w.isDefault = v })

  function show (dir) {
    swapPage(stage, PAGES[page](w), dir)
    art(page === 0, 'welcome')
    root.dataset.step = page
    steps.forEach((b, i) => b.classList.toggle('on', i === page))
    paintFoot()
  }

  // Leaving the first page waits for the mark's turn; presses during it are dropped.
  let turning = false
  async function go (to) {
    if (turning || to === page || to < 0 || to >= PAGES.length) return
    turning = page === 0
    if (turning) await turnMark(stage)
    turning = false
    const dir = Math.sign(to - page)
    page = to
    show(dir)
  }
  const next = () => page === PAGES.length - 1 ? finish() : go(page + 1)

  function paintFoot () {
    foot.querySelectorAll('button').forEach(b => b.remove())
    if (page > 0) foot.append(Object.assign(h('button', 'w-link', 'Back'), { onclick: () => go(page - 1) }))
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
    const own = { Enter: () => foot.querySelector('.action.primary')?.click(), ArrowRight: () => page < PAGES.length - 1 && next(), ArrowLeft: () => go(page - 1) }[e.key]
    if (!own) return
    e.preventDefault()
    e.stopPropagation()
    own()
  }
  document.addEventListener('keydown', keys, true)
  document.activeElement?.blur()
  show(0)
}
