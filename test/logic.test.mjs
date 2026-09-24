import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toURL, pretty } from '../ui/address.js'
import { searchURL, template, name, ENGINES } from '../ui/engine.js'
import { suggest, completion } from '../ui/history.js'

test('typed text becomes a place or nothing', () => {
  assert.equal(toURL('github.com'), 'https://github.com')
  assert.equal(toURL('  example.com/a?b#c '), 'https://example.com/a?b#c')
  assert.equal(toURL('localhost:3000'), 'http://localhost:3000')
  assert.equal(toURL('192.168.1.10/admin'), 'http://192.168.1.10/admin')
  assert.equal(toURL('about:blank'), 'about:blank')
  for (const no of ['hello world', 'todo', '1.2.3', 'me@example.com', 'ftp://x.org', '-bad.com']) assert.equal(toURL(no), null, no)
  assert.equal(pretty('https://www.github.com/'), 'github.com')
  assert.equal(pretty('https://github.com/a/b'), 'github.com/a/b')
})

test('searches are escaped and custom templates checked', () => {
  assert.equal(searchURL('rust gtk & co', template('google')), 'https://www.google.com/search?q=rust%20gtk%20%26%20co&sourceid=chrome&ie=UTF-8')
  assert.equal(searchURL('über', template('google')), 'https://www.google.com/search?q=%C3%BCber&sourceid=chrome&ie=UTF-8')
  assert.equal(template('custom', 'https://s.example/?q=%s'), 'https://s.example/?q=%s')
  assert.equal(template('custom', 'https://%s.example/'), ENGINES[0][2])
  assert.equal(name('custom', 'https://www.s.example/?q=%s'), 's.example')
})

test('front doors and frecency win', () => {
  const v = (key, count, daysAgo) => [key, { url: `https://${key}`, key, title: '', count, last: 1e9 - daysAgo * 86400 }]
  const visits = new Map([v('github.com', 3, 0), v('github.com/a/b', 9, 0), v('gitlab.com', 1, 90)])
  const got = suggest(visits, 'git', 3, 1e9)
  assert.equal(got[0].key, 'github.com/a/b')
  assert.ok(got.some(s => s.key === 'github.com'))
  assert.equal(completion('gi', got), 'thub.com/a/b')
  assert.deepEqual(suggest(visits, '', 3, 1e9), [])
  assert.equal(suggest(new Map(), 'wiki', 1, 1e9)[0].key, 'wikipedia.org')
})
