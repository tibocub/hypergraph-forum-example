// Story 2: boards, threads, comments, replies, votes, edit, delete, live.

import test from 'brittle'
import { forumOf, eventually, codeOf } from './helpers.js'

test('boards, a thread, comments and replies, votes, edit and delete, across 3 members', async (t) => {
  const { key, peers: [a, b, c] } = await forumOf(t, 'a', 'b', 'c')
  const liveA = await a.events()

  const games = await a.call(key, 'createSubspace', { name: 'Games' })
  await a.call(games.key, 'setPolicy', 'everything')
  t.is(games.parent, key, 'a board is a sub-forum')
  t.is(await codeOf(b.call(key, 'createSubspace', { name: 'Mine' })), 'NOT_ALLOWED', 'only owner and admins add boards')
  t.ok(await eventually(async () => (await b.call(key, 'subspaces')).some((s) => s.key === games.key), 10000), 'b sees the board')
  t.is((await b.call(games.key, 'status')).policy, 'everything', 'kept whole too (F5)')

  const post = await b.call(games.key, 'put', 'post', { title: 'Chess?', text: '**who** plays' })
  const started = Date.now()
  t.ok(await liveA.waitFor('change', (d) => d.space === games.key && d.records.some((r) => r.id === post.id), 2000), 'a\'s live channel gets it within 2 s (SC-002)')
  t.comment(`seen by a after ${Date.now() - started} ms`)
  t.is((await a.call(games.key, 'get', post.id)).record.text, '**who** plays', 'the text as written (Markdown is the page\'s)')

  const reply = await c.call(games.key, 'put', 'comment', { on: post.id, text: 'me' })
  await b.call(games.key, 'put', 'comment', { on: reply.id, text: 'great' })
  const tree = async () => {
    const top = (await a.call(games.key, 'linked', post.id, 'comment')).items
    if (top.length !== 1) return null
    const under = (await a.call(games.key, 'linked', top[0].id, 'comment')).items
    return under.length === 1 && `${top[0].text}/${under[0].text}`
  }
  t.is(await eventually(tree, 10000), 'me/great', 'a sees the comment and the reply under it')

  await b.call(games.key, 'put', 'vote', { on: post.id, value: 1 })
  await c.call(games.key, 'put', 'vote', { on: post.id, value: 1 })
  await c.call(games.key, 'put', 'vote', { on: post.id, value: -1 })
  const score = async () => (await a.call(games.key, 'sum', 'vote', 'value', { on: post.id })).value
  t.ok(await eventually(async () => (await score()) === 0, 10000), 'voting again replaces the vote: +1 -1 = 0')
  t.is(await codeOf(c.call(games.key, 'put', 'vote', { on: post.id, value: 5 })), 'RULE_REJECTED', 'a vote is +1 or -1')

  await b.call(games.key, 'edit', post.id, { title: 'Chess tonight?' })
  t.ok(await eventually(async () => (await a.call(games.key, 'get', post.id)).record?.title === 'Chess tonight?', 10000), 'the edit reaches a')
  t.is(await codeOf(c.call(games.key, 'edit', post.id, { title: 'mine now' })), 'NOT_ALLOWED', 'only the author edits')

  await c.call(games.key, 'del', reply.id)
  t.ok(await eventually(async () => (await a.call(games.key, 'get', reply.id)).deleted?.by === 'author', 10000), 'a sees the comment deleted by its author')
})

test('a board pages newest first, with the last post sent back as JSON (F3)', async (t) => {
  const { key, peers: [a] } = await forumOf(t, 'a')
  for (let i = 1; i <= 5; i++) await a.call(key, 'put', 'post', { title: `p${i}`, text: '' })
  const first = await a.call(key, 'query', { type: 'post', limit: 2 })
  const second = await a.call(key, 'query', { type: 'post', limit: 2, after: first.items.at(-1) })
  const third = await a.call(key, 'query', { type: 'post', limit: 2, after: second.items.at(-1) })
  t.alike([...first.items, ...second.items, ...third.items].map((p) => p.title), ['p5', 'p4', 'p3', 'p2', 'p1'], 'no post skipped or repeated')
  t.ok(first.complete, 'complete')
  t.is(await codeOf(a.call(key, 'query', { type: 'nope' })), 'BAD_REQUEST', 'only the forum\'s types')
})
