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

// What moderators hid or flagged in `spaces` and still is: the decisions
// ({ action, by, at, reason, space, record }), newest first.
// shortcut: reads each space's last 200 decisions, one get() per hide or flag (no query of hidden or
// flagged records, F10); page with `after` if a forum ever has more.
export async function moderated (call, spaces) {
  const found = await Promise.all(spaces.map(async (space) => {
    const seen = new Set()
    const wanted = (await call(space, 'decisions', { limit: 200 })).items
      .filter((d) => d.type === 'moderate' && (d.action === 'hide' || d.action === 'flag') && !seen.has(d.action + d.target) && seen.add(d.action + d.target))
    return Promise.all(wanted.map(async (d) => {
      const { record } = await call(space, 'get', d.target)
      return record && record[d.action === 'hide' ? 'hidden' : 'flagged'] ? { ...d, space, record } : null
    }))
  }))
  return found.flat().filter(Boolean).sort((x, y) => y.at - x.at)
}

// Bans `identity` from `forum`; with `wipe`, also takes down every thread, comment and vote of
// theirs in `spaces`. Returns how many were taken down.
// shortcut: one remove per record (no bulk take-down in hypergraph, F11); fine for a friends' forum.
export async function ban (call, forum, spaces, identity, { reason = '', wipe = false } = {}) {
  await call(forum, 'moderateAction', 'ban', identity, { reason })
  let n = 0
  for (const space of wipe ? spaces : []) {
    for (const type of ['post', 'comment', 'vote']) {
      for (const r of (await all(call, space, type, { by: identity })).items) {
        await call(space, 'moderateAction', 'remove', r.id, { reason })
        n++
      }
    }
  }
  return n
}

// Members' reports in `spaces`, newest first, each with its `space` and `record` (what it is
// about, null if that is gone). A moderator dismisses one by removing it.
export async function reports (call, spaces) {
  const found = await Promise.all(spaces.map(async (space) => Promise.all((await all(call, space, 'report')).items
    .map(async (r) => ({ ...r, space, record: (await call(space, 'get', r.on)).record })))))
  return found.flat().sort((x, y) => y.stamp - x.stamp)
}

// The forum's look: the newest theme record by its owner or an admin, checked (safeTheme).
// shortcut: anyone may put a `theme` and reads skip theirs (no write permission per type, F13);
// reads the last 50, so 50 themes by others in a row hide the real one.
export async function themeOf (call, forum) {
  const { items } = await call(forum, 'query', { type: 'theme', limit: 50 })
  for (const r of items) if (['owner', 'admin'].includes(await call(forum, 'getRole', r.author))) return safeTheme(r)
  return {}
}

// The comments on `id`, with their score. `sort`: 'old' (oldest first) or 'votes' (most first, then oldest).
export async function replies (call, space, id, sort = 'old') {
  const { items } = await call(space, 'linked', id, 'comment')
  const rows = await Promise.all(items.map(async (c) => ({ ...c, score: await score(call, space, c.id) })))
  return rows.sort((x, y) => (sort === 'votes' ? y.score - x.score : 0) || x.stamp - y.stamp)
}
