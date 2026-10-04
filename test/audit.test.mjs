// The Dev UI's security checks: each finding appears when its condition holds and not otherwise.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditCookie, auditForms, auditHeaders, auditMixed, auditSourceMaps, auditTLS, ranked } from '../ui/dev/audit.js'

const titles = list => list.map(f => f.title)
const GOOD = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': 'default-src \'self\'; script-src \'self\' \'nonce-abc\' \'unsafe-inline\'; frame-ancestors \'none\'',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  Server: 'nginx'
}

test('a well-set https page has no findings', () => {
  assert.deepEqual(auditHeaders(GOOD, 'https://a.example/'), [])
})

test('each missing header is found once', () => {
  assert.deepEqual(titles(auditHeaders({}, 'https://a.example/')), ['No HSTS', 'No Content-Security-Policy', 'Can be framed', 'No nosniff', 'No Referrer-Policy'])
  assert.deepEqual(titles(auditHeaders(GOOD, 'http://a.example/')), ['Served without TLS'])
  assert.deepEqual(titles(auditHeaders({ ...GOOD, 'Strict-Transport-Security': 'max-age=600' }, 'https://a/')), ['Short HSTS'])
  assert.deepEqual(titles(auditHeaders({ ...GOOD, 'content-security-policy': 'script-src * \'unsafe-inline\' \'unsafe-eval\'' }, 'https://a/')),
    ['CSP allows inline scripts', 'CSP allows eval', 'CSP allows scripts from anywhere', 'Can be framed'])
  assert.deepEqual(titles(auditHeaders({ ...GOOD, 'X-Frame-Options': 'DENY', 'Content-Security-Policy': 'img-src \'self\'' }, 'https://a/')), ['CSP doesn’t limit scripts'])
  assert.deepEqual(titles(auditHeaders({ ...GOOD, 'X-Powered-By': 'PHP/8.1.2', Server: 'Apache/2.4.1' }, 'https://a/')), ['Version in server', 'Version in x-powered-by'])
  assert.deepEqual(titles(auditHeaders({ ...GOOD, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true' }, 'https://a/')), ['CORS: any origin with credentials'])
})

test('cookies', () => {
  const page = 'https://a.example/'
  assert.deepEqual(auditCookie({ name: 'theme', secure: true, httpOnly: false, sameSite: 'Lax' }, page), [])
  assert.deepEqual(titles(auditCookie({ name: 'sessionid', secure: false, httpOnly: false, sameSite: 'None' }, page)),
    ['sessionid: not Secure', 'sessionid: readable by script', 'sessionid: SameSite=None without Secure'])
  assert.deepEqual(titles(auditCookie({ name: 'x', secure: false, httpOnly: true }, 'http://a/')), ['x: no SameSite'])
})

test('mixed content and forms', () => {
  const reqs = [{ url: 'http://cdn/x.js', type: 'Script' }, { url: 'http://cdn/x.png', type: 'Image' }, { url: 'https://cdn/y.js', type: 'Script' }]
  assert.deepEqual(auditMixed('https://a/', reqs).map(f => f.level), ['high', 'medium'])
  assert.deepEqual(auditMixed('http://a/', reqs), [])
  assert.deepEqual(titles(auditForms('https://a/', [{ action: 'http://a/login', method: 'post', password: true }])), ['Password sent without TLS'])
  assert.deepEqual(titles(auditForms('https://a/', [{ action: 'https://a/login', method: 'get', password: true }])), ['Password in the address'])
  assert.deepEqual(titles(auditForms('https://a/', [{ action: 'http://a/search', method: 'get', password: false }])), ['Form posts to http'])
  assert.deepEqual(auditForms('https://a/', [{ action: '', method: 'post', password: true }]), [])
  assert.deepEqual(ranked([{ level: 'info' }, { level: 'high' }, { level: 'low' }]).map(f => f.level), ['high', 'low', 'info'])
})

test('certificate and source maps', () => {
  const now = 1_800_000_000
  const cert = { protocol: 'TLS 1.3', cipher: 'AES_128_GCM', issuer: 'R11', subjectName: 'a.example', validTo: now + 90 * 86400 }
  assert.deepEqual(titles(auditTLS(cert, now)), ['Certificate from R11'])
  assert.deepEqual(titles(auditTLS({ ...cert, validTo: now + 3 * 86400 }, now)), ['Certificate expires soon', 'Certificate from R11'])
  assert.deepEqual(titles(auditTLS({ ...cert, validTo: now - 86400 }, now)), ['Certificate expired', 'Certificate from R11'])
  assert.deepEqual(titles(auditTLS({ ...cert, protocol: 'TLS 1.1' }, now)), ['Old protocol: TLS 1.1', 'Certificate from R11'])
  assert.deepEqual(auditTLS(null, now), [])
  assert.deepEqual(auditSourceMaps([]), [])
  assert.deepEqual(titles(auditSourceMaps(['a.js.map', 'b.js.map'])), ['2 scripts name a source map'])
})
