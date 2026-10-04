// Console: what the page logs, its errors and the browser's own warnings about it, and a line that runs
// JavaScript in the page, with its answer under it. Up and down step through what was typed.
import { esc, h } from '../../elements.js'
import { redraw } from '../column.js'
import { on, send } from '../protocol.js'
import { bar, button, chip, empty, scroller } from '../rows.js'
import { preview } from './values.js'

const lines = []
const typed = []
const view = { level: 'All', keep: false, draft: '', back: 0 }
const MOST = 2000
const LEVELS = { All: null, Errors: ['error'], Warnings: ['warning'], Info: ['log', 'info', 'debug'] }
const WORD = { warning: 'warning', error: 'error', input: '›', result: '‹' }

function add (line) {
  lines.push(line)
  if (lines.length > MOST) lines.splice(0, lines.length - MOST)
  redraw('console')
}

const at = frame => frame ? `${frame.url.split('/').pop() || frame.url}:${frame.lineNumber + 1}` : ''
const levelOf = type => type === 'warning' || type === 'warn' ? 'warning' : type === 'error' || type === 'assert' ? 'error' : type === 'debug' ? 'debug' : 'log'

on('leech.attached', () => { lines.length = 0 })
on('leech.navigated', ({ url }) => { if (!view.keep) lines.length = 0; else add({ level: 'info', text: `Went to ${url}` }) })
on('Runtime.consoleAPICalled', p => {
  if (p.type === 'clear') { lines.length = 0; return redraw('console') }
  add({ level: levelOf(p.type), text: p.args.map(preview).join(' '), where: at(p.stackTrace?.callFrames[0]) })
})
on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
  add({ level: 'error', text: d.exception?.description || d.text, where: d.url ? `${d.url.split('/').pop()}:${d.lineNumber + 1}` : '' })
})
on('Log.entryAdded', ({ entry: e }) => {
  add({ level: e.level === 'verbose' ? 'debug' : levelOf(e.level), text: e.text + (e.url && e.source === 'network' ? ` ${e.url}` : ''), where: e.source })
})

async function run (expression) {
  if (!expression.trim()) return
  typed.push(expression)
  view.back = 0
  view.draft = ''
  add({ level: 'input', text: expression })
  const answer = await send('Runtime.evaluate', { expression, replMode: true, includeCommandLineAPI: true, generatePreview: true, awaitPromise: true, userGesture: true })
    .catch(err => ({ exceptionDetails: { text: err.message } }))
  const failed = answer.exceptionDetails
  add({ level: failed ? 'error' : 'result', text: failed ? failed.exception?.description || failed.text : preview(answer.result) })
}

function prompt () {
  const input = h('textarea', 'dev-prompt')
  input.rows = 1
  input.placeholder = 'Run JavaScript in the page'
  input.spellcheck = false
  input.value = view.draft
  input.dataset.keep = 'console-prompt'
  input.addEventListener('input', () => { view.draft = input.value })
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(input.value) }
    const step = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0
    if (step && !input.value.includes('\n') && typed.length) {
      e.preventDefault()
      view.back = Math.max(0, Math.min(typed.length, view.back + step))
      view.draft = view.back ? typed[typed.length - view.back] : ''
      redraw('console')
    }
  })
  return input
}

function lineOf (l) {
  return h('div', `dev-log ${l.level}`, `<span class="level">${esc(WORD[l.level] || '')}</span><span class="text">${esc(l.text)}</span>${l.where ? `<span class="where">${esc(l.where)}</span>` : ''}`)
}

function draw () {
  const shown = lines.filter(l => !LEVELS[view.level] || LEVELS[view.level].includes(l.level) || l.level === 'input' || l.level === 'result')
  const count = level => lines.filter(l => l.level === level).length
  const chips = Object.keys(LEVELS).map(name => {
    const n = name === 'Errors' ? count('error') : name === 'Warnings' ? count('warning') : 0
    return chip(n ? `${name} ${n}` : name, view.level === name, () => { view.level = name; redraw('console') })
  })
  const list = shown.length ? scroller('console-list', ...shown.map(lineOf)) : empty('Nothing logged since the Dev UI attached. What the page logs from now on shows here.')
  list.dataset.follow = 'end'
  return [bar(...chips, h('span', 'dev-spacer'), chip('Keep', view.keep, () => { view.keep = !view.keep; redraw('console') }), button('Clear', () => { lines.length = 0; redraw('console') })), list, prompt()]
}

export const consoleTool = { id: 'console', label: 'Console', draw }
