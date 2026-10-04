// The logic without a DOM: addresses, engines, history ranking, the password CSV, the Essentials grid.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oneLine, toURL, pretty } from '../ui/places/address.js'
import { searchURL, template, name, ENGINES } from '../ui/places/engine.js'
import { suggest, completion } from '../ui/places/history.js'
import { gridFor, heldOffset, placeOf, tileUnder } from '../ui/tabs/groups/tiles.js'

test('typed text becomes a place or nothing', () => {
  assert.equal(toURL('github.com'), 'https://github.com')
  assert.equal(toURL('  example.com/a?b#c '), 'https://example.com/a?b#c')
  assert.equal(toURL('localhost:3000'), 'http://localhost:3000')
  assert.equal(toURL('192.168.1.10/admin'), 'http://192.168.1.10/admin')
  assert.equal(toURL('about:blank'), 'about:blank')
  assert.equal(toURL('view-source:https://x.org/'), 'view-source:https://x.org/')
  for (const no of ['hello world', 'todo', '1.2.3', 'me@example.com', 'ftp://x.org', '-bad.com']) assert.equal(toURL(no), null, no)
  assert.equal(pretty('https://www.github.com/'), 'github.com')
  assert.equal(pretty('https://github.com/a/b'), 'github.com/a/b')
  // A link wrapped in a terminal, pasted: the breaks and the indent around them go, other spaces stay.
  assert.equal(oneLine('  https://a.org/x?y=1&\n  z=2\r\nw \n'), 'https://a.org/x?y=1&z=2w')
  assert.equal(oneLine('rust gtk'), 'rust gtk')
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

test('sign-ins come out of a CSV export with quotes and commas intact', async () => {
  const { createRequire } = await import('node:module')
  const { csvLogins } = createRequire(import.meta.url)('../electron/importers.js')
  const got = csvLogins('﻿name,url,username,password,note\r\nGitHub,https://github.com/login,me,"p,w""x","a\nb"\r\nEmpty,https://x.org,,,\n')
  assert.deepEqual(got, [{ host: 'https://github.com/login', user: 'me', password: 'p,w"x' }])
})

test('a tile carried across the Essentials lands under the pointer and stays there', () => {
  const step = { cols: 3, stepX: 40, stepY: 38 }
  // From the end of the first row one step right: the row's end, not the next row's start.
  assert.equal(tileUnder({ ...step, from: 2, count: 6, dx: 40, dy: 0 }), 2)
  assert.equal(tileUnder({ ...step, from: 2, count: 6, dx: -80, dy: 38 }), 3)
  assert.equal(tileUnder({ ...step, from: 0, count: 4, dx: 80, dy: 38 }), 3)
  assert.equal(tileUnder({ ...step, from: 4, count: 6, dx: 0, dy: -200 }), 1)
  // Every move in a 3×2 grid: the held tile is drawn exactly at the pointer, measured from its old slot.
  for (let from = 0; from < 6; from++) {
    for (let dx = -120; dx <= 120; dx += 10) {
      for (let dy = -76; dy <= 76; dy += 19) {
        const to = tileUnder({ ...step, from, count: 6, dx, dy })
        const held = heldOffset({ ...step, from, to, dx, dy })
        const old = placeOf(from, { cols: 3, w: 36, h: 34 })
        const now = placeOf(to, { cols: 3, w: 36, h: 34 })
        assert.equal(now.x + held.x, old.x + dx)
        assert.equal(now.y + held.y, old.y + dy)
      }
    }
  }
})

test('the Essentials grid is three across at least, two rows beyond that', () => {
  assert.deepEqual(gridFor(0, 158), { cols: 3, w: 50, h: 34 })
  assert.equal(gridFor(7, 158).cols, 4)
  assert.deepEqual(placeOf(4, gridFor(7, 158)), { x: 0, y: 38 })
})
