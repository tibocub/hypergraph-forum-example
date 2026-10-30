// What the page reads, built from hypergraph calls: `call(on, method, ...args)`
// is the page's call (and the tests' peer.call).

import { safeTheme } from './theme.js'

// How many comments are under `id`, replies included.
export async function commentCount (call, space, id) {
  const { items } = await call(space, 'linked', id, 'comment')
  const under = await Promise.all(items.map((c) => commentCount(call, space, c.id)))
  return items.length + under.reduce((a, b) => a + b, 0)
}

const score = async (call, space, id) => (await call(space, 'sum', 'vote', 'value', { on: id })).value

// Every record of `type` in `space` (filters as the bridge's query), newest first.
export async function all (call, space, type, filters = {}) {
  const items = []
  let complete = true
  for (let after; ;) {
    const page = await call(space, 'query', { type, limit: 100, after, ...filters })
    items.push(...page.items)
    complete = complete && page.complete
    if (page.items.length < 100) return { items, complete }
    after = page.items.at(-1)
  }
}

// A board's first `limit` threads with their score and comment count. `sort`:
// 'new' (newest first), 'votes' or 'comments' (most first, then newest).
// shortcut: votes and comments read every thread of the board (no sorted query in hypergraph, F8);
// fine for a friends' forum, slow past a few hundred threads.
export async function threads (call, board, { sort = 'new', limit = 20 } = {}) {
  const { items, complete } = sort === 'new' ? await call(board, 'query', { type: 'post', limit: limit + 1 }) : await all(call, board, 'post')
  const rows = await Promise.all(items.map(async (p) => ({ ...p, score: await score(call, board, p.id), comments: await commentCount(call, board, p.id) })))
  if (sort !== 'new') rows.sort((x, y) => y[sort === 'votes' ? 'score' : 'comments'] - x[sort === 'votes' ? 'score' : 'comments'] || y.stamp - x.stamp)
  return { items: rows.slice(0, limit), more: rows.length > limit, complete }
}

// The threads of `spaces` whose title or text has every word of `words` (any case), newest first.
// shortcut: reads every thread (no text search in hypergraph, F9); fine for a friends' forum.
export async function search (call, spaces, words) {
  const terms = words.toLowerCase().split(/\s+/).filter(Boolean)
  const found = await Promise.all(spaces.map(async (space) => (await all(call, space, 'post')).items
    .filter((p) => terms.every((w) => `${p.title}\n${p.text}`.toLowerCase().includes(w)))
    .map((p) => ({ ...p, space }))))
  return found.flat().sort((x, y) => y.stamp - x.stamp)
}

// A member's latest profile ({ name, quote, contact, websites }), or {}.
export async function profileOf (call, forum, identity) {
  return (await call(forum, 'query', { type: 'profile', by: identity, limit: 1 })).items[0] || {}
}

// What `identity` wrote in `spaces`, threads and comments, newest first, each with
// its `space`; a comment also has `thread` (its thread's id, null if that was deleted).
export async function activity (call, spaces, identity) {
  const found = await Promise.all(spaces.map(async (space) => {
    const [posts, comments] = await Promise.all(['post', 'comment'].map((type) => all(call, space, type, { by: identity })))
    const withThread = await Promise.all(comments.items.map(async (c) => ({ ...c, thread: await threadOf(call, space, c) })))
    return [...posts.items, ...withThread].map((r) => ({ ...r, space }))
  }))
  return found.flat().sort((x, y) => y.stamp - x.stamp)
}

// The id of the thread a record is in (itself for a thread), or null if that was deleted.
export async function threadOf (call, space, r) {
  while (r && r.type === 'comment') r = (await call(space, 'get', r.on)).record
  return r ? r.id : null
}

// What moderators hid or flagged in `spaces` and still is: [{ action: 'hide' | 'flag', space, record }],
// newest record first.
export async function moderated (call, spaces) {
  const found = await Promise.all(spaces.flatMap((space) => ['post', 'comment'].flatMap((type) => [['hide', 'hidden'], ['flag', 'flagged']]
    .map(async ([action, state]) => (await all(call, space, type, { moderated: state })).items.map((record) => ({ action, space, record }))))))
  return found.flat().sort((x, y) => y.record.stamp - x.record.stamp)
}

// Members' reports in `spaces` (moderators only), grouped by what they are about, most recently
// reported first: [{ space, on, record (null if gone), count, reports: [{ id, by, reason, stamp }] }].
export async function reports (call, spaces) {
  const found = await Promise.all(spaces.map(async (space) => Promise.all((await call(space, 'reports')).items
    .map(async (g) => ({ ...g, space, record: (await call(space, 'get', g.on)).record })))))
  return found.flat().sort((x, y) => y.reports[0].stamp - x.reports[0].stamp)
}

// The forum's look: its latest `look` (only owner and admins may put one), checked (safeTheme).
export async function themeOf (call, forum) {
  return safeTheme((await call(forum, 'query', { type: 'look', limit: 1 })).items[0])
}

// The comments on `id`, with their score. `sort`: 'old' (oldest first) or 'votes' (most first, then oldest).
export async function replies (call, space, id, sort = 'old') {
  const { items } = await call(space, 'linked', id, 'comment')
  const rows = await Promise.all(items.map(async (c) => ({ ...c, score: await score(call, space, c.id) })))
  return rows.sort((x, y) => (sort === 'votes' ? y.score - x.score : 0) || x.stamp - y.stamp)
}
