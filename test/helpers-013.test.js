// FR-012, T029: the owner lists helpers (hypergraph spec 013); everyone sees
// the list; nothing waits for a helper, even one that doesn't exist.

import test from 'brittle'
import crypto from 'crypto'
import { forumOf, eventually, codeOf } from './helpers.js'

test('the owner lists helpers; members see them; the forum works with the helper down', async (t) => {
  const { key, peers: [a, b] } = await forumOf(t, 'a', 'b')
  const liveB = await b.events()
  const helper = crypto.randomBytes(32).toString('hex') // nobody runs it: "the VPS is down"

  t.alike(await a.call(key, 'helpers'), [], 'none at first')
  t.is(await codeOf(b.call(key, 'setHelpers', [helper])), 'NOT_ALLOWED', 'only the owner lists helpers')
  await a.call(key, 'setHelpers', [helper])
  const listed = await a.call(key, 'helpers')
  t.is(listed.length, 1, 'listed (as z32)')
  t.ok(await liveB.waitFor('decisions', (d) => d.space === key, 10000), 'b\'s live channel says decisions changed')
  t.alike(await eventually(async () => { const h = await b.call(key, 'helpers'); return h.length ? h : null }, 10000), listed, 'b sees the same list')

  const board = await a.call(key, 'createSubspace', { name: 'Talk' })
  t.is(await codeOf(a.call(board.key, 'setHelpers', [helper])), 'NOT_ALLOWED', 'boards use the forum\'s helpers')

  t.ok(await eventually(async () => (await b.call(key, 'subspaces')).some((s) => s.key === board.key), 10000), 'b has the board')
  const post = await b.call(board.key, 'put', 'post', { title: 'still works', text: '' })
  t.ok(await eventually(async () => (await a.call(board.key, 'get', post.id)).record, 10000), 'posts still arrive with the helper down')

  await a.call(key, 'setHelpers', [])
  t.alike(await a.call(key, 'helpers'), [], '[] clears the list')
})
