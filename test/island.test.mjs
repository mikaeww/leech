// The island's moment, the downloads that just finished, and the shield's per-site lists.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activityOf, finishedSince, MOMENT_MS } from '../ui/island/activity.js'
import { Tracked } from '../ui/island/spring.js'
import { withSite } from '../ui/places/shield.js'

const none = { count: 0, fraction: null }

test('a moment shows for its time, then gives way', () => {
  const stopped = { kind: 'stopped', host: 'ads.test', count: 2, at: 1000 }
  assert.deepEqual(activityOf({ moments: [stopped], downloads: none, now: 1000 }), stopped)
  assert.equal(activityOf({ moments: [stopped], downloads: none, now: 1000 + MOMENT_MS - 1 }).kind, 'stopped')
  assert.equal(activityOf({ moments: [stopped], downloads: none, now: 1000 + MOMENT_MS }), null)
  assert.equal(activityOf({ moments: [stopped], downloads: none, now: 999 }), null, 'a moment from a later clock is not shown')
})

test('the newest moment wins; a download shows when no moment does', () => {
  const stopped = { kind: 'stopped', host: 'ads.test', count: 1, at: 1000 }
  const playing = { kind: 'playing', title: 'Song', at: 2000 }
  const downloads = { count: 1, fraction: 0.5 }
  assert.equal(activityOf({ moments: [stopped, playing, null], downloads, now: 2500 }).kind, 'playing')
  assert.equal(activityOf({ moments: [{ ...stopped, at: 3000 }, playing], downloads, now: 3500 }).kind, 'stopped')
  assert.deepEqual(activityOf({ moments: [stopped, playing], downloads, now: 9000 }), { kind: 'download', count: 1, fraction: 0.5 })
  assert.deepEqual(activityOf({ moments: [], downloads: { count: 2 }, now: 0 }), { kind: 'download', count: 2, fraction: null })
  assert.equal(activityOf({ moments: [], downloads: undefined, now: 0 }), null)
})

test('only downloads finished after the first list count as new', () => {
  const first = finishedSince(null, [{ path: '/a', state: 'done' }, { path: '/b', state: 'running' }])
  assert.deepEqual(first.finished, [], 'what was there at start is old')
  const next = finishedSince(first.seen, [{ path: '/a', state: 'done' }, { path: '/b', state: 'done' }, { path: '/c' }])
  assert.deepEqual(next.finished.map(d => d.path), ['/b', '/c'], 'Electron lists finished ones without a state')
  assert.deepEqual(finishedSince(next.seen, [{ path: '/b', state: 'done' }]).finished, [])
})

test('the spring grows past its target and settles on it exactly; the curve shrinks without passing it', () => {
  const w = new Tracked(184)
  w.springTo(480)
  let over = false
  for (let i = 0; i < 240 && w.animating; i++) { w.step(1 / 60); over ||= w.value > 480 }
  assert.ok(over, 'damping 0.72 overshoots a little, as Coucou')
  assert.equal(w.animating, false)
  assert.equal(w.value, 480)
  w.curveTowards(184, 340, 0)
  for (let t = 0; t <= 340; t += 17) { w.step(0.017, t); assert.ok(w.value >= 184 && w.value <= 480, `stays between at ${t} ms`) }
  w.step(0.017, 400)
  assert.equal(w.value, 184)
  assert.equal(w.animating, false)
})

test('a site goes in once, sorted, and comes out', () => {
  assert.deepEqual(withSite(['b.to'], 'a.to', true), ['a.to', 'b.to'])
  assert.deepEqual(withSite(['a.to', 'b.to'], 'a.to', true), ['a.to', 'b.to'])
  assert.deepEqual(withSite(['a.to', 'b.to'], 'a.to', false), ['b.to'])
  assert.deepEqual(withSite([], 'a.to', false), [])
})
