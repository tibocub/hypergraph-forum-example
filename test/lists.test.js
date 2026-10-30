// The page's lists (public/lists.js), read through the JSON API: comment
// counts, sorting, search, a person's page.

import test from 'brittle'
import { forumOf } from './helpers.js'
import { commentCount } from '../public/lists.js'

test('a thread\'s comment count includes replies', async (t) => {
  const { key, peers: [a] } = await forumOf(t, 'a')
  const post = await a.call(key, 'put', 'post', { title: 'Hi', text: '' })
  const c1 = await a.call(key, 'put', 'comment', { on: post.id, text: '1' })
  const c2 = await a.call(key, 'put', 'comment', { on: c1.id, text: '1.1' })
  await a.call(key, 'put', 'comment', { on: c2.id, text: '1.1.1' })
  await a.call(key, 'put', 'comment', { on: post.id, text: '2' })
  t.is(await commentCount(a.call, key, post.id), 4, 'two comments, two replies')
})
