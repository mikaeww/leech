// Where a download landed, said against the downloads folder, and the folders the Downloads panel lists.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldersOf, landedIn } from '../ui/places/sorting/landed.js'

const ROOT = '/home/m/Downloads'

test('a path is said against the downloads folder', () => {
  assert.equal(landedIn('/home/m/Downloads/a.pdf', ROOT), '')
  assert.equal(landedIn('/home/m/Downloads/a.pdf', ROOT + '/'), '')
  assert.equal(landedIn('/home/m/Downloads/Documents/a.pdf', ROOT), 'Documents')
  assert.equal(landedIn('/home/m/Downloads/x/y/a.pdf', ROOT), 'x/y')
  assert.equal(landedIn('/home/m/Downloads-old/a.pdf', ROOT), '/home/m/Downloads-old')
  assert.equal(landedIn('/tmp/a.pdf', ROOT), '/tmp')
})

test('folders: the downloads folder first, kind folders while sorting, the rest after', () => {
  const items = [
    { path: '/home/m/Downloads/Documents/b.pdf' },
    { path: '/tmp/c.txt' },
    { path: '/home/m/Downloads/a.bin' },
    { path: '/home/m/Downloads/Documents/d.pdf' },
    { path: '' }
  ]
  const off = foldersOf(items, ROOT, false)
  assert.deepEqual(off.map(f => [f.rel, f.items.length]), [['', 1], ['Documents', 2], ['/tmp', 1]])
  assert.deepEqual(off.map(f => f.path), [ROOT, ROOT + '/Documents', '/tmp'])
  const on = foldersOf(items, ROOT, true)
  assert.deepEqual(on.map(f => f.rel), ['', 'Images', 'Documents', 'Code', 'Installers', 'Other', '/tmp'])
  assert.deepEqual(on.find(f => f.rel === 'Documents').items.map(d => d.path), ['/home/m/Downloads/Documents/b.pdf', '/home/m/Downloads/Documents/d.pdf'])
  assert.equal(on.find(f => f.rel === 'Images').items.length, 0)
})
