# Implementation Plan: The forum (v1)

**Spec**: [spec.md](spec.md) · **Date**: 2026-10-29

## Summary

A small Node server per member that opens one hypergraph account and passes the browser's calls
straight to `hypergraph/next`, plus a plain HTML/JS page that is the whole forum. The server holds
no forum logic of its own: it is a **bridge** (calls in, events out), a **token lock**, and a
**delivery log**. That bridge is the piece HyperBrowser reuses.

## Technical context

- Node 20+ (desktop only), ESM. hypergraph is CommonJS: `import hypergraph from 'hypergraph/next'`.
- Dependencies: `hypergraph` (`file:../hypergraph`), nothing else at runtime. Node's `http`,
  `crypto`, `fs` are enough. Dev: `brittle`, `hyperdht` 6.32.0 (pinned, like hypergraph).
- Browser: one `index.html`, one `app.js` (ES module), one `markdown.js`, one `style.css`. No build,
  no framework, no CDN.
- Tests: `brittle-node test/*.test.js`, real peers on a local DHT.

## Constitution check

- I Nothing lost: every member keeps everything (`policy: 'everything'` on the forum and each board);
  delivery log + report (story 5); a restart test.
- II Test-first through the API: every story starts with its API test (tasks.md).
- III Compose hypergraph: the server only forwards calls; requests filed, no workaround.
- IV Small and plain: no runtime dependency, no build.
- V Local and locked: 127.0.0.1, token, Host check, Markdown escaped first.

## Layout

```
bin/forum.js            start: open the server, print the link, open the browser
lib/server.js           startForum({ dir, port, bootstrap }): http, token, static files, setup
lib/bridge.js           POST /api/call: the allow-list of hypergraph calls
lib/live.js             GET /api/events: hypergraph's events as Server-Sent Events
lib/delivery.js         the delivery log (delivery.jsonl)
lib/types.js            the forum's record types and rules (shared by every member)
public/index.html       the page
public/app.js           the whole forum UI (screens, calls, live updates)
public/markdown.js      basic Markdown → safe HTML (escape first), also imported by tests
public/style.css
scripts/delivery-report.js   merges several delivery.jsonl files
install.ps1, install.sh      copy-paste install and update
test/helpers.js         tmp dirs, local DHT, a forum peer (server + API client + live channel)
test/*.test.js
```

## Data on disk

`FORUM_DIR`, default `~/.hypergraph-forum/`:
- `hypergraph/` — hypergraph's own folder (keys, logs).
- `token` — the API token (random 32 bytes, hex; file mode 0600 where the OS has it). Kept, so a
  bookmark keeps working after a restart.
- `delivery.jsonl` — the delivery log.

Outside the install folder: reinstalling or updating never touches it.

## Types (`lib/types.js`)

Taken from hypergraph's `test/next/forum/forum.js`, minus what v1 doesn't use:

```js
post:    { fields: { title: 'string', text: 'text' } }
comment: { fields: { text: 'text', on: 'link' }, links: { on: ['post', 'comment'] } }
vote:    { fields: { value: 'int', on: 'link' }, links: { on: ['post', 'comment'] }, onePerMember: true }
profile: { fields: { name: 'string' } }       // a member's name: their latest profile record
rules:   title ≤ 300 chars (id 'title-length'), vote value is 1 or -1 (id 'vote-value'),
         name ≤ 40 chars (id 'name-length')
```

Between versions only add fields at the end and add types (hypergraph's rule): friends never all
update at once.

## The server

### Start and setup

`startForum({ dir, port = 4790, bootstrap })`:
- If `dir/hypergraph` holds an account, open it (`Hypergraph.open(dir, { types, rules })`) and
  `connectToSwarm()`. Otherwise wait for `POST /api/setup`:
  - `{ password }` → a new account, opened with `{ password }` (the phrase is never in the folder in
    plain text);
  - `{ password, joinCode }` → this computer joins the account (story 4), opened with `{ joinCode,
    password, deviceName }`.
- Nothing at start waits for a helper or for another member (FR-012).
- A second start on the same folder fails on hypergraph's lock → "already running" + the link.

### Lock (FR-009)

- Listens on `127.0.0.1` only.
- Every request needs the token: an `HttpOnly; SameSite=Strict` cookie, set by `GET /login?token=…`
  (the link the program opens), or `Authorization: Bearer <token>` (tests, scripts). Else 401.
- `Host` must be `127.0.0.1:<port>` or `localhost:<port>` (stops DNS rebinding). Else 403.
- `POST` bodies must be `application/json` (a web page can't send that cross-site without asking).
  Else 415.
- Static files: a fixed list from `public/`, nothing else.

### The bridge: `POST /api/call` (FR-010)

One endpoint, mirroring hypergraph's calls:

```
POST /api/call  { "on": "account" | <space key>, "method": "put", "args": ["post", { "title": "Hi", "text": "…" }] }
→ 200 { "result": … }       (hypergraph's answer, as JSON)
→ 400 { "code": "NOT_ALLOWED", "message": "…" }   (a HypergraphError; unknown method: "UNKNOWN_CALL")
```

Allowed calls (everything else is `UNKNOWN_CALL`):
- account: `state` (bridge's own: `{ identity, device, forum, setUp }`), `spaces`, `createSpace`
  and `redeemInvite` (both refused with `ONE_FORUM` if this account already has a forum), `devices`, `addDevice` (returns
  `{ code }`; `devices` fires when it's used), `removeDevice`, `settings`, `setSetting`,
  `recoveryPhrase`, `protectRecoveryPhrase`, `forgetRecoveryPhrase`.
- space: `get`, `put`, `edit`, `del`, `query`, `linked`, `count`, `sum`, `members`, `getRole`,
  `setRole`, `removeRole`, `roles`, `moderateAction`, `decisions`, `createInvite`, `revokeInvite`,
  `createSubspace`, `subspaces`, `setPolicy`, `status`, `peers`.
- `query` takes one object, turned into hypergraph's chain:
  `{ type, on, by, where, since, until, limit, after }` →
  `space.query(type).on(on).by(by).where(where)….latest(limit, { after })`.

Records go in and out as JSON; an argument that is a record may be the record or its id (as
hypergraph accepts). `after` is the last record of the previous page, sent back as received
(request F3, to confirm).

Why one endpoint and not REST paths: it is the core's API one-to-one, so nothing to design or keep in
step, and HyperBrowser can reuse it for any app's types.

### The live channel: `GET /api/events` (Server-Sent Events)

**SSE, not WebSocket**: updates only go server → browser (calls go through `/api/call`); SSE is
plain HTTP, built into Node (`res.write`) and browsers (`EventSource`, which reconnects by itself),
so no dependency and no framing code. The cookie authenticates it like any request.

The server listens once to hypergraph and sends each event to every open tab:

```
event: change     data: { "space": key, "records": [{ "id", "type", "deleted" }] }
event: members | decisions | status | peers     data: { "space": key }
event: spaces | devices | settings              data: {}
```

on every space in `hg.spaces()` (new ones joined via `spaces`). The page follows hypergraph's rule:
**listen first, then read; on an event, read again** what is on screen. A comment line every 25 s
keeps the connection open.

### Delivery log (FR-011)

`lib/delivery.js` listens to `change` on every space. For each record id it hasn't logged yet, of
type `post`, `comment` or `vote`, it reads the record (`get`) and appends one line:

```json
{ "id": "…", "type": "post", "space": "…", "author": "…", "device": "…", "postedAt": 1761700000000, "seenAt": 1761700000420 }
```

`postedAt` = the record's stamp; `seenAt` = this computer's clock. The first line of the file says
who wrote it: `{ "identity", "device", "name", "startedAt" }`. Ids logged before are read at start,
so a restart logs nothing twice. Records arriving with a stamp before `startedAt` (the history a
newcomer receives) are marked `"backlog": true` and left out of delays.

`node scripts/delivery-report.js a.jsonl b.jsonl …` → per record posted after everyone's
`startedAt`: who saw it, delay (median, worst); and **the list of records some device never saw**.
That list empty = SC-001.

### Helpers seam (FR-012)

hypergraph spec 013 (in progress) lets the owner list helpers in the space's settings; members
connect to them in the background inside hypergraph. The forum's part, once 013 is merged: add
013's calls to the bridge's allow-list and a "Helpers" field on the owner's settings screen. No code
before that; nothing in the forum waits for a helper. Needs from 013: request F4.

## The page (`public/`)

Screens, one at a time, picked by the URL hash (`#/b/<board>`, `#/t/<board>/<thread>`, …):
- **Setup**: new account (password, name, then the recovery phrase once) or "I have a device code".
- **Join**: paste an invite code (shown while this account has no forum; the owner instead sees
  "Create the forum").
- **Board**: threads newest first (title, author, score, comment count), "More" pages, "New thread".
- **Thread**: the post, its comment tree, reply, vote, edit, delete, and moderator buttons.
- **People**: members with roles and who's online; owner/admin: give roles, ban, unban.
- **Moderation log**: `decisions`.
- **Settings**: your name, invite codes (owner/admin), boards (owner/admin), devices (add, remove).

The page calls `/api/call` through one `call(on, method, ...args)` function and re-renders the open
screen on the live events that concern it. Names: `query({ type: 'profile', by: author, limit: 1 })`
per author, kept in a map, refreshed on `change` of type `profile`. Text goes through `markdown.js`:
escape all HTML first, then turn a small set of patterns into tags (`**`, `*`, `` ` ``, fenced code,
`> `, `- `, `1. `, `[text](https://…)` with `http(s)` only). Everything else stays plain text.

Thread trees: `linked(record, 'comment')` per comment, recursively.
`shortcut: one call per comment, fine for a friends' forum; batch if threads reach hundreds of comments.`

## Install (FR-013)

`install.ps1` / `install.sh`, both short:
1. Check `node` ≥ 20 and `git`; else say where to get them and stop.
2. Clone or update `hypergraph` (pinned commit, `HYPERGRAPH_REF` at the top of the script) and this
   repo side by side in `~/hypergraph-forum-app/`, then `npm install` in each.
3. `npm start` (opens the tab). Print how to start it again later.

The data folder is elsewhere (`~/.hypergraph-forum/`), so running the script again updates safely.

## Tests (`test/`)

`test/helpers.js` (copied from hypergraph's `test/next/helpers.js` and SwarmFS's):
`tmpDir`, `testBootstrap` (a 3-node `hyperdht/testnet` per test), `eventually`, `codeOf`, and
`peer(t, label)` → starts `startForum({ dir, port: 0, bootstrap })` and returns
`{ url, token, setup(body), call(on, method, ...args), events() }`, closed after the test.
`events()` reads the SSE stream with `fetch` and keeps every event, with `waitFor(name, match, ms)`.

| File | Covers |
|---|---|
| `setup.test.js` | before setup only `state`/`setup` work; new account; one forum (`ONE_FORUM`); invite, join, code used up; recovery phrase needs the password |
| `posting.test.js` | boards; thread, comment, reply, vote, re-vote, edit, delete across 3 peers; live `change` within 2 s; paging with `after` |
| `moderation.test.js` | roles; hide/reveal (left out of lists, `get` says hidden); take down; ban/unban; refused with a reason; decisions log |
| `devices.test.js` | device code → second server with `joinCode` → same identity and forum; post as the same person; remove device |
| `delivery.test.js` | a post logged with both times; no duplicates after restart; report: 0 missing, then 1 missing |
| `restart.test.js` | close and reopen: same token, posts still there, live channel works again |
| `security.test.js` | no token 401; wrong Host 403; non-JSON POST 415; unknown call `UNKNOWN_CALL`; files outside the list 404 |
| `markdown.test.js` | HTML escaped; `javascript:` links stay text; each supported pattern |
| `ui.test.js` | smoke: `/login` sets the cookie; `/` serves the page; `app.js`, `markdown.js` load |

## Manual checks

1. Story 6 on a clean Windows account: paste the line, see the tab, join with a code.
2. Two real computers on the internet (not the local DHT): join, post, see it live.
3. Close one computer for a night, post on the other, reopen: the post arrives; the report agrees.

## Not in v1

"Hot" ranking, a front page across boards, search, notifications, images, background service,
mobile, helpers (until 013), private boards, open (public-link) forums, tags, wiki.
