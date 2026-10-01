// The parts a tab is drawn from, shared by the strip and the sidebar.
import { esc, h } from '../elements.js'
import { icon } from '../look/icons.js'
import { settle } from '../look/motion.js'
import { blank, favicon, label, monogram, prefs, sideMode, ui } from '../state.js'
import { tabField } from '../tabs/edit.js'

export const stripEls = new Map()
export const sideEls = new Map()

// A closed tab shrinks and fades where it was while the others close the gap.
export function leave (el) {
  el.classList.add('leaving')
  el.style.pointerEvents = 'none'
  setTimeout(() => el.remove(), settle.ms)
}

/** The next render rebuilds every tab's insides, for a change fill() can't see. */
export function forgetDrawnTabs () {
  for (const els of [stripEls, sideEls]) els.forEach(el => { el.dataset.key = '' })
}

/** Takes an element's entering look away two frames after it was added, so it transitions in. */
export function arrive (el) {
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')))
}

export function elementFor (t) {
  return (sideMode() ? sideEls : stripEls).get(t.id)
}

export function markHTML (t, size = 16) {
  const box = `width:${size}px;height:${size}px`
  if (blank(t)) return `<span class="mark leech" style="${box}"></span>`
  const src = favicon(t)
  if (src) return `<span class="mark has-icon" style="${box}"><img src="${esc(src)}" alt=""></span>`
  return `<span class="mark" style="${box}">${esc(t.pin || monogram(t))}</span>`
}

export function glyphHTML (t, size = 16) {
  // A pinned tab shows the site's own picture when it has one; the letter is the fallback.
  const src = favicon(t)
  if (src) return `<span class="glyph"><img src="${esc(src)}" alt="" style="width:${size}px;height:${size}px"></span>`
  return `<span class="glyph">${esc(t.pin || monogram(t))}</span>`
}

export function shyHTML (t) { return t.shy ? `<span class="shy" title="Private">${icon('eyeOff', 'small')}</span>` : '' }

export function statusHTML (t) {
  const speaker = !t.loading && (t.muted || t.audible)
  return `<span class="slot">${speaker
    ? `<button class="speaker" data-act="mute" title="${t.muted ? 'Unmute Tab' : 'Mute Tab'}">${icon(t.muted ? 'muted' : 'speaker', 'small')}</button>`
    : RING}</span>`
}

const RING = '<span class="ring"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.3" fill="none" stroke="currentColor" stroke-opacity="0.7" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="21.2 27.1" transform="rotate(-90 5 5)"/></svg></span>'

export function slotHTML (t) {
  const speaker = t.muted || t.audible
    ? `<button class="speaker" data-act="mute" title="${t.muted ? 'Unmute Tab' : 'Mute Tab'}">${icon(t.muted ? 'muted' : 'speaker', 'small')}</button>`
    : ''
  const ring = t.loading && !speaker ? `<span class="ring"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.3" fill="none" stroke="currentColor" stroke-opacity="0.7" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="21.2 27.1" transform="rotate(-90 5 5)"/></svg></span>` : ''
  return `<span class="slot">${ring}${speaker}<button class="cross" data-act="close">${icon('x', 'small')}</button></span>`
}

/** Rebuilds a tab's insides only when what it shows changes shape; the title is patched in place. */
export function fill (el, t, shape, build) {
  const editing = ui.tabEdit?.id === t.id
  const key = JSON.stringify([shape, editing, t.loading, t.audible, t.muted, favicon(t), t.pin, prefs.glyph, !!t.web, t.url && monogram(t)])
  if (el.dataset.key !== key) {
    el.dataset.key = key
    el.innerHTML = build()
    if (editing) {
      const title = el.querySelector('.title')
      if (title) title.replaceWith(tabField(t))
      else el.append(tabField(t))
    }
  }
  const title = el.querySelector('.title')
  if (title && title.textContent !== label(t)) title.textContent = label(t)
  el.title = el.classList.contains('pin') || el.classList.contains('pinned') || el.classList.contains('compact') ? label(t) : ''
}

/**
 * Each split's two tabs in `box`: one --raise1 ground under both, and the split icon in a column of its own at
 * the ground's left, tying them together. `places` maps the left tab's id to {ground, mark} CSS places;
 * pairs no longer there lose both.
 */
export function paintSplitGrounds (box, places) {
  for (const [id, place] of places) {
    // The ground first in the box, so the pill and the tabs draw over it; the icon last, so nothing covers it.
    Object.assign(pairPart(box, 'split-ground', id, el => box.prepend(el)).style, place.ground)
    Object.assign(pairPart(box, 'split-mark', id, el => { el.innerHTML = icon('split'); box.append(el) }).style, place.mark)
  }
  for (const el of box.querySelectorAll(':scope > :is(.split-ground, .split-mark)')) if (!places.has(el.dataset.pair)) el.remove()
}

function pairPart (box, kind, id, place) {
  let el = box.querySelector(`:scope > .${kind}[data-pair="${id}"]`)
  if (!el) {
    el = h('div', kind)
    el.dataset.pair = id
    place(el)
  }
  return el
}

export function markFor (url, size) { return markHTML({ url, favicon: null }, size) }
