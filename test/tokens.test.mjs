// The token check catches each raw value it promises to, and lets tokens and marked exceptions through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { declarations, judge } from '../tools/tokens.mjs'

test('raw values are caught, tokens pass', () => {
  assert.match(judge('color', '#333'), /raw colour/)
  assert.match(judge('background', 'rgb(0 0 0 / 0.1)'), /raw colour/)
  assert.equal(judge('background', 'rgb(from var(--page) r g b / 0.74)'), null)
  assert.match(judge('font-size', '12.5px'), /--fs/)
  assert.equal(judge('font-size', 'var(--fs-body)'), null)
  assert.match(judge('border-radius', '99px'), /--r/)
  assert.equal(judge('border-radius', 'calc(var(--r) - var(--s2))'), null)
  assert.match(judge('padding', '9px 15px'), /--s scale/)
  assert.equal(judge('padding', '0 var(--s5)'), null)
  assert.match(judge('box-shadow', '0 1px 2px rgb(0 0 0 / 0.1)'), /shadow/)
  assert.match(judge('border', '1px solid var(--faint)'), /border/)
  assert.equal(judge('mask', 'radial-gradient(circle, transparent 8px, black 9px)'), null)
})

test('declarations know their line, skip comments and see raw marks', () => {
  const got = declarations('/* a: #fff */\n.a { color: #fff; } /* raw: why */\n.b:hover { padding: 3px; }')
  assert.deepEqual(got.map(d => [d.line, d.property, d.marked]), [[2, 'color', true], [3, 'padding', false]])
})
