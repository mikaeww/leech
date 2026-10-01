// The archive's rules: who is due, and the list's order, limit and search.
import assert from 'node:assert/strict'
import test from 'node:test'
import { Archive, ARCHIVE_LIMIT, dueForArchive } from '../ui/places/archive.js'

const tab = (id, fields = {}) => ({ id, url: `https://site${id}.example/`, title: `Site ${id}`, touched: 0, space: 'personal', ...fields })

test('only idle loose web tabs off screen are due', () => {
  const tabs = [
    tab(1), tab(2, { touched: 950 }), tab(3, { pin: 'S' }), tab(4, { essential: true, pin: 'S' }), tab(5, { folder: 'f' }),
    tab(6, { shy: true }), tab(7, { audible: true }), tab(8), tab(9, { url: null }), tab(10, { url: 'file:///x' }),
    tab(11, { loading: true }), tab(12, { signin: {} }), tab(13, { touched: 900 }), tab(14, { split: 8 })
  ]
  const due = dueForArchive(tabs, { now: 1000, after: 100, active: 8 })
  assert.deepEqual(due.map(t => t.id), [1, 13])
})

test('newest first, the oldest leave past the limit, search sees titles and addresses', () => {
  const saved = []
  const archive = new Archive([{ id: 'old', url: 'https://old.example/', title: 'Old' }, { junk: true }], list => saved.push(list.length))
  assert.equal(archive.list.length, 1)
  archive.put([tab(1), tab(2)], 5)
  assert.deepEqual(archive.list.map(e => e.title), ['Site 1', 'Site 2', 'Old'])
  assert.deepEqual(archive.matching('site2').map(e => e.title), ['Site 2'])
  assert.deepEqual(archive.matching('old').map(e => e.title), ['Old'])
  const first = archive.list[0].id
  assert.equal(archive.take(first).title, 'Site 1')
  assert.equal(archive.take(first), null)
  archive.put(Array.from({ length: ARCHIVE_LIMIT + 3 }, (_, i) => tab(i)), 6)
  assert.equal(archive.list.length, ARCHIVE_LIMIT)
  assert.equal(archive.list[0].title, 'Site 0')
  assert.ok(saved.length >= 3)
})
