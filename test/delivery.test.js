// Story 5: each computer logs when it first saw each post, comment and vote;
// a restart logs nothing twice; the report finds what some computer never saw.

import test from 'brittle'
import fs from 'fs'
import path from 'path'
import { peer, forumOf, eventually, tmpDir } from './helpers.js'
import { report } from '../scripts/delivery-report.js'

const lines = (p) => fs.readFileSync(path.join(p.dir, 'delivery.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))

test('posted at and first seen, no duplicates after a restart, and the report', async (t) => {
  const { key, peers: [a, b] } = await forumOf(t, 'a', 'b')
  const post = await b.call(key, 'put', 'post', { title: 'Hi', text: '' })
  const line = await eventually(() => lines(a).find((l) => l.id === post.id), 10000)
  t.ok(line, 'a logged b\'s post')
  t.is(line.postedAt, post.stamp, 'posted at: its stamp')
  t.ok(line.seenAt >= line.postedAt - 1000 && line.seenAt < Date.now() + 1, 'first seen: a\'s clock')
  t.is(line.author, post.author, 'with its author')
  t.ok(lines(b).find((l) => l.id === post.id), 'b logged its own post too')
  t.ok(lines(a)[0].joinedAt && lines(a)[0].device, 'the first line says which computer and since when')

  // a goes away; b comments meanwhile; a comes back.
  const aDir = a.dir
  await a.forum.close()
  const comment = await b.call(key, 'put', 'comment', { on: post.id, text: 'while a was away' })
  const a2 = await peer(t, 'a-back', { dir: aDir })
  t.is(a2.token, a.token, 'the same token after a restart')
  t.is((await a2.call(key, 'get', post.id)).record.title, 'Hi', 'the post is still there')
  const live = await a2.events()
  t.ok(await eventually(() => lines(a2).find((l) => l.id === comment.id), 15000), 'the comment written while a was away is logged when it arrives')
  const vote = await b.call(key, 'put', 'vote', { on: post.id, value: 1 })
  t.ok(await live.waitFor('change', (d) => d.records.some((r) => r.id === vote.id), 10000), 'the live channel works again')
  const ids = lines(a2).filter((l) => l.id).map((l) => l.id)
  t.is(ids.length, new Set(ids).size, 'nothing logged twice')

  await eventually(() => lines(a2).find((l) => l.id === vote.id) && lines(b).find((l) => l.id === comment.id), 10000)
  const files = [path.join(aDir, 'delivery.jsonl'), path.join(b.dir, 'delivery.jsonl')]
  const ok = report(files)
  t.is(ok.missing.length, 0, 'the report: nothing missing')
  t.ok(ok.counted >= 3, `counted ${ok.counted} records`)

  // Drop the comment from a's log: the report names it.
  const out = tmpDir(t, 'report')
  const cut = path.join(out, 'a.jsonl')
  fs.writeFileSync(cut, fs.readFileSync(files[0], 'utf8').split('\n').filter((l) => !l.includes(comment.id)).join('\n'))
  const bad = report([cut, files[1]])
  t.alike(bad.missing.map((m) => [m.id, m.device]), [[comment.id, lines(a2)[0].device]], 'the comment, missing on a')
})
