// The forum's local server: one hypergraph account, the page, the JSON API
// (lib/bridge.js) and the live channel (lib/live.js), on 127.0.0.1 behind a
// random token.

import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { Hypergraph } from 'hypergraph/next'
import { types, rules } from './types.js'
import { call, toJSON } from './bridge.js'
import { Live } from './live.js'
import { Delivery } from './delivery.js'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const FILES = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/markdown.js': ['markdown.js', 'text/javascript'],
  '/lists.js': ['lists.js', 'text/javascript'],
  '/theme.js': ['theme.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css']
}
const MAX_BODY = 1e6

// `dir`: the forum's data folder (hypergraph's folder, the token). `port` 0:
// any free one.
export async function startForum ({ dir, port = 4790, bootstrap, deviceName = os.hostname() }) {
  fs.mkdirSync(dir, { recursive: true })
  const token = readToken(dir)
  const hgDir = path.join(dir, 'hypergraph')
  const live = new Live()
  let hg = null
  let settingUp = null

  const delivery = new Delivery(path.join(dir, 'delivery.jsonl'))

  // Listens before connecting, so nothing arrives unseen by the delivery log.
  const open = async (opts) => {
    const opened = await Hypergraph.open(hgDir, { types, rules, bootstrap, deviceName, ...opts })
    delivery.attach(opened)
    live.attach(opened)
    try {
      await opened.connectToSwarm()
    } catch (err) {
      await opened.close()
      throw err
    }
    hg = opened
  }
  if (fs.existsSync(hgDir)) await open({})

  // A new account ({ password }) or this computer joining one ({ password, joinCode }).
  async function setup ({ password, joinCode } = {}) {
    if (hg || settingUp) throw httpError(409, 'ALREADY_SET_UP', 'This computer is already set up')
    if (typeof password !== 'string' || password.length < 8) throw httpError(400, 'BAD_PASSWORD', 'A password of 8 characters at least')
    settingUp = open(joinCode ? { password, joinCode } : { password })
    try {
      await settingUp
    } catch (err) {
      fs.rmSync(hgDir, { recursive: true, force: true }) // it was empty before: start again cleanly
      throw err
    } finally {
      settingUp = null
    }
    return { setUp: true }
  }

  const server = http.createServer((req, res) => handle(req, res).catch((err) => fail(res, err)))
  async function handle (req, res) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const here = `127.0.0.1:${server.address().port}`
    if (req.headers.host !== here && req.headers.host !== `localhost:${server.address().port}`) return send(res, 403, { code: 'BAD_HOST' })
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { code: 'BAD_ORIGIN' })
    const cookie = `forum-${server.address().port}`

    if (url.pathname === '/login') {
      if (!same(url.searchParams.get('token'), token)) return send(res, 401, { code: 'BAD_TOKEN', message: 'Open the link the forum program printed' })
      res.writeHead(302, { location: '/', 'set-cookie': `${cookie}=${token}; HttpOnly; SameSite=Strict; Path=/` })
      return res.end()
    }
    if (!same(given(req, cookie), token)) return send(res, 401, { code: 'BAD_TOKEN', message: 'Open the link the forum program printed' })

    if (req.method === 'GET' && FILES[url.pathname]) {
      const [file, type] = FILES[url.pathname]
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-cache' })
      return res.end(fs.readFileSync(path.join(PUBLIC, file)))
    }
    if (req.method === 'GET' && url.pathname === '/api/events') return live.add(res)
    if (req.method === 'POST' && (url.pathname === '/api/call' || url.pathname === '/api/setup')) {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { code: 'NOT_JSON' })
      const body = await readJSON(req)
      const result = url.pathname === '/api/setup' ? await setup(body) : await call(hg, body)
      return send(res, 200, { result: result === undefined ? null : result })
    }
    send(res, 404, { code: 'NOT_FOUND' })
  }

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
  } catch (err) {
    if (hg) await hg.close()
    throw err
  }
  const url = `http://127.0.0.1:${server.address().port}`

  let closing = null
  return {
    url,
    token,
    get hg () { return hg },
    close: () => (closing ??= (async () => {
      live.close()
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      await (settingUp || Promise.resolve()).catch(() => {})
      if (hg) await hg.close()
    })())
  }
}

// The token, kept in the data folder so a bookmark survives a restart.
function readToken (dir) {
  const file = path.join(dir, 'token')
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 })
  return fs.readFileSync(file, 'utf8').trim()
}

function given (req, cookie) {
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || '')
  if (bearer) return bearer[1]
  const found = (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === cookie)
  return found ? found[1] : null
}

function same (a, b) {
  return typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

async function readJSON (req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > MAX_BODY) throw httpError(413, 'TOO_BIG', 'Request too big')
  }
  try {
    return JSON.parse(body)
  } catch {
    throw httpError(400, 'BAD_JSON', 'Not JSON')
  }
}

function httpError (status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

// hypergraph's errors (with a code) and TypeErrors are the caller's: 400.
function fail (res, err) {
  if (res.headersSent) return res.end()
  const status = err.status || (err.code || err instanceof TypeError ? 400 : 500)
  if (status === 500) console.error(err)
  send(res, status, { code: err.code || (err instanceof TypeError ? 'BAD_ARGUMENT' : 'INTERNAL'), message: err.message })
}

function send (res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body, toJSON))
}
