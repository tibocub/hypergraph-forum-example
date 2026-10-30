// The whole forum UI. Every read and write is one hypergraph call through
// /api/call; the live channel says when to read again what is on screen.

import { markdown } from './markdown.js'
import { threads, replies, search, profileOf, activity } from './lists.js'

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
// A member's name, as a link to their page.
const person = async (identity) => `<a href="#/u/${esc(identity)}">${esc(await nameOf(identity))}</a>`

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
  const boards = [{ key: me.forum.key, name: 'General' }, ...(await call(me.forum.key, 'subspaces'))]
  $('#brand').textContent = me.forum.name || 'Forum'
  $('#boards').innerHTML = boards.map((b) => `<a href="#/b/${esc(b.key)}" class="${route[1] === b.key ? 'here' : ''}">${esc(b.name)}</a>`).join('')
  $('#links').hidden = false
  const peers = await call(me.forum.key, 'peers')
  $('#online').textContent = `${new Set(peers.map((p) => p.identity)).size} other(s) online`
}

const PAGE = 20
const sorts = { board: 'new', thread: 'old' } // kept while the page is open
const folded = new Set() // ids of collapsed comments, kept across redraws

// A sort menu that redraws the screen on change.
function sortMenu (which, options) {
  return `<label class="muted">Sort <select data-sort="${which}">${Object.entries(options).map(([v, label]) =>
    `<option value="${v}" ${sorts[which] === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`
}
document.addEventListener('change', (e) => {
  const which = e.target.dataset?.sort
  if (which) { sorts[which] = e.target.value; refresh().catch(showError) }
})

// A search box: in `board`, or every board when "all boards" is picked. Call wireSearch once it is on the page.
const wireSearch = (board) => onSubmit($('#search'), ({ q, where }) => { location.hash = `#/s/${where === 'all' ? 'all' : board}/${encodeURIComponent(q)}` })
function searchForm (words = '', everywhere = false) {
  return `<form id="search" class="row"><input name="q" required placeholder="Search threads" aria-label="Search threads" value="${esc(words)}">
    <select name="where" aria-label="Where"><option value="board">this board</option><option value="all" ${everywhere ? 'selected' : ''}>all boards</option></select>
    <button type="submit">Search</button></form>`
}

async function searchScreen (scope, words) {
  const all = scope === 'all'
  $('#main').innerHTML = `${searchForm(words, all)}<div id="results"></div>`
  wireSearch(all ? me.forum.key : scope)
  const render = async () => {
    const boards = [{ key: me.forum.key, name: 'General' }, ...(await call(me.forum.key, 'subspaces'))]
    const nameOfBoard = new Map(boards.map((b) => [b.key, b.name]))
    const found = await search(call, all ? boards.map((b) => b.key) : [scope], words)
    const rows = await Promise.all(found.map(async (p) => `<div class="card"><a class="thread-title" href="#/t/${esc(p.space)}/${esc(p.id)}">${esc(p.title)}</a>
      <div class="muted">${esc(nameOfBoard.get(p.space) || '')} · ${await person(p.author)} · ${when(p.stamp)}</div></div>`))
    return `<h1>${found.length} result(s) for “${esc(words)}”</h1>` + rows.join('')
  }
  return { space: all ? null : scope, types: ['post', 'profile'], render, into: '#results' }
}

async function boardScreen (board) {
  $('#main').innerHTML = `
    ${searchForm()}
    <p>${sortMenu('board', { new: 'Newest', votes: 'Votes', comments: 'Comments' })}</p>
    <div id="list"></div><p><button id="more" hidden>More</button></p>
    <form id="post" class="card"><strong>New thread</strong>
      <input name="title" maxlength="300" placeholder="Title" required>
      <textarea name="text" placeholder="Text (**bold**, *italic*, [link](https://…), - lists)"></textarea>
      <button type="submit">Post</button></form>`
  wireSearch(board)
  let shown = PAGE
  const render = async () => {
    const { items, more, complete } = await threads(call, board, { sort: sorts.board, limit: shown })
    const rows = await Promise.all(items.map(async (p) => `<div class="card"><a class="thread-title" href="#/t/${esc(board)}/${esc(p.id)}">${esc(p.title)}</a>
        <div class="muted">${p.score} points · ${p.comments} comments · ${await person(p.author)} · ${when(p.stamp)}</div></div>`))
    $('#more').hidden = !more
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
  const mod = MODS.includes(await call(me.forum.key, 'getRole', me.identity))
  $('#main').innerHTML = `<p>${sortMenu('thread', { old: 'Oldest comments first', votes: 'Most votes first' })}</p><div id="thread"></div>
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
    const fold = (open) => `<button class="link" data-act="fold" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} this comment and its replies">[${open ? '−' : '+'}]</button>`
    if (folded.has(r.id)) return `<div class="comment" data-id="${esc(r.id)}"><div class="muted">${fold(false)} ${await person(r.author)} · ${when(r.stamp)}</div></div>`
    const [who, under] = await Promise.all([person(r.author), replies(call, board, r.id, sorts.thread)])
    const mine = r.author === me.identity
    const body = (r.type === 'post' ? `<h1>${esc(r.title)}</h1>${markdown(r.text)}` : markdown(r.text)) +
      (r.hidden ? '<p class="muted">Hidden by moderators.</p>' : '') + (r.flagged ? '<p class="muted">Flagged for moderators.</p>' : '')
    return `<div class="${r.type === 'post' ? 'card' : 'comment'}" data-id="${esc(r.id)}" data-type="${r.type}">
      ${body}
      <div class="muted votes">
        ${r.type === 'comment' ? fold(true) : ''}
        <button data-act="up" aria-label="Vote up">▲</button> ${r.score} <button data-act="down" aria-label="Vote down">▼</button>
        · ${who} · ${when(r.stamp)}${r.edited ? ' · edited' : ''}
        <button class="link" data-act="reply">reply</button>
        ${mine ? '<button class="link" data-act="edit">edit</button><button class="link" data-act="del">delete</button>' : ''}
        ${mod ? `<button class="link" data-act="${r.hidden ? 'reveal' : 'hide'}">${r.hidden ? 'reveal' : 'hide'}</button><button class="link" data-act="takedown">take down</button>` : ''}
      </div>
      ${(await Promise.all(under.map(item))).join('')}</div>`
  }
  const render = async () => {
    const { record, deleted } = await call(board, 'get', id)
    if (!record) return `<p class="muted">${deleted ? 'This thread was deleted.' : 'This thread isn\'t here yet: still syncing…'}</p>`
    return item({ ...record, score: (await call(board, 'sum', 'vote', 'value', { on: id })).value })
  }
  $('#thread').onclick = async (e) => {
    const act = e.target.dataset.act
    const el = e.target.closest('[data-id]')
    if (!act || !el) return
    const rid = el.dataset.id
    try {
      if (act === 'fold' && !folded.delete(rid)) folded.add(rid)
      if (act === 'up' || act === 'down') await call(board, 'put', 'vote', { on: rid, value: act === 'up' ? 1 : -1 })
      if (act === 'reply') { replyTo = rid; $('#reply-to').textContent = 'Reply'; $('#reply-reset').hidden = false; $('#reply textarea').focus() }
      if (act === 'del' && confirm('Delete this for everyone?')) await call(board, 'del', rid)
      if (act === 'edit') await edit(board, rid, el.dataset.type)
      if (act === 'hide') await moderate(board, 'hide', rid, prompt('Why hide it? (shown in the log)'))
      if (act === 'reveal') await moderate(board, 'reveal', rid, '')
      if (act === 'takedown' && confirm('Take this down for good, for everyone?')) await moderate(board, 'remove', rid, prompt('Why? (shown in the log)'))
      refresh()
    } catch (err) { showError(err) }
  }
  return { space: board, types: ['post', 'comment', 'vote', 'profile'], render, into: '#thread' }
}

const MODS = ['owner', 'admin', 'moderator']

// A cancelled prompt (null reason) does nothing.
async function moderate (space, action, target, reason) {
  if (reason === null) return
  await call(space, 'moderateAction', action, target, { reason })
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

// A member's page: their about-me, then what they wrote. Your own page edits it.
async function userScreen (identity) {
  const mine = identity === me.identity
  const p = await profileOf(call, me.forum.key, identity)
  const field = (name, label, max) => `<label>${label} <input name="${name}" maxlength="${max}" value="${esc(p[name])}"></label>`
  $('#main').innerHTML = `<div id="about"></div>
    ${mine ? `<details class="card"><summary>Edit my page</summary><form id="profile">
      <label>Your name <input name="name" maxlength="40" required value="${esc(p.name)}"></label>
      ${field('quote', 'A short quote', 300)}${field('contact', 'Contact', 300)}
      <label>Websites (one per line) <textarea name="websites" maxlength="2000">${esc(p.websites)}</textarea></label>
      <button type="submit">Save</button></form></details>` : ''}
    <h2>Threads and comments</h2><div id="activity"></div>`
  if (mine) {
    onSubmit($('#profile'), async (fields) => {
      await call(me.forum.key, 'put', 'profile', fields) // every field: the latest profile record is the whole page
      names.delete(me.identity)
      show()
    })
  }
  // Only http(s) lines become links.
  const site = (line) => /^https?:\/\//i.test(line) ? `<a href="${esc(line)}" rel="noopener noreferrer" target="_blank">${esc(line)}</a>` : esc(line)
  $('#about').innerHTML = `<h1>${esc(p.name || identity.slice(0, 8))}</h1>
    ${p.quote ? `<blockquote>${esc(p.quote)}</blockquote>` : ''}
    ${p.contact ? `<p>Contact: ${esc(p.contact)}</p>` : ''}
    ${(p.websites || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `<div>${site(l)}</div>`).join('')}`
  const render = async () => {
    const boards = [{ key: me.forum.key, name: 'General' }, ...(await call(me.forum.key, 'subspaces'))]
    const nameOfBoard = new Map(boards.map((b) => [b.key, b.name]))
    const rows = (await activity(call, boards.map((b) => b.key), identity)).map((r) => {
      const where = `${esc(nameOfBoard.get(r.space))} · ${when(r.stamp)}`
      if (r.type === 'post') return `<div class="card"><a class="thread-title" href="#/t/${esc(r.space)}/${esc(r.id)}">${esc(r.title)}</a><div class="muted">${where}</div></div>`
      const text = esc(r.text.length > 200 ? r.text.slice(0, 200) + '…' : r.text)
      return `<div class="card">${r.thread ? `<a href="#/t/${esc(r.space)}/${esc(r.thread)}">${text}</a>` : text}<div class="muted">comment · ${where}</div></div>`
    })
    return rows.join('') || '<p class="muted">Nothing yet.</p>'
  }
  return { space: null, types: ['post', 'comment'], render, into: '#activity' }
}

async function peopleScreen () {
  const role = await call(me.forum.key, 'getRole', me.identity)
  const decides = role === 'owner' || role === 'admin'
  const render = async () => {
    const [members, peers] = await Promise.all([call(me.forum.key, 'members'), call(me.forum.key, 'peers')])
    const online = new Set(peers.map((p) => p.identity))
    const rows = await Promise.all(members.map(async (m) => {
      const them = !m.you && m.role !== 'owner'
      const actions = [
        decides && them && m.role ? `<select data-act="role" aria-label="Role">${['admin', 'moderator', 'friend', 'member'].map((r) => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select>` : '',
        MODS.includes(role) && them ? `<button class="link" data-act="${m.banned ? 'unban' : 'ban'}">${m.banned ? 'unban' : 'ban'}</button>` : '',
        decides && them && m.role ? '<button class="link" data-act="remove">remove</button>' : ''
      ].join(' ')
      const state = m.banned ? 'banned' : m.removed ? 'removed' : m.role
      return `<div class="card" data-who="${esc(m.identity)}"><strong>${await person(m.identity)}</strong>
        <span class="muted">${esc(state)}${online.has(m.identity) ? ' · online' : ''}${m.you ? ' · you' : ''}</span> ${actions}</div>`
    }))
    return rows.join('')
  }
  $('#main').innerHTML = '<h1>People</h1><div id="people"></div>'
  const act = async (e) => {
    const el = e.target.closest('[data-who]')
    const what = e.target.dataset.act
    if (!el || !what || (e.type === 'click' && what === 'role')) return
    const who = el.dataset.who
    try {
      if (what === 'role') await call(me.forum.key, 'setRole', who, e.target.value)
      if (what === 'ban') await moderate(me.forum.key, 'ban', who, prompt('Why ban them? (shown in the log)'))
      if (what === 'unban') await moderate(me.forum.key, 'unban', who, '')
      if (what === 'remove' && confirm('Take them out of the forum? What they wrote stays.')) await call(me.forum.key, 'removeRole', who)
      refresh()
    } catch (err) { showError(err) }
  }
  $('#people').onclick = act
  $('#people').onchange = act
  return { space: me.forum.key, types: ['profile'], on: ['members', 'peers'], render, into: '#people' }
}

// What a decision did, in words.
async function describe (d) {
  const who = async (id) => esc(await nameOf(id))
  if (d.type === 'moderate') return `${d.action} ${d.action === 'ban' || d.action === 'unban' ? await who(d.target) : 'a post'}${d.reason ? `: "${esc(d.reason)}"` : ''}`
  if (d.type === 'role/set') return `made ${await who(d.identity)} ${esc(d.role)}`
  if (d.type === 'role/remove') return `took ${await who(d.identity)} out`
  if (d.type === 'invite/redeem') return `let ${await who(d.identity)} in as ${esc(d.role)}`
  if (d.type === 'subspace/create') return `added the board "${esc(d.name)}"`
  if (d.type === 'space/init') return `created the forum "${esc(d.name)}"`
  if (d.type === 'role/define') return `defined the role ${esc(d.name)} (${esc(d.permissions.join(', '))})`
  if (d.type === 'settings/set') return d.helpers ? 'changed the helpers' : d.policy ? `asked everyone to keep ${esc(d.policy)}` : 'recorded the app\'s rules'
  return esc(d.type)
}

// The forum's and every board's decisions, newest first.
async function logScreen () {
  const mod = MODS.includes(await call(me.forum.key, 'getRole', me.identity))
  const render = async () => {
    const spaces = [me.forum.key, ...(await call(me.forum.key, 'subspaces')).map((b) => b.key)]
    const lists = await Promise.all(spaces.map(async (space) => (await call(space, 'decisions', { limit: 50 })).items.map((d) => ({ ...d, space }))))
    const all = lists.flat().sort((x, y) => y.at - x.at).slice(0, 100)
    const rows = await Promise.all(all.map(async (d) => {
      const reveal = mod && d.type === 'moderate' && d.action === 'hide' ? `<button class="link" data-space="${esc(d.space)}" data-target="${esc(d.target)}">reveal</button>` : ''
      return `<div class="card">${esc(await nameOf(d.by))} ${await describe(d)} <span class="muted">· ${when(d.at)}${d.counted ? '' : ' · did not count'}</span> ${reveal}</div>`
    }))
    return rows.join('') || '<p class="muted">Nothing decided yet.</p>'
  }
  $('#main').innerHTML = '<h1>Moderation log</h1><div id="log"></div>'
  $('#log').onclick = (e) => {
    const { space, target } = e.target.dataset
    if (space) moderate(space, 'reveal', target, '').then(refresh, showError)
  }
  return { space: null, types: ['profile'], on: ['decisions'], render, into: '#log' }
}

async function settingsScreen () {
  const role = await call(me.forum.key, 'getRole', me.identity)
  const decides = role === 'owner' || role === 'admin'
  $('#main').innerHTML = `
    <h1>Settings</h1>
    <div class="card"><strong>Invite a friend</strong>
      <p class="muted">A code works once, for 7 days. Send it any way you like.</p>
      <p><button id="invite">Make a code</button></p><p class="words" id="code"></p></div>
    ${decides ? `<form id="board" class="card"><strong>New board</strong><input name="name" required><button type="submit">Add</button></form>` : ''}
    <form id="helpers" class="card"><strong>Helpers</strong>
      <p class="muted">Always-on computers that keep the forum available while everyone is offline. Never needed: the forum works without them.</p>
      <label>One key per line <textarea name="keys" ${role === 'owner' ? '' : 'readonly'}>${esc((await call(me.forum.key, 'helpers')).join('\n'))}</textarea></label>
      ${role === 'owner' ? '<div><button type="submit">Save</button></div>' : ''}</form>
    <form id="devices" class="card"><strong>Your computers</strong>
      <div id="device-list"></div>
      <label>Your password on this computer <input name="password" type="password" required autocomplete="current-password"></label>
      <div><button type="submit">Add a computer</button></div>
      <p class="muted">On the new computer, install the forum and paste this code (it works for 10 minutes):</p>
      <p class="words" id="device-code"></p></form>`
  if (role === 'owner') {
    onSubmit($('#helpers'), ({ keys }) => call(me.forum.key, 'setHelpers', keys.split(/\s+/).filter(Boolean)))
  }
  onSubmit($('#devices'), async ({ password }) => {
    const { code } = await call('account', 'addDevice', { password })
    $('#device-code').textContent = code
  })
  // A lost computer: what it wrote stays, nothing after counts.
  $('#device-list').onclick = async (e) => {
    const key = e.target.dataset.remove
    if (!key || !confirm('Remove this computer from your account?')) return
    const password = $('#devices').password.value
    if (!password) return showError(new Error('Type your password first'))
    try {
      await call('account', 'removeDevice', key, { password })
      refresh()
    } catch (err) { showError(err) }
  }
  $('#invite').onclick = async () => {
    try {
      const code = await call(me.forum.key, 'createInvite', { role: 'friend', expires: Date.now() + 7 * 864e5 })
      $('#code').textContent = code
    } catch (err) { showError(err) }
  }
  if (decides) {
    onSubmit($('#board'), async ({ name }) => {
      const b = await call(me.forum.key, 'createSubspace', { name })
      location.hash = `#/b/${b.key}`
    })
  }
  const render = async () => (await call('account', 'devices')).map((d) =>
    `<div>${esc(d.name || 'a computer')}${d.current ? ' <span class="muted">(this one)</span>' : ` <button type="button" class="link" data-remove="${esc(d.publicKey)}">remove</button>`}</div>`).join('')
  return { space: null, types: [], on: ['devices'], render, into: '#device-list' }
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
  else if (route[0] === 's' && route[1] && route[2]) screen = await searchScreen(route[1], decodeURIComponent(route[2]))
  else if (route[0] === 'u' && route[1]) screen = await userScreen(route[1] === 'me' ? me.identity : route[1])
  else if (route[0] === 'settings') screen = await settingsScreen()
  else if (route[0] === 'people') screen = await peopleScreen()
  else if (route[0] === 'log') screen = await logScreen()
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
  if (screen && (space === screen.space || !screen.space) && records.some((r) => screen.types.includes(r.type))) soon(refresh)
})
for (const name of ['members', 'decisions', 'peers', 'devices']) live.addEventListener(name, () => { if (screen?.on?.includes(name)) soon(refresh) })
for (const name of ['spaces', 'peers']) live.addEventListener(name, () => { if (me?.forum) soon(navBar) })
// A computer just paired gets the forum a moment after setup.
live.addEventListener('spaces', () => { if (me?.setUp && !me.forum) soon(start) })

window.addEventListener('hashchange', () => { if (me?.forum) show().catch(showError) })
start().catch(showError)
