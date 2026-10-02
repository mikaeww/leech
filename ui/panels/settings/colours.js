// The Colours page (ADR 0008): the look, presets, and every colour of the window by hand. Colours and the
// angle change in place while the picker is open; a choice that adds or removes lines draws the page again.
import { esc, h } from '../../elements.js'
import { action, segmented, toggle } from '../../look/controls.js'
import { applyPaint, DOT_SIZES, paintOf, previewOf, setPaint } from '../../paint/apply.js'
import { swatch } from '../../paint/picker.js'
import { PRESETS } from '../../paint/presets.js'
import { prefs, setPref } from '../../state.js'
import { ctx } from '../index.js'
import { caption, card, line, quick } from '../pieces.js'
import { refill } from './index.js'

// What a switched-off colour was, so switching it on again brings it back.
const kept = { accent: '#045af2', sheet: '#faf6ef', dots: ['#045af2', '#22b8e8'] }
const reshape = change => { setPaint(change); refill() }

function group (title, ...lines) {
  const el = h('div', 'group')
  el.append(caption(title), card(...lines))
  return el
}

function presets () {
  const now = JSON.stringify(paintOf())
  const row = h('div', 'presets')
  for (const [name, paint] of PRESETS) {
    const on = JSON.stringify(paintOf(paint)) === now
    const b = h('button', 'preset' + (on ? ' on' : ''), `<span class="preset-chip"></span><span>${esc(name)}</span>`)
    b.querySelector('.preset-chip').style.setProperty('--swatch', previewOf(paint))
    b.addEventListener('click', () => { setPref('paint', paint && structuredClone(paint)); applyPaint(); refill() })
    row.append(b)
  }
  return row
}

function stopsLine () {
  const { colours } = paintOf().window
  const row = h('div', 'stops')
  colours.forEach((c, i) => row.append(swatch(c, hex => {
    const list = paintOf().window.colours
    list[i] = hex
    setPaint({ window: { colours: list } })
  }, `Gradient colour ${i + 1}`)))
  if (colours.length < 3) row.append(quick('Add', () => { const list = paintOf().window.colours; reshape({ window: { colours: [...list, list.at(-1)] } }) }))
  if (colours.length > 2) row.append(quick('Remove', () => reshape({ window: { colours: paintOf().window.colours.slice(0, 2) } })))
  return line('Colours', 'From the start of the gradient to its end', row)
}

function angleLine (angle) {
  const range = h('input', 'range')
  Object.assign(range, { type: 'range', min: 0, max: 355, step: 5, value: angle })
  range.setAttribute('aria-label', 'Angle')
  const el = line('Angle', `${angle}°`, range)
  range.addEventListener('input', () => {
    el.querySelector('.detail').textContent = `${range.value}°`
    setPaint({ window: { angle: Number(range.value) } })
  })
  return el
}

function windowLines (w) {
  const kind = line('Window', 'The sidebar, the tab strip and the bookmarks bar; text on it turns light or dark to stay readable',
    segmented([['grey', 'Grey'], ['colour', 'Colour'], ['gradient', 'Gradient']], w.kind, v => reshape({ window: { kind: v } })))
  if (w.kind === 'colour') {
    return [kind, line('Colour', null, swatch(w.colours[0], hex => setPaint({ window: { colours: [hex, ...paintOf().window.colours.slice(1)] } }), 'Window colour'))]
  }
  if (w.kind !== 'gradient') return [kind]
  return [kind, stopsLine(),
    line('Shape', null, segmented([['linear', 'Linear'], ['radial', 'Radial']], w.shape, v => reshape({ window: { shape: v } }))),
    w.shape === 'linear' && angleLine(w.angle),
    line('Dither', 'The gradient in coarse dots, like the new tab’s picture', toggle(w.dither, v => setPaint({ window: { dither: v } })))]
}

// A colour that can be off (the look's own) or the owner's.
function optional (key, title, detail, label) {
  const value = paintOf()[key]
  return [
    line(title, detail, toggle(!!value, on => reshape({ [key]: on ? kept[key] : null }))),
    value && line(label, null, swatch(value, hex => { kept[key] = hex; setPaint({ [key]: hex }) }, label))
  ]
}

function dotLines (p) {
  const dots = p.dots && h('div', 'stops')
  p.dots?.forEach((c, i) => dots.append(swatch(c, hex => {
    const list = [...paintOf().dots]
    list[i] = hex
    kept.dots = list
    setPaint({ dots: list })
  }, `Dot colour ${i + 1}`)))
  return [
    line('Coloured dots', 'One colour, or two that shade across the picture', toggle(!!p.dots, on => reshape({ dots: on ? [...kept.dots] : null }))),
    dots && line('Dot colours', 'From the top left to the bottom right; the same twice for one colour', dots),
    line('Dot size', null, segmented(DOT_SIZES.map((n, i) => [String(n), ['Fine', 'Normal', 'Coarse'][i]]), String(p.dot), v => setPaint({ dot: Number(v) })))
  ]
}

export function colours () {
  const p = paintOf()
  return [
    card(
      line('Appearance', 'Light, dark, or whatever the system is doing — pages follow it too',
        segmented([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], prefs.look, v => { setPref('look', v); ctx.setLook(v) })),
      line('Presets', 'Starting points; every colour below can be changed after', null),
      presets()),
    group('Window', ...windowLines(p.window)),
    group('Accent', ...optional('accent', 'Own accent', 'The step on a rail, the one filled button, a switch that’s on, the chosen suggestion', 'Accent colour')),
    group('New tab', ...optional('sheet', 'Own background', 'The sheet the picture sits on; without one, a painted window’s colours', 'Background colour'), ...dotLines(p)),
    card(line('Start over', 'Leech’s own greys, everywhere', action('Reset', () => { setPaint(null); refill() })))
  ]
}
