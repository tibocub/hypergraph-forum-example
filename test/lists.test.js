// The page's lists (public/lists.js), read through the JSON API: comment
// counts, sorting, search, a person's page.

import test from 'brittle'
import { forumOf } from './helpers.js'
import { commentCount, threads, replies, search } from '../public/lists.js'

test('a thread\'s comment count includes replies', async (t) => {
  const { key, peers: [a] } = await forumOf(t, 'a')
  const post = await a.call(key, 'put', 'post', { title: 'Hi', text: '' })
  const c1 = await a.call(key, 'put', 'comment', { on: post.id, text: '1' })
  const c2 = await a.call(key, 'put', 'comment', { on: c1.id, text: '1.1' })
  await a.call(key, 'put', 'comment', { on: c2.id, text: '1.1.1' })
  await a.call(key, 'put', 'comment', { on: post.id, text: '2' })
  t.is(await commentCount(a.call, key, post.id), 4, 'two comments, two replies')
})

test('a board sorts threads by date, votes or comments; a thread sorts comments by date or votes', async (t) => {
  const { key, peers: [a] } = await forumOf(t, 'a')
  const old = await a.call(key, 'put', 'post', { title: 'old', text: '' })
  const liked = await a.call(key, 'put', 'post', { title: 'liked', text: '' })
  const talked = await a.call(key, 'put', 'post', { title: 'talked', text: '' })
  await a.call(key, 'put', 'vote', { on: liked.id, value: 1 })
  await a.call(key, 'put', 'vote', { on: talked.id, value: -1 })
  const first = await a.call(key, 'put', 'comment', { on: talked.id, text: 'first' })
  const second = await a.call(key, 'put', 'comment', { on: talked.id, text: 'second' })
  await a.call(key, 'put', 'comment', { on: first.id, text: 'reply' })
  await a.call(key, 'put', 'vote', { on: second.id, value: 1 })

  const titles = async (sort, limit) => (await threads(a.call, key, { sort, limit })).items.map((p) => p.title)
  t.alike(await titles('new'), ['talked', 'liked', 'old'], 'by date: newest first (the default)')
  t.alike(await titles('votes'), ['liked', 'old', 'talked'], 'by votes')
  t.alike(await titles('comments'), ['talked', 'liked', 'old'], 'by comments, replies counted, then newest')
  const page = await threads(a.call, key, { sort: 'votes', limit: 2 })
  t.ok(page.items.length === 2 && page.more && page.items[0].score === 1 && page.items[1].comments === 0, 'a page, with score and count, and more to come')

  const texts = async (sort) => (await replies(a.call, key, talked.id, sort)).map((c) => c.text)
  t.alike(await texts(), ['first', 'second'], 'comments by date: oldest first (the default)')
  t.alike(await texts('votes'), ['second', 'first'], 'comments by votes')
})

test('search finds threads by title or text, in a board or the whole forum', async (t) => {
  const { key, peers: [a] } = await forumOf(t, 'a')
  const board = await a.call(key, 'createSubspace', { name: 'Talk' })
  await a.call(key, 'put', 'post', { title: 'Cats', text: 'they are great' })
  await a.call(key, 'put', 'post', { title: 'Dogs', text: 'better than CATS' })
  await a.call(board.key, 'put', 'post', { title: 'More cats', text: '' })
  const post = await a.call(key, 'put', 'post', { title: 'Birds', text: '' })
  await a.call(key, 'put', 'comment', { on: post.id, text: 'cats eat them' })

  const titles = async (spaces, words) => (await search(a.call, spaces, words)).map((p) => p.title)
  t.alike(await titles([key], 'cats'), ['Dogs', 'Cats'], 'in a board: title or text, any case, not comments')
  t.alike(await titles([key, board.key], 'cats'), ['More cats', 'Dogs', 'Cats'], 'forum-wide, newest first')
  t.alike(await titles([key, board.key], 'cats great'), ['Cats'], 'every word must match')
  t.is((await search(a.call, [board.key], 'cats'))[0].space, board.key, 'each result says its board')
})

