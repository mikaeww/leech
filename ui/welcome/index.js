// The first run (Welcome.swift): pages glide in from the side, the whole thing fades away when done.
// Everything chosen on a page applies at once.
import { h } from '../elements.js'
import { action } from '../look/controls.js'
import { glide, reduced, settle } from '../look/motion.js'
import { L, setPref } from '../state.js'
import { PAGES } from './pages.js'

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
    const next = PAGES[page](w)
    const old = stage.firstElementChild
    if (old && dir) {
      const far = reduced.matches ? 0 : 40 * dir
      old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-far}px)` }],
        { duration: glide.ms * 0.6, easing: glide.easing, fill: 'forwards' }).finished.then(() => old.remove())
      next.animate([{ opacity: 0, transform: `translateX(${far}px)` }, { opacity: 1, transform: 'none' }],
        { duration: glide.ms, easing: glide.easing })
    } else old?.remove()
    stage.append(next)
    paintFoot()
  }

  function paintFoot () {
    dots.innerHTML = PAGES.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('')
    foot.querySelectorAll('button').forEach(b => b.remove())
    if (page > 0) foot.append(Object.assign(h('button', 'w-link', 'Back'), { onclick: () => { page--; show(-1) } }))
    if (page < PAGES.length - 1) foot.append(Object.assign(h('button', 'w-link', 'Skip'), { onclick: finish }))
    foot.append(action(page < PAGES.length - 1 ? 'Continue' : 'Start browsing', () => {
      if (page < PAGES.length - 1) { page++; show(1) } else finish()
    }, true))
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
    const own = { Enter: () => foot.querySelector('.action.primary')?.click(), ArrowRight: () => page < PAGES.length - 1 && (page++, show(1)), ArrowLeft: () => page > 0 && (page--, show(-1)) }[e.key]
    if (!own) return
    e.preventDefault()
    e.stopPropagation()
    own()
  }
  document.addEventListener('keydown', keys, true)
  document.activeElement?.blur()
  show(0)
}
