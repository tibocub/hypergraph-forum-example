// A public forum (hypergraph spec 016): the owner or an admin opens it for
// good; anyone joins with its one link, with no admin online. Invites stay.

import test from 'brittle'
import { peer, forumOf, eventually, codeOf } from './helpers.js'

test('the owner makes the forum public; anyone joins with its link while the owner is offline', async (t) => {
  const { key, peers: [a, b] } = await forumOf(t, 'a', 'b')
  t.is(await a.call(key, 'isPublic'), false, 'invite-only at first')
  t.is(await codeOf(a.call(key, 'publicLink')), 'NOT_ALLOWED', 'no public link before')
  t.is(await codeOf(b.call(key, 'makePublic')), 'NOT_ALLOWED', 'a friend can\'t make it public')

  await a.call(key, 'makePublic')
  const link = await a.call(key, 'publicLink')
  t.ok(await eventually(() => b.call(key, 'isPublic'), 10000), 'b hears it is public')
  t.is(await b.call(key, 'publicLink'), link, 'the same link on every member')
  await a.forum.close()

  // What the join screen does, with the link in the code field.
  const c = await peer(t, 'c')
  await c.setup({ password: 'pw-c-long' })
  const f = await c.call('account', 'redeemInvite', link)
  t.is(f.key, key, 'c is in, with only b online')
  await c.call(key, 'put', 'profile', { name: 'c' })
  const cid = (await c.call('account', 'state')).identity
  t.is(await c.call(key, 'getRole', cid), 'member', 'as a member')
  const post = await c.call(key, 'put', 'post', { title: 'Hello', text: 'from c' })

  t.ok(await eventually(async () => (await b.call(key, 'members')).some((m) => m.identity === cid && m.role === 'member'), 15000), 'b lists c once c wrote')
  t.ok(await eventually(async () => (await b.call(key, 'query', { type: 'post' })).items.some((p) => p.id === post.id), 15000), 'b reads c\'s thread')
  t.ok(await b.call(key, 'createInvite', { role: 'friend' }), 'invite codes still work')
})
