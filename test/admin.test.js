// The admin panel: the owner makes and unmakes admins; an admin has the
// owner's rights but who is admin; hidden and flagged items listed.

import test from 'brittle'
import { forumOf, eventually, codeOf } from './helpers.js'
import { moderated, ban } from '../public/lists.js'

test('the owner makes and unmakes admins; an admin can\'t change who is admin', async (t) => {
  const { key, peers: [a, b, c] } = await forumOf(t, 'a', 'b', 'c')
  const [ib, ic] = await Promise.all([b, c].map(async (p) => (await p.call('account', 'state')).identity))
  const ia = (await a.call('account', 'state')).identity

  await a.call(key, 'setRole', ib, 'admin')
  t.ok(await eventually(async () => (await b.call(key, 'getRole', ib)) === 'admin', 10000), 'b is an admin')
  t.is(await codeOf(b.call(key, 'setRole', ic, 'admin')), 'NOT_ALLOWED', 'an admin can\'t make admins')
  t.is(await codeOf(b.call(key, 'setRole', ia, 'friend')), 'NOT_ALLOWED', 'nor touch the owner')
  await b.call(key, 'setRole', ic, 'moderator')
  t.ok(await eventually(async () => (await a.call(key, 'getRole', ic)) === 'moderator', 10000), 'an admin gives roles below theirs')
  const board = await b.call(key, 'createSubspace', { name: 'By b' })
  t.is(board.parent, key, 'and adds boards')

  await a.call(key, 'setRole', ib, 'friend')
  t.ok(await eventually(async () => (await b.call(key, 'getRole', ib)) === 'friend', 10000), 'the owner unmakes the admin')
  t.is(await codeOf(b.call(key, 'createSubspace', { name: 'No' })), 'NOT_ALLOWED', 'who then can\'t add boards')
})

test('the panel lists what moderators hid or flagged, until revealed', async (t) => {
  const { key, peers: [a] } = await forumOf(t, 'a')
  const board = await a.call(key, 'createSubspace', { name: 'Talk' })
  const p1 = await a.call(key, 'put', 'post', { title: 'rude', text: '' })
  const p2 = await a.call(board.key, 'put', 'post', { title: 'odd', text: '' })
  await a.call(key, 'moderateAction', 'hide', p1.id, { reason: 'rude' })
  await a.call(board.key, 'moderateAction', 'flag', p2.id, { reason: 'check' })

  const list = async () => (await moderated(a.call, [key, board.key])).map((d) => `${d.action}:${d.record.title}:${d.reason}`).sort()
  t.alike(await list(), ['flag:odd:check', 'hide:rude:rude'], 'both, with what and why')
  await a.call(key, 'moderateAction', 'reveal', p1.id)
  t.alike(await list(), ['flag:odd:check'], 'revealed: off the list')
})

test('ban, and delete everything they wrote, in every board, for everyone', async (t) => {
  const { key, peers: [a, b, c] } = await forumOf(t, 'a', 'b', 'c')
  const ic = (await c.call('account', 'state')).identity
  const board = await a.call(key, 'createSubspace', { name: 'Talk' })
  t.ok(await eventually(async () => (await c.call(key, 'subspaces')).some((s) => s.key === board.key), 10000), 'c has the board')
  const mine = await b.call(key, 'put', 'post', { title: 'b stays', text: '' })
  t.ok(await eventually(async () => (await c.call(key, 'get', mine.id)).record, 10000), 'c has b\'s thread')
  await c.call(key, 'put', 'post', { title: 'spam 1', text: '' })
  await c.call(board.key, 'put', 'post', { title: 'spam 2', text: '' })
  await c.call(key, 'put', 'comment', { on: mine.id, text: 'spam 3' })
  await c.call(key, 'put', 'vote', { on: mine.id, value: -1 })
  const count = async (p, space, type) => (await p.call(space, 'query', { type, by: ic, limit: 50 })).items.length
  t.ok(await eventually(async () => (await count(a, key, 'post')) === 1 && (await count(a, board.key, 'post')) === 1 && (await count(a, key, 'comment')) === 1 && (await count(a, key, 'vote')) === 1, 10000), 'a has all of c\'s')

  t.is(await ban(a.call, key, [key, board.key], ic, { reason: 'spam', wipe: true }), 4, 'banned, 4 records taken down')
  const gone = async (p) => (await count(p, key, 'post')) + (await count(p, board.key, 'post')) + (await count(p, key, 'comment')) + (await count(p, key, 'vote')) === 0
  t.ok(await gone(a), 'gone for a')
  t.ok(await eventually(() => gone(b), 10000), 'gone for b')
  t.ok(await eventually(async () => (await b.call(key, 'sum', 'vote', 'value', { on: mine.id })).value === 0, 10000), 'their vote no longer counts')
  t.ok((await a.call(key, 'members')).find((m) => m.identity === ic).banned, 'and c is banned')
  t.ok((await b.call(key, 'get', mine.id)).record, 'b\'s thread stays')
})
