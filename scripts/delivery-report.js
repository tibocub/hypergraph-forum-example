#!/usr/bin/env node
// Merges several computers' delivery.jsonl files: which posts, comments and
// votes some computer never saw, and how long they took to arrive.
//
//   node scripts/delivery-report.js tibo.jsonl sam.jsonl ...

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export function report (files) {
  const devices = []
  const records = new Map()
  const names = new Map()
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    const head = lines.find((l) => l.joinedAt)
    if (!head) continue // a computer that never got into the forum
    devices.push({ ...head, file: path.basename(file) })
    for (const l of lines) {
      if (!l.id) continue
      if (l.type === 'profile') {
        const known = names.get(l.author)
        if (!known || known.postedAt < l.postedAt) names.set(l.author, l)
        continue
      }
      if (!records.has(l.id)) records.set(l.id, { id: l.id, type: l.type, author: l.author, device: l.device, postedAt: l.postedAt, seen: new Map() })
      records.get(l.id).seen.set(head.device, l.seenAt)
    }
  }

  // A record counts for a computer only if it was posted after that computer joined.
  // shortcut: a record deleted before it reached a computer shows as missing there; check those by hand.
  const missing = []
  const delays = []
  let counted = 0
  for (const r of records.values()) {
    for (const d of devices) {
      if (r.postedAt < d.joinedAt) continue
      counted++
      if (!r.seen.has(d.device)) missing.push({ id: r.id, type: r.type, author: r.author, postedAt: r.postedAt, device: d.device, file: d.file })
      else if (d.device !== r.device) delays.push(r.seen.get(d.device) - r.postedAt)
    }
  }
  delays.sort((x, y) => x - y)
  const nameOf = (identity) => names.get(identity)?.name || identity.slice(0, 8)
  return {
    devices: devices.map((d) => ({ file: d.file, name: nameOf(d.identity), device: d.device, joinedAt: d.joinedAt })),
    counted,
    missing: missing.map((m) => ({ ...m, authorName: nameOf(m.author) })),
    delays: { count: delays.length, median: delays[Math.floor(delays.length / 2)] ?? null, worst: delays.at(-1) ?? null }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const files = process.argv.slice(2)
  if (!files.length) {
    console.log('Usage: node scripts/delivery-report.js a.jsonl b.jsonl ...')
    process.exit(1)
  }
  const r = report(files)
  for (const d of r.devices) console.log(`${d.file}: ${d.name}, in since ${new Date(d.joinedAt).toLocaleString()}`)
  console.log(`\n${r.counted} deliveries expected (record x computer).`)
  console.log(`Delays (author's clock to receiver's clock): median ${r.delays.median} ms, worst ${r.delays.worst} ms, over ${r.delays.count}.`)
  console.log(r.missing.length ? `\nMISSING (${r.missing.length}):` : '\nNothing missing.')
  for (const m of r.missing) console.log(`  ${m.type} ${m.id} by ${m.authorName}, posted ${new Date(m.postedAt).toLocaleString()}: never seen in ${m.file}`)
}
