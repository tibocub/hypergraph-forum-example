// Shared test helpers: tmp dirs, a local DHT per test, and forum peers (a
// server each, called through its JSON API). Pattern of hypergraph's
// test/next/helpers.js and SwarmFS's test/helpers.js (request F2).

import fs from 'fs'
import path from 'path'
import os from 'os'
import createTestnet from 'hyperdht/testnet.js'
import { startForum } from '../lib/server.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Polls `fn` until it returns something truthy, up to `ms`; that value, or null.
export async function eventually (fn, ms = 10000, every = 50) {
  const until = Date.now() + ms
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() >= until) return null
    await sleep(every)
  }
}

// The code of the error `promise` rejects with, or null if it resolves.
export async function codeOf (promise) {
  try {
    await promise
    return null
  } catch (err) {
    return err.code || err.message
  }
}

let counter = 0

// A fresh temp dir, removed after the test (retries: Windows keeps files locked a moment).
export function tmpDir (t, label = 'forum') {
  const dir = path.join(os.tmpdir(), `hg-forum-${label}-${Date.now()}-${counter++}-${Math.random().toString(36).slice(2, 8)}`)
  fs.mkdirSync(dir, { recursive: true })
  t.teardown(async () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
        return
      } catch {
        await sleep(200 * attempt)
      }
    }
  }, { order: 1000 })
  return dir
}

// One small local DHT (3 nodes on 127.0.0.1) per test, made on first use.
const testnets = new WeakMap()

export async function testBootstrap (t) {
  let testnet = testnets.get(t)
  if (!testnet) {
    testnet = createTestnet(3, t.teardown)
    testnets.set(t, testnet)
  }
  return (await testnet).bootstrap
}

// A forum server in its own folder on the test's DHT, closed after the test.
// `call(on, method, ...args)` is the page's call; errors carry `code`, `status`.
export async function peer (t, label, { dir } = {}) {
  dir = dir || tmpDir(t, label)
  const forum = await startForum({ dir, port: 0, bootstrap: await testBootstrap(t), deviceName: label })
  t.teardown(() => forum.close(), { order: 0 })
  const auth = { authorization: `Bearer ${forum.token}` }
  async function post (where, body) {
    const res = await fetch(forum.url + where, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) throw Object.assign(new Error(json.message), { code: json.code, status: res.status })
    return json.result
  }
  return {
    forum,
    dir,
    url: forum.url,
    token: forum.token,
    setup: (body) => post('/api/setup', body),
    call: (on, method, ...args) => post('/api/call', { on, method, args }),
    events: () => events(t, forum.url, auth)
  }
}

// The live channel, read like EventSource does: every event kept in `list`.
async function events (t, url, headers) {
  const stop = new AbortController()
  t.teardown(() => stop.abort(), { order: -1 })
  const res = await fetch(url + '/api/events', { headers, signal: stop.signal })
  const list = []
  ;(async () => {
    const decoder = new TextDecoder()
    let buf = ''
    try {
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true })
        let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const event = /^event: (.*)$/m.exec(block)
          const data = /^data: (.*)$/m.exec(block)
          if (event) list.push({ event: event[1], data: JSON.parse(data[1]) })
        }
      }
    } catch {} // aborted at teardown
  })()
  const waitFor = (event, match = () => true, ms = 5000) => eventually(() => list.find((e) => e.event === event && match(e.data)), ms, 20)
  return { list, waitFor }
}

// What the page does: A sets up and creates the forum (with the `friend` role
// and a name), then lets each other label in with a code of their own.
export async function forumOf (t, ...labels) {
  const [owner, ...others] = labels
  const a = await peer(t, owner)
  await a.setup({ password: `pw-${owner}` })
  const f = await a.call('account', 'createSpace', { name: 'Friends', policy: 'everything' })
  await a.call(f.key, 'defineRole', 'friend', ['post', 'invite'])
  await a.call(f.key, 'put', 'profile', { name: owner })
  const peers = [a]
  for (const label of others) {
    const p = await peer(t, label)
    await p.setup({ password: `pw-${label}` })
    const code = await a.call(f.key, 'createInvite', { role: 'friend', expires: Date.now() + 7 * 864e5 })
    await p.call('account', 'redeemInvite', code)
    await p.call(f.key, 'put', 'profile', { name: label })
    peers.push(p)
  }
  return { key: f.key, peers }
}
