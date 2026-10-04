// Elements: the page's DOM as a tree that opens where it is clicked, a picker that finds what is under the
// pointer, and the chosen element's attributes, HTML and styles, each changeable in the page.
import { esc, h } from '../../elements.js'
import { redraw } from '../column.js'
import { on, send } from '../protocol.js'
import { bar, button, caption, chip, empty, field, scroller } from '../rows.js'

const nodes = new Map()
const view = { root: null, open: new Set(), chosen: null, picking: false, styles: null, styleFilter: '', html: null, box: null }
// The page's highlight in the Dev UI's greys: content, padding, margin.
const HIGHLIGHT = { contentColor: { r: 23, g: 23, b: 23, a: 0.22 }, paddingColor: { r: 23, g: 23, b: 23, a: 0.12 }, marginColor: { r: 120, g: 120, b: 120, a: 0.16 }, showInfo: true }

function take (node, parentId) {
  nodes.set(node.nodeId, { ...node, parentId, children: node.children?.map(c => c.nodeId) })
  for (const c of node.children || []) take(c, node.nodeId)
}

async function load () {
  nodes.clear()
  view.chosen = null
  const { root } = await send('DOM.getDocument', { depth: 3 }).catch(() => ({ root: null }))
  if (!root) return
  take(root)
  view.root = root.nodeId
  const html = root.children?.find(c => c.localName === 'html')
  view.open = new Set([root.nodeId, html?.nodeId, ...(html?.children || []).filter(c => c.localName === 'body').map(c => c.nodeId)].filter(Boolean))
  redraw('elements')
}

on('leech.ready', load)
on('DOM.documentUpdated', load)
on('DOM.setChildNodes', ({ parentId, nodes: list }) => {
  const parent = nodes.get(parentId)
  if (parent) parent.children = list.map(c => c.nodeId)
  for (const n of list) take(n, parentId)
  redraw('elements')
})
on('DOM.childNodeInserted', ({ parentNodeId, previousNodeId, node }) => {
  const parent = nodes.get(parentNodeId)
  take(node, parentNodeId)
  if (parent?.children) parent.children.splice(previousNodeId ? parent.children.indexOf(previousNodeId) + 1 : 0, 0, node.nodeId)
  redraw('elements')
})
on('DOM.childNodeRemoved', ({ parentNodeId, nodeId }) => {
  const parent = nodes.get(parentNodeId)
  if (parent?.children) parent.children = parent.children.filter(id => id !== nodeId)
  nodes.delete(nodeId)
  if (view.chosen === nodeId) view.chosen = null
  redraw('elements')
})
on('DOM.childNodeCountUpdated', ({ nodeId, childNodeCount }) => { const n = nodes.get(nodeId); if (n) { n.childNodeCount = childNodeCount; redraw('elements') } })
on('DOM.attributeModified', ({ nodeId, name, value }) => {
  const n = nodes.get(nodeId)
  if (!n) return
  const at = n.attributes.findIndex((x, i) => i % 2 === 0 && x === name)
  if (at >= 0) n.attributes[at + 1] = value; else n.attributes.push(name, value)
  redraw('elements')
})
on('DOM.attributeRemoved', ({ nodeId, name }) => {
  const n = nodes.get(nodeId)
  const at = n ? n.attributes.findIndex((x, i) => i % 2 === 0 && x === name) : -1
  if (at >= 0) { n.attributes.splice(at, 2); redraw('elements') }
})
on('DOM.characterDataModified', ({ nodeId, characterData }) => { const n = nodes.get(nodeId); if (n) { n.nodeValue = characterData; redraw('elements') } })
// The picker found something: the protocol pushes its ancestors first, so the path can be opened.
on('Overlay.inspectNodeRequested', async ({ backendNodeId }) => {
  view.picking = false
  send('Overlay.setInspectMode', { mode: 'none', highlightConfig: HIGHLIGHT })
  const { nodeIds } = await send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [backendNodeId] })
  for (let id = nodes.get(nodeIds[0])?.parentId; id; id = nodes.get(id)?.parentId) view.open.add(id)
  choose(nodeIds[0])
})

const attrs = n => { const out = []; for (let i = 0; i < (n.attributes?.length || 0); i += 2) out.push([n.attributes[i], n.attributes[i + 1]]); return out }

function tagHTML (n) {
  if (n.nodeType === 3) return `<span class="text">${esc(n.nodeValue.trim().slice(0, 120))}</span>`
  if (n.nodeType === 8) return `<span class="comment">&lt;!-- ${esc(n.nodeValue.trim().slice(0, 80))} --&gt;</span>`
  if (n.nodeType === 9) return '<span class="tag">#document</span>'
  if (n.nodeType === 10) return `<span class="tag">&lt;!doctype ${esc(n.nodeName.toLowerCase())}&gt;</span>`
  const shown = attrs(n).map(([k, v]) => ` <span class="attr">${esc(k)}</span>${v ? `="<span class="val">${esc(v.length > 60 ? v.slice(0, 60) + '…' : v)}</span>"` : ''}`).join('')
  return `<span class="tag">&lt;${esc(n.localName || n.nodeName.toLowerCase())}</span>${shown}<span class="tag">&gt;</span>`
}

// Text that is only whitespace isn't worth a line.
const shownChild = id => { const c = nodes.get(id); return c && !(c.nodeType === 3 && !c.nodeValue.trim()) }

function rowsOf (id, depth, out) {
  const n = nodes.get(id)
  if (!n) return out
  const opens = (n.childNodeCount || n.children?.length) > 0 && n.nodeType !== 3
  const isOpen = view.open.has(id)
  const row = h('div', 'dev-node' + (view.chosen === id ? ' chosen' : ''), `<span class="chevron${opens ? (isOpen ? ' open' : '') : ' none'}">›</span><span class="markup">${tagHTML(n)}</span>`)
  row.style.setProperty('--depth', depth)
  row.addEventListener('click', e => {
    if (e.target.closest('.chevron') && opens) return toggle(id)
    choose(id)
  })
  row.addEventListener('dblclick', () => opens && toggle(id))
  row.addEventListener('mouseenter', () => n.nodeType === 1 && send('Overlay.highlightNode', { nodeId: id, highlightConfig: HIGHLIGHT }).catch(() => {}))
  out.push(row)
  if (isOpen) for (const c of (n.children || []).filter(shownChild)) rowsOf(c, depth + 1, out)
  return out
}

function toggle (id) {
  const n = nodes.get(id)
  if (view.open.has(id)) view.open.delete(id)
  else {
    view.open.add(id)
    if (!n.children) send('DOM.requestChildNodes', { nodeId: id, depth: 1 }).catch(err => console.warn('Dev UI: children', err.message))
  }
  redraw('elements')
}

async function choose (id) {
  view.chosen = id
  view.styles = null
  view.html = null
  view.box = null
  redraw('elements')
  if (nodes.get(id)?.nodeType !== 1) return
  send('Overlay.highlightNode', { nodeId: id, highlightConfig: HIGHLIGHT }).catch(() => {})
  const [styles, box] = await Promise.all([send('CSS.getComputedStyleForNode', { nodeId: id }).catch(() => null), send('DOM.getBoxModel', { nodeId: id }).catch(() => null)])
  if (view.chosen !== id) return
  view.styles = styles?.computedStyle || []
  view.box = box?.model || null
  redraw('elements')
}

function pick () {
  view.picking = !view.picking
  send('Overlay.setInspectMode', { mode: view.picking ? 'searchForNode' : 'none', highlightConfig: HIGHLIGHT }).catch(err => console.warn('Dev UI: pick', err.message))
  redraw('elements')
}

const COMMON = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'z-index', 'opacity', 'overflow', 'visibility', 'pointer-events']
const quiet = p => p.catch(err => console.warn('Dev UI: elements', err.message))

function attributeLines (n) {
  const out = []
  for (const [name, value] of attrs(n)) {
    const input = field('', value, () => {}, `attr-${name}`, 'grow mono')
    input.addEventListener('change', () => quiet(send('DOM.setAttributeValue', { nodeId: n.nodeId, name, value: input.value })))
    out.push(bar(h('span', 'dev-key', esc(name)), input, button('Remove', () => quiet(send('DOM.removeAttribute', { nodeId: n.nodeId, name })))))
  }
  const name = field('name', '', () => {}, 'attr-new-name', 'mono narrow')
  const value = field('value', '', () => {}, 'attr-new-value', 'grow mono')
  out.push(bar(name, value, button('Add', () => name.value.trim() && quiet(send('DOM.setAttributeValue', { nodeId: n.nodeId, name: name.value.trim(), value: value.value })))))
  return out
}

async function editHTML (n) {
  view.html = (await quiet(send('DOM.getOuterHTML', { nodeId: n.nodeId })))?.outerHTML ?? null
  redraw('elements')
}

function htmlEditor (n) {
  const area = h('textarea', 'dev-code dev-area tall')
  area.value = view.html
  area.spellcheck = false
  area.dataset.keep = 'outer-html'
  area.addEventListener('input', () => { view.html = area.value })
  return [area, bar(h('span', 'dev-spacer'), button('Cancel', () => { view.html = null; redraw('elements') }),
    button('Apply to the page', async () => { await quiet(send('DOM.setOuterHTML', { nodeId: n.nodeId, outerHTML: view.html })); view.html = null; view.chosen = null; redraw('elements') }, true))]
}

function styleLines () {
  if (!view.styles) return [h('div', 'dev-pair none', '…')]
  const needle = view.styleFilter.trim().toLowerCase()
  const shown = view.styles.filter(p => needle ? p.name.includes(needle) || p.value.toLowerCase().includes(needle) : COMMON.includes(p.name))
  return shown.map(p => h('div', 'dev-pair', `<span class="key">${esc(p.name)}</span><span class="value">${esc(p.value)}</span>`))
}

// The chosen element: what it is, its attributes, its HTML and its computed styles.
function inspector () {
  const n = nodes.get(view.chosen)
  if (!n || n.nodeType !== 1) return h('div', 'dev-inspector', '<div class="dev-empty">Only elements have attributes and styles.</div>')
  const size = view.box ? ` · ${view.box.width} × ${view.box.height}` : ''
  const parts = [bar(h('span', 'dev-title', esc(`<${n.localName}>${size}`)), h('span', 'dev-spacer'),
    button('Edit HTML', () => editHTML(n)), button('Delete element', () => quiet(send('DOM.removeNode', { nodeId: n.nodeId }))))]
  if (view.html !== null) parts.push(caption('HTML'), ...htmlEditor(n))
  parts.push(caption('Attributes'), ...attributeLines(n), caption('Computed styles'),
    field('Filter all properties', view.styleFilter, v => { view.styleFilter = v; redraw('elements') }, 'style-filter'), ...styleLines())
  return scroller('elements-inspector', ...parts)
}

function draw () {
  if (!view.root) return [empty('No page to look into. Open a site and it shows here.')]
  const tree = scroller('elements-tree', ...rowsOf(view.root, 0, []))
  tree.classList.add('dev-tree')
  tree.addEventListener('mouseleave', () => send('Overlay.hideHighlight').catch(() => {}))
  const top = bar(chip(view.picking ? 'Picking…' : 'Pick', view.picking, pick), h('span', 'dev-note', view.picking ? 'Click something in the page' : 'Click a line to see and change it'))
  return [top, tree, view.chosen ? inspector() : null]
}

// Leaving the tool takes its highlight off the page.
export const elementsTool = { id: 'elements', label: 'Elements', draw, left: () => send('Overlay.hideHighlight').catch(() => {}) }
