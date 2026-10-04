// Security: a passive check of the page on screen, from what it already sent since the Dev UI attached: the
// document's headers, its cookies, requests over plain http, its forms, the certificate and source maps.
// Nothing is probed or sent; the findings are worst first.
import { esc, h } from '../../elements.js'
import { current } from '../../state.js'
import { auditCookie, auditForms, auditHeaders, auditMixed, auditSourceMaps, auditTLS, ranked } from '../audit.js'
import { redraw } from '../column.js'
import { on, send } from '../protocol.js'
import { bar, button, empty, scroller } from '../rows.js'
import { documentRequest, requests } from './network.js'
import { pageCookies } from './storage.js'

const maps = new Set()
const view = { findings: null, at: null, running: false }

on('leech.attached', () => { maps.clear(); view.findings = null })
on('leech.navigated', () => { maps.clear(); view.findings = null })
on('Debugger.scriptParsed', p => { if (p.sourceMapURL && !p.sourceMapURL.startsWith('data:')) maps.add(new URL(p.sourceMapURL, p.url || current()?.url).href.split('/').pop()) })

// Read in the page; a page could lie to it, which is as far as a passive check goes.
const FORMS = '[...document.forms].map(f => ({ action: f.action, method: f.method, password: !!f.querySelector("input[type=password]") }))'

async function run () {
  view.running = true
  redraw('security')
  const url = current()?.url || ''
  const doc = documentRequest()
  const [cookies, forms] = await Promise.all([pageCookies(), send('Runtime.evaluate', { expression: FORMS, returnByValue: true }).then(r => r.result.value || [], () => [])])
  const found = [
    ...(doc ? auditHeaders(doc.responseHeaders, url) : []),
    ...cookies.flatMap(c => auditCookie(c, url)),
    ...auditMixed(url, requests),
    ...auditForms(url, forms),
    ...auditTLS(doc?.security, Date.now() / 1000),
    ...auditSourceMaps([...maps])
  ]
  view.findings = { list: ranked(found), sawDocument: !!doc, cookies: cookies.length, requests: requests.length, forms: forms.length }
  view.at = new Date()
  view.running = false
  redraw('security')
}

function finding (f) {
  return h('div', `dev-finding ${f.level}`, `<span class="level">${esc(f.level)}</span><div class="words"><div class="title">${esc(f.title)}</div><div class="detail">${esc(f.detail)}</div></div>`)
}

function draw () {
  if (!/^https?:/.test(current()?.url || '')) return [empty('No web page on screen. Open a site to check it.')]
  const top = bar(button(view.running ? 'Checking…' : view.findings ? 'Check again' : 'Check this page', run, !view.findings), h('span', 'dev-spacer'),
    view.at && h('span', 'dev-note', `Checked ${view.at.toLocaleTimeString()}`))
  if (!view.findings) return [top, empty('Reads what the page sent: headers, cookies, requests, forms, the certificate and source maps. Nothing is sent to the site.')]
  const f = view.findings
  const count = level => f.list.filter(x => x.level === level).length
  const summary = h('div', 'dev-summary', ['high', 'medium', 'low', 'info'].map(l => `<span><b>${count(l)}</b> ${l}</span>`).join(''))
  const many = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const basis = h('div', 'dev-note', esc(`From ${f.sawDocument ? 'the document’s headers, ' : ''}${many(f.cookies, 'cookie')}, ${many(f.requests, 'request')} and ${many(f.forms, 'form')}.${f.sawDocument ? '' : ' The document’s headers came before the Dev UI attached: reload the page and check again to include them.'}`))
  return [top, summary, basis, f.list.length ? scroller('security-list', ...f.list.map(finding)) : empty('Nothing found in what the page sent.')]
}

export const securityTool = { id: 'security', label: 'Security', draw }
