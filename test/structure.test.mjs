// The structure check finds every limit it promises, on projects it builds for itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inspect, LIMITS } from '../tools/structure.mjs'

function project (files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leech-structure-'))
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), text)
  }
  return root
}

test('a tidy project passes and says what it covered', () => {
  const root = project({ 'ui/README.md': 'ui\n', 'ui/a.js': '// a\n', 'ui/logo.png': Buffer.from([0x89, 0, 1]) })
  const { problems, covered } = inspect(root)
  assert.deepEqual(problems, [])
  assert.equal(covered.files, 2)
  assert.equal(covered.skipped, 1)
})

test('every limit is found', () => {
  const many = Object.fromEntries(Array.from({ length: LIMITS.codePerDir + 1 }, (_, i) => [`ui/m${i}.js`, '']))
  const root = project({
    ...many,
    'ui/README.md': '',
    'ui/long.css': 'a\n'.repeat(LIMITS.lines + 1),
    'ui/bare.js': 'x()\n',
    'ui/helpers.js': '',
    'ui/a/b/c/d/e/deep.js': '',
    'electron/main.js': ''
  })
  const found = inspect(root).problems.join('\n')
  assert.match(found, /ui\/long\.css: 501 lines/)
  assert.match(found, /ui\/: \d+ code files/)
  assert.match(found, /ui\/helpers\.js: "helpers" names no concept/)
  assert.match(found, /ui\/a\/b\/c\/d\/e\/: 5 levels deep/)
  assert.match(found, /electron\/: no README\.md/)
  assert.match(found, /ui\/bare\.js: doesn't open with a comment/)
})

test('symlinks are not followed', () => {
  const root = project({ 'ui/README.md': '' })
  fs.symlinkSync(os.tmpdir(), path.join(root, 'ui', 'elsewhere'))
  assert.deepEqual(inspect(root).problems, [])
})
