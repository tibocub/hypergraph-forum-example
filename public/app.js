// The whole forum UI. Every read and write is one hypergraph call through
// /api/call; the live channel says when to read again what is on screen.

import { markdown } from './markdown.js'

const $ = (sel) => document.querySelector(sel)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const when = (ms) => new Date(ms).toLocaleString()

let me = null // { identity, forum }
let route = []

async function call (on, method, ...args) {
  const res = await fetch('/api/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on, method, args }) })
  const json = await res.json()
  if (!res.ok) throw Object.assign(new Error(json.message || json.code), { code: json.code })
  return json.result
}

function showError (err) {
  const box = $('#error')
  box.textContent = MESSAGES[err.code] || err.message
  box.hidden = false
  setTimeout(() => { box.hidden = true }, 6000)
}

const MESSAGES = {
  INVITE_INVALID: 'Nobody who can let you in is online right now. Ask the person who sent the code to open the forum, then try again.',
  INVITE_USED_UP: 'This code was already used. Ask for a new one.',
  INVITE_EXPIRED: 'This code has expired. Ask for a new one.',
  BAD_TOKEN: 'Open the forum from the link its program printed.'
}

// Runs a form's action with its fields; errors shown, not thrown.
function onSubmit (form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const button = form.querySelector('button[type=submit]')
    button.disabled = true
    try {
      await fn(Object.fromEntries(new FormData(form)))
    } catch (err) {
      showError(err)
    } finally {
      button.disabled = false
    }
  })
}

// --- names (FR-007): a member's latest profile record ---

const names = new Map()
async function nameOf (identity) {
  if (!names.has(identity)) {
    names.set(identity, call(me.forum.key, 'query', { type: 'profile', by: identity, limit: 1 })
      .then((r) => r.items[0]?.name || identity.slice(0, 8)))
  }
  return names.get(identity)
}

// --- screens ---

function setupScreen () {
  $('#main').innerHTML = `
    <h1>Welcome</h1>
    <form id="new" class="card"><strong>New here</strong>
      <label>Choose a password (8 characters at least) <input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <button type="submit">Create my account</button></form>
    <form id="device" class="card"><strong>I already use the forum on another computer</strong>
      <label>Device code (from Settings on the other computer) <input name="joinCode" required></label>
      <label>A password for this computer <input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <button type="submit">Add this computer</button></form>`
  onSubmit($('#new'), async ({ password }) => {
    await call('account', 'state') // fails early if the token is gone
    await setup({ password })
    phraseScreen(password)
  })
  onSubmit($('#device'), async (body) => { await setup(body); await start() })
}

async function setup (body) {
  const res = await fetch('/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json()
  if (!res.ok) throw Object.assign(new Error(json.message || json.code), { code: json.code })
}

async function phraseScreen (password) {
  const words = await call('account', 'recoveryPhrase', password)
  $('#main').innerHTML = `
    <h1>Your recovery phrase</h1>
    <p>Write these 24 words on paper. With them you get your account back on a new computer.</p>
    <p class="card words">${esc(words)}</p>
    <p><button id="keep">I wrote them down — keep them here too, behind my password</button></p>
    <p><button id="forget">I wrote them down — forget them on this computer</button></p>`
  $('#keep').onclick = () => start()
  $('#forget').onclick = () => call('account', 'forgetRecoveryPhrase').then(start, showError)
}

function joinScreen () {
  $('#main').innerHTML = `
    <h1>Join the forum</h1>
    <form id="join" class="card">
      <label>Invite code (a friend sends it to you) <input name="code" required></label>
      <label>Your name, as others will see it <input name="name" maxlength="40" required></label>
      <button type="submit">Join</button></form>
    <details class="card"><summary>Nobody has made the forum yet? Create it.</summary>
      <form id="create">
        <label>Forum name <input name="forum" required></label>
        <label>Your name <input name="name" maxlength="40" required></label>
        <button type="submit">Create the forum</button></form></details>`
  onSubmit($('#join'), async ({ code, name }) => {
    const f = await call('account', 'redeemInvite', code.trim())
    await call(f.key, 'put', 'profile', { name })
    await start()
  })
  onSubmit($('#create'), async ({ forum, name }) => {
    const f = await call('account', 'createSpace', { name: forum, policy: 'everything' })
    await call(f.key, 'defineRole', 'friend', ['post', 'invite']) // any member may invite (Tibo, F6)
    await call(f.key, 'put', 'profile', { name })
    await start()
  })
}

async function navBar () {
  const boards = [{ key: me.forum.key, name: 'General' }, ...await call(me.forum.key, 'subspaces')]
  $('#brand').textContent = me.forum.name || 'Forum'
  $('#boards').innerHTML = boards.map((b) => `<a href="#/b/${esc(b.key)}" class="${route[1] === b.key ? 'here' : ''}">${esc(b.name)}</a>`).join('')
  $('#settings-link').hidden = false
  const peers = await call(me.forum.key, 'peers')
  $('#online').textContent = `${new Set(peers.map((p) => p.identity)).size} other(s) online`
}

const PAGE = 20

async function boardScreen (board) {
  $('#main').innerHTML = `
    <div id="list"></div><p><button id="more" hidden>More</button></p>
    <form id="post" class="card"><strong>New thread</strong>
      <input name="title" maxlength="300" placeholder="Title" required>
      <textarea name="text" placeholder="Text (**bold**, *italic*, [link](https://…), - lists)"></textarea>
      <button type="submit">Post</button></form>`
  let shown = PAGE
  const render = async () => {
    const { items, complete } = await call(board, 'query', { type: 'post', limit: shown })
    const rows = await Promise.all(items.map(async (p) => {
      const [score, comments, who] = await Promise.all([call(board, 'sum', 'vote', 'value', { on: p.id }), call(board, 'count', 'comment', { on: p.id }), nameOf(p.author)])
      return `<div class="card"><a class="thread-title" href="#/t/${esc(board)}/${esc(p.id)}">${esc(p.title)}</a>
        <div class="muted">${score.value} points · ${comments.value} comments · ${esc(who)} · ${when(p.stamp)}</div></div>`
    }))
    $('#more').hidden = items.length < shown
    return (rows.join('') || '<p class="muted">No threads yet.</p>') + (complete ? '' : '<p class="muted">Still syncing…</p>')
  }
  $('#more').onclick = () => { shown += PAGE; refresh() }
  onSubmit($('#post'), async ({ title, text }) => {
    const p = await call(board, 'put', 'post', { title, text })
    location.hash = `#/t/${board}/${p.id}`
  })
  return { space: board, types: ['post', 'comment', 'vote', 'profile'], render, into: '#list' }
}

async function threadScreen (board, id) {
  $('#main').innerHTML = `<div id="thread"></div>
    <form id="reply" class="card"><strong id="reply-to">Comment</strong>
      <textarea name="text" required></textarea>
      <div><button type="submit">Send</button> <button type="button" class="link" id="reply-reset" hidden>Comment on the thread instead</button></div></form>`
  let replyTo = id
  const resetReply = () => { replyTo = id; $('#reply-to').textContent = 'Comment'; $('#reply-reset').hidden = true }
  $('#reply-reset').onclick = resetReply
  onSubmit($('#reply'), async ({ text }) => {
    await call(board, 'put', 'comment', { on: replyTo, text })
    $('#reply').reset()
    resetReply()
    refresh()
  })

  // shortcut: one linked() call per comment, fine for a friends' forum; batch if threads reach hundreds of comments.
  const item = async (r) => {
    const [score, who, replies] = await Promise.all([call(board, 'sum', 'vote', 'value', { on: r.id }), nameOf(r.author), call(board, 'linked', r.id, 'comment')])
    replies.items.sort((x, y) => x.stamp - y.stamp)
    const mine = r.author === me.identity
    const body = r.type === 'post' ? `<h1>${esc(r.title)}</h1>${markdown(r.text)}` : markdown(r.text)
    return `<div class="${r.type === 'post' ? 'card' : 'comment'}" data-id="${esc(r.id)}" data-type="${r.type}">
      ${body}
      <div class="muted votes">
        <button data-act="up" aria-label="Vote up">▲</button> ${score.value} <button data-act="down" aria-label="Vote down">▼</button>
        · ${esc(who)} · ${when(r.stamp)}${r.edited ? ' · edited' : ''}
        <button class="link" data-act="reply">reply</button>
        ${mine ? '<button class="link" data-act="edit">edit</button><button class="link" data-act="del">delete</button>' : ''}
      </div>
      ${(await Promise.all(replies.items.map(item))).join('')}</div>`
  }
  const render = async () => {
    const { record, deleted } = await call(board, 'get', id)
    if (!record) return `<p class="muted">${deleted ? 'This thread was deleted.' : 'This thread isn\'t here yet: still syncing…'}</p>`
    return item(record)
  }
  $('#thread').onclick = async (e) => {
    const act = e.target.dataset.act
    const el = e.target.closest('[data-id]')
    if (!act || !el) return
    const rid = el.dataset.id
    try {
      if (act === 'up' || act === 'down') await call(board, 'put', 'vote', { on: rid, value: act === 'up' ? 1 : -1 })
      if (act === 'reply') { replyTo = rid; $('#reply-to').textContent = 'Reply'; $('#reply-reset').hidden = false; $('#reply textarea').focus() }
      if (act === 'del' && confirm('Delete this for everyone?')) await call(board, 'del', rid)
      if (act === 'edit') await edit(board, rid, el.dataset.type)
      refresh()
    } catch (err) { showError(err) }
  }
  return { space: board, types: ['post', 'comment', 'vote', 'profile'], render, into: '#thread' }
}

async function edit (board, id, type) {
  const { record } = await call(board, 'get', id)
  const changes = {}
  if (type === 'post') {
    const title = prompt('Title', record.title)
    if (title === null) return
    changes.title = title
  }
  const text = prompt('Text', record.text)
  if (text === null) return
  changes.text = text
  await call(board, 'edit', id, changes)
}

async function settingsScreen () {
  const role = await call(me.forum.key, 'getRole', me.identity)
  const decides = role === 'owner' || role === 'admin'
  $('#main').innerHTML = `
    <h1>Settings</h1>
    <form id="name" class="card"><label>Your name <input name="name" maxlength="40" required value="${esc(await nameOf(me.identity))}"></label><button type="submit">Save</button></form>
    <div class="card"><strong>Invite a friend</strong>
      <p class="muted">A code works once, for 7 days. Send it any way you like.</p>
      <p><button id="invite">Make a code</button></p><p class="words" id="code"></p></div>
    ${decides ? `<form id="board" class="card"><strong>New board</strong><input name="name" required><button type="submit">Add</button></form>` : ''}`
  onSubmit($('#name'), async ({ name }) => {
    await call(me.forum.key, 'put', 'profile', { name })
    names.delete(me.identity)
  })
  $('#invite').onclick = async () => {
    try {
      // F6: only owner and admins can give `friend`; a friend's code gives `member`.
      const code = await call(me.forum.key, 'createInvite', { role: decides ? 'friend' : 'member', expires: Date.now() + 7 * 864e5 })
      $('#code').textContent = code
    } catch (err) { showError(err) }
  }
  if (decides) {
    onSubmit($('#board'), async ({ name }) => {
      const b = await call(me.forum.key, 'createSubspace', { name })
      await call(b.key, 'setPolicy', 'everything') // sub-spaces don't follow the forum's policy (F5)
      location.hash = `#/b/${b.key}`
    })
  }
  return null
}

// --- routing and live updates ---

let screen = null
let lastHTML = ''

async function refresh () {
  if (!screen) return
  const target = screen
  const html = await target.render()
  // shortcut: live events may come with nothing changed (hypergraph live.js issue); skip identical redraws.
  if (target !== screen || html === lastHTML) return
  lastHTML = html
  $(target.into).innerHTML = html
}

async function show () {
  route = location.hash.replace(/^#\/?/, '').split('/')
  if (route[0] === 'b' && route[1]) screen = await boardScreen(route[1])
  else if (route[0] === 't' && route[1] && route[2]) screen = await threadScreen(route[1], route[2])
  else if (route[0] === 'settings') screen = await settingsScreen()
  else return (location.hash = `#/b/${me.forum.key}`)
  lastHTML = ''
  await Promise.all([refresh(), navBar()])
}

async function start () {
  me = await call('account', 'state')
  if (!me.setUp) return setupScreen()
  if (!me.forum) return joinScreen()
  await show()
}

let pending = null
const soon = (fn) => { clearTimeout(pending); pending = setTimeout(() => fn().catch(showError), 100) }

const live = new EventSource('/api/events')
live.addEventListener('change', (e) => {
  const { space, records } = JSON.parse(e.data)
  if (records.some((r) => r.type === 'profile')) names.clear()
  if (screen && space === screen.space && records.some((r) => screen.types.includes(r.type))) soon(refresh)
})
for (const name of ['spaces', 'peers']) live.addEventListener(name, () => { if (me?.forum) soon(navBar) })
// A computer just paired gets the forum a moment after setup.
live.addEventListener('spaces', () => { if (me?.setUp && !me.forum) soon(start) })

window.addEventListener('hashchange', () => { if (me?.forum) show().catch(showError) })
start().catch(showError)
