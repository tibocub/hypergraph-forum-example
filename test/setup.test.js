// Story 1: set up, create the one forum, let friends in with one-time codes.

import test from 'brittle'
import { peer, forumOf, eventually, codeOf } from './helpers.js'

test('set up, create the forum, one forum only, the recovery phrase behind the password', async (t) => {
  const a = await peer(t, 'a')
  t.alike(await a.call('account', 'state'), { setUp: false }, 'not set up yet')
  t.is(await codeOf(a.setup({ password: 'short' })), 'BAD_PASSWORD', 'a password of 8 at least')
  await a.setup({ password: 'pw-a-long' })
  t.is(await codeOf(a.setup({ password: 'pw-a-long' })), 'ALREADY_SET_UP', 'once')

  const state = await a.call('account', 'state')
  t.ok(state.setUp && typeof state.identity === 'string' && state.forum === null, 'set up, no forum yet')

  const f = await a.call('account', 'createSpace', { name: 'Friends', policy: 'everything' })
  t.is(f.name, 'Friends', 'the forum, as { key, name }')
  t.is((await a.call('account', 'state')).forum.key, f.key, 'state shows it')
  t.is((await a.call(f.key, 'status')).policy, 'everything', 'every member keeps everything')
  t.is(await codeOf(a.call('account', 'createSpace', { name: 'Another' })), 'ONE_FORUM', 'one forum per account')

  t.ok(await codeOf(a.call('account', 'recoveryPhrase')), 'the phrase needs the password')
  const words = await a.call('account', 'recoveryPhrase', 'pw-a-long')
  t.is(words.split(' ').length, 24, '24 words with it')
})

test('friends join with one-time codes, and any member invites', async (t) => {
  const { key, peers: [a, b] } = await forumOf(t, 'a', 'b')
  const bState = await b.call('account', 'state')
  t.is(bState.forum.key, key, 'b is in the forum')
  t.is(await b.call(key, 'getRole', bState.identity), 'friend', 'as a friend')
  t.is(await codeOf(b.call('account', 'redeemInvite', 'whatever')), 'ONE_FORUM', 'no second forum')

  const code = await a.call(key, 'createInvite', { role: 'friend', expires: Date.now() + 864e5 })
  const c = await peer(t, 'c')
  await c.setup({ password: 'pw-c-long' })
  await c.call('account', 'redeemInvite', code)
  const d = await peer(t, 'd')
  await d.setup({ password: 'pw-d-long' })
  t.is(await codeOf(d.call('account', 'redeemInvite', code)), 'INVITE_USED_UP', 'a code works once')

  // F6: a friend invites to their own role, not above it.
  t.is(await codeOf(b.call(key, 'createInvite', { role: 'admin' })), 'NOT_ALLOWED', 'a friend can\'t invite as admin')
  const fromB = await b.call(key, 'createInvite', { role: 'friend', expires: Date.now() + 864e5 })
  await d.call('account', 'redeemInvite', fromB)
  const dState = await d.call('account', 'state')
  t.ok(await eventually(async () => (await a.call(key, 'getRole', dState.identity)) === 'friend', 10000), 'b let d in as a friend (F6)')

  const names = async () => (await a.call(key, 'members')).filter((m) => m.role).length
  t.ok(await eventually(async () => (await names()) === 4, 10000), 'a lists the 4 members')
})
