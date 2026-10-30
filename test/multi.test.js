// Several forums per account: create and join more than one; invites, the
// live channel and the delivery log work per forum.

import test from 'brittle'
import fs from 'fs'
import path from 'path'
import { forumOf, eventually, tmpDir } from './helpers.js'
import { report } from '../scripts/delivery-report.js'

const lines = (p) => fs.readFileSync(path.join(p.dir, 'delivery.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))

test('a second forum: made, joined by invite, live, and logged on its own', async (t) => {
  const { key, peers: [a, b] } = await forumOf(t, 'a', 'b')
  const liveB = await b.events()
  await new Promise((resolve) => setTimeout(resolve, 300)) // so b joins the second forum clearly later than the first
  const second = await a.call('account', 'createSpace', { name: 'Games', policy: 'everything' })
  await a.call(second.key, 'defineRole', 'friend', ['post', 'invite'])
  t.alike((await a.call('account', 'state')).forums.map((f) => f.name).sort(), ['Friends', 'Games'], 'a is in both')

  const code = await a.call(second.key, 'createInvite', { role: 'friend' })
  const joined = await b.call('account', 'redeemInvite', code)
  t.is(joined.key, second.key, 'b joins the second forum')
  t.is((await b.call('account', 'state')).forums.length, 2, 'b is in both')
  t.is(await b.call(second.key, 'getRole', (await b.call('account', 'state')).identity), 'friend', 'as a friend there')

  const post = await a.call(second.key, 'put', 'post', { title: 'Chess?', text: '' })
  t.ok(await liveB.waitFor('change', (d) => d.space === second.key && d.records.some((r) => r.id === post.id), 10000), 'b\'s live channel says which forum')
  t.is((await b.call(key, 'query', { type: 'post', limit: 5 })).items.length, 0, 'the first forum doesn\'t get it')

  const line = await eventually(() => lines(b).find((l) => l.id === post.id), 10000)
  t.ok(line && line.forum === second.key && !line.backlog, 'b logs it, with its forum, not as old')
  const heads = lines(b).filter((l) => l.joinedAt)
  t.alike(heads.map((h) => h.forum).sort(), [key, second.key].sort(), 'b\'s log says when it joined each forum')
  t.ok(heads.find((h) => h.forum === second.key).joinedAt > heads.find((h) => h.forum === key).joinedAt, 'the second later')

  await eventually(() => lines(a).find((l) => l.id === post.id), 10000)
  const r = report([path.join(a.dir, 'delivery.jsonl'), path.join(b.dir, 'delivery.jsonl')])
  t.is(r.missing.length, 0, 'the report: nothing missing in either forum')
})

test('the report reads a log from the one-forum version too', async (t) => {
  const dir = tmpDir(t, 'report')
  const write = (name, rows) => { fs.writeFileSync(path.join(dir, name), rows.map((r) => JSON.stringify(r)).join('\n')); return path.join(dir, name) }
  const old = write('old.jsonl', [{ identity: 'i1', device: 'd1', joinedAt: 100 }, { id: 'p1', type: 'post', author: 'i2', device: 'd2', postedAt: 200, seenAt: 210 }])
  const now = write('new.jsonl', [{ identity: 'i2', device: 'd2', forum: 'F', joinedAt: 50 }, { identity: 'i2', device: 'd2', forum: 'G', joinedAt: 500 },
    { id: 'p1', type: 'post', forum: 'F', author: 'i2', device: 'd2', postedAt: 200, seenAt: 200 },
    { id: 'p2', type: 'post', forum: 'G', author: 'i2', device: 'd2', postedAt: 600, seenAt: 600 }])
  const r = report([old, now])
  t.alike(r.missing.map((m) => `${m.id}@${m.device}`), ['p2@d1'], 'the old computer counts for any forum: p2 missing there')
  t.is(r.counted, 3, 'p1 on both, p2 on new only (old for any forum, new joined G before p2)')
})
