// Related tabs and sorted downloads: which pages are a topic's home and belong to one; which folder a file goes in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KINDS, kindOf, OTHER } from '../ui/places/sorting/kinds.js'
import { belongs, topicOf } from '../ui/places/sorting/topics.js'

test('a repository or a package is a topic', () => {
  assert.deepEqual(topicOf('https://github.com/mikaeww/leech'), { key: 'github.com/mikaeww/leech', name: 'leech' })
  assert.deepEqual(topicOf('https://github.com/mikaeww/leech/issues/184'), { key: 'github.com/mikaeww/leech', name: 'leech' })
  assert.deepEqual(topicOf('https://gitlab.com/a/b-tool.git'), { key: 'gitlab.com/a/b-tool', name: 'b-tool' })
  assert.deepEqual(topicOf('https://www.npmjs.com/package/@scope/thing'), { key: 'npmjs.com/@scope/thing', name: 'thing' })
  assert.deepEqual(topicOf('https://pypi.org/project/requests/'), { key: 'pypi.org/requests', name: 'requests' })
  for (const no of ['https://github.com/', 'https://github.com/mikaeww', 'https://github.com/orgs/x/people', 'https://example.com/a/b', 'about:blank', '', 'not a url']) {
    assert.equal(topicOf(no), null, no)
  }
})

test('pages that name a topic belong to it', () => {
  const leech = topicOf('https://github.com/mikaeww/leech')
  assert.ok(belongs(leech, 'https://github.com/mikaeww/leech/issues/184', 'Issue #184'))
  assert.ok(belongs(leech, 'https://mikaeww.github.io/leech/', 'Home'))
  assert.ok(belongs(leech, 'https://stackoverflow.com/questions/1/x', 'How do I build Leech on Arch?'))
  assert.ok(belongs(leech, 'https://www.youtube.com/watch?v=1', 'Leech tutorial - YouTube'))
  assert.ok(!belongs(leech, 'https://github.com/other/thing', 'leech fork'), 'another repository is its own topic')
  assert.ok(!belongs(leech, 'https://en.wikipedia.org/wiki/Leeches', 'Leeches'), 'a word, not a part of one')
  const tool = topicOf('https://github.com/a/my-tool')
  assert.ok(belongs(tool, 'https://docs.rs/x', 'Using my tool with Rust'), 'a name of several words, in a row')
  assert.ok(!belongs(tool, 'https://x.org/', 'my other tool'))
  assert.ok(!belongs(topicOf('https://github.com/a/app'), 'https://x.org/', 'An app'), 'too common to relate anything')
  assert.ok(!belongs(leech, 'https://x.org/%E0%A4%A', 'broken'), 'a broken escape is no crash')
  assert.ok(!belongs(null, 'https://x.org/', 'leech'))
})

test('a download goes in the folder of its kind', () => {
  assert.equal(kindOf('photo.JPG'), 'Images')
  assert.equal(kindOf('report.final.pdf'), 'Documents')
  assert.equal(kindOf('main.rs'), 'Code')
  assert.equal(kindOf('leech-0.2.0.AppImage'), 'Installers')
  for (const other of ['archive.tar.gz', 'noext', '.bashrc', 'song.mp3', 'dir.png/x']) assert.equal(kindOf(other), OTHER, other)
  const names = KINDS.map(([n]) => n).concat(OTHER)
  assert.equal(new Set(names).size, names.length, 'folder names are unique')
  for (const n of names) assert.match(n, /^[A-Za-z]+$/, 'a folder name is a plain word, safe as a path part')
  const exts = KINDS.flatMap(([, e]) => e)
  assert.equal(new Set(exts).size, exts.length, 'each extension has one folder')
})
