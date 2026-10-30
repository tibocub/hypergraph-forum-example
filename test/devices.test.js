// Story 4: a second computer joins with a device code; same person, same
// forum, same name; a lost one is removed with the password.

import test from 'brittle'
import { peer, forumOf, eventually, codeOf } from './helpers.js'

test('a second computer: same person and forum; removed with the password', async (t) => {
  const { key, peers: [a, b] } = await forumOf(t, 'a', 'b')
  const me = await a.call('account', 'state')

  t.ok(await codeOf(a.call('account', 'addDevice', { password: 'wrong-password' })), 'a code needs the password')
  const { code } = await a.call('account', 'addDevice', { password: 'pw-a-long' })
  t.ok(typeof code === 'string' && code.length > 10, 'a device code')

  const a2 = await peer(t, 'a2')
  await a2.setup({ password: 'pw-a2-long', joinCode: code })
  const state = await a2.call('account', 'state')
  t.is(state.identity, me.identity, 'the same person')
  t.not(state.device, me.device, 'another device')
  t.ok(await eventually(async () => (await a2.call('account', 'state')).forums.some((f) => f.key === key), 15000), 'the forum is there')

  const post = await eventually(async () => a2.call(key, 'put', 'post', { title: 'from my laptop', text: '' }).catch(() => null), 10000)
  t.ok(post, 'it writes in the forum')
  t.ok(await eventually(async () => (await b.call(key, 'get', post.id)).record?.author === me.identity, 10000), 'b sees it as a\'s')
  t.ok(await eventually(async () => (await a2.call(key, 'query', { type: 'profile', by: me.identity, limit: 1 })).items[0]?.name === 'a', 10000), 'the same name')

  t.ok(await eventually(async () => (await a.call('account', 'devices')).length === 2, 10000), 'a lists two devices')
  await a.call('account', 'removeDevice', state.device, { password: 'pw-a-long' })
  t.ok(await eventually(async () => (await a.call('account', 'devices')).length === 1, 10000), 'removed')
})

test('a wrong device code: refused, and this computer can try again', async (t) => {
  const p = await peer(t, 'p')
  t.ok(await codeOf(p.setup({ password: 'pw-p-long', joinCode: 'not-a-code' })), 'refused')
  t.alike(await p.call('account', 'state'), { setUp: false }, 'still not set up')
  await p.setup({ password: 'pw-p-long' })
  t.ok((await p.call('account', 'state')).setUp, 'a new account works after it')
})
