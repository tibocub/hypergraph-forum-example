// Story 3: roles, hide/reveal, take down, ban/unban, refusals with a reason,
// and the moderation log.

import test from 'brittle'
import { forumOf, eventually, codeOf } from './helpers.js'

test('a moderator hides, reveals and takes down; bans, the owner unbans; the log says who and why', async (t) => {
  const { key, peers: [a, b, c] } = await forumOf(t, 'a', 'b', 'c')
  const [ib, ic] = await Promise.all([b, c].map(async (p) => (await p.call('account', 'state')).identity))

  await a.call(key, 'setRole', ib, 'moderator')
  t.ok(await eventually(async () => (await b.call(key, 'getRole', ib)) === 'moderator', 10000), 'b is a moderator')

  const board = await a.call(key, 'createSubspace', { name: 'Talk' })
  t.ok(await eventually(async () => (await c.call('account', 'spaces')).some((s) => s.key === board.key), 10000), 'c has the board')
  const post = await c.call(board.key, 'put', 'post', { title: 'Hi', text: '' })
  const rude = await c.call(board.key, 'put', 'comment', { on: post.id, text: 'rude' })
  const shown = async () => (await a.call(board.key, 'linked', post.id, 'comment')).items.length
  t.ok(await eventually(async () => (await shown()) === 1 && (await b.call(board.key, 'get', rude.id)).record, 10000), 'everyone has the comment')

  t.is(await codeOf(c.call(board.key, 'moderateAction', 'hide', rude.id, { reason: 'mine' })), 'NOT_ALLOWED', 'a friend can\'t moderate')
  await b.call(board.key, 'moderateAction', 'hide', rude.id, { reason: 'rude' })
  t.ok(await eventually(async () => (await shown()) === 0, 10000), 'hidden: out of a\'s list (in a board, with the forum\'s roles)')
  t.ok((await a.call(board.key, 'get', rude.id)).record.hidden, 'get() still finds it, marked hidden')
  await b.call(board.key, 'moderateAction', 'reveal', rude.id)
  t.ok(await eventually(async () => (await shown()) === 1, 10000), 'revealed: back')
  await b.call(board.key, 'moderateAction', 'remove', rude.id, { reason: 'really rude' })
  t.ok(await eventually(async () => (await a.call(board.key, 'get', rude.id)).deleted?.by === 'space', 10000), 'taken down for good')

  const refused = await c.call(key, 'moderateAction', 'ban', ib).catch((err) => err)
  t.ok(refused.code === 'NOT_ALLOWED' && refused.message.length > 10, `refused with a reason: "${refused.message}"`)
  await b.call(key, 'moderateAction', 'ban', ic, { reason: 'spam' })
  const banned = async () => (await a.call(key, 'members')).find((m) => m.identity === ic)?.banned
  t.ok(await eventually(banned, 10000), 'c is banned')
  t.ok(await eventually(async () => (await codeOf(c.call(board.key, 'put', 'post', { title: 'still here', text: '' }))) === 'NOT_ALLOWED', 10000), 'c\'s app refuses c\'s posts')

  await a.call(key, 'moderateAction', 'unban', ic)
  t.ok(await eventually(async () => !(await banned()), 10000), 'unbanned')

  const log = (await b.call(key, 'decisions', { limit: 50 })).items
  t.ok(await eventually(async () => (await b.call(key, 'decisions', { limit: 50 })).items.some((d) => d.reason === 'spam'), 10000), 'the log has the ban and its reason')
  t.ok(log.length > 0 && log.every((d) => d.by && d.at), 'each decision says who and when')
  const boardLog = (await a.call(board.key, 'decisions', { limit: 50 })).items
  t.alike(boardLog.filter((d) => d.type === 'moderate').map((d) => `${d.action}:${d.reason}`), ['remove:really rude', 'reveal:', 'hide:rude'], "a board's own log has its hides, newest first")
})
