# Requests to hypergraph

What the forum needs from `hypergraph/next` (or finds awkward), with why. The forum doesn't work
around these and doesn't edit hypergraph; the lead conversation decides. Numbered F1, F2… (SwarmFS
uses H1…).

## Found while planning spec 001 (2026-10-29)

- **F1 — A name for a person.** Every social app shows authors by name; the core has a device name
  but no person name, so `members()` and records give keys only. The forum uses a `profile` record
  (`{ name }`, the author's latest via `query('profile').by(author).latest(1)`, one read per author).
  That works with today's API, so it doesn't block. Question for the lead: should hypergraph carry a
  person's name (in `members()`, synced across their devices), since HyperBrowser and every app will
  need the same thing?
- **F2 — A public test helper for apps** (+1 to SwarmFS's H7). The forum copies `tmpDir`,
  `testBootstrap`, `within`, `eventually` from `test/next/helpers.js` — the third copy. A
  `hypergraph/testing` export (local DHT + tmp dirs) would keep them in step. Not blocking.

## To confirm (the forum's first tests will check; a reply saves a surprise)

- **F3 — `latest(n, { after })` with a record that went through JSON.** The browser sends back the
  last record of a page as plain JSON (`id` a string, `stamp` a number). The query reads
  `after.stamp` and `idOf(after)`; is a plain object officially fine (docs say "a record from the last
  page")? Checked by `test/posting.test.js`.
  **Answered (lead, 2026-10-30)**: yes, only `after.stamp` and `after.id` are read.
- **F5 — Policy of sub-spaces.** The forum wants "every member keeps everything" for the forum and all
  its boards (sub-spaces). Does a sub-space follow its parent's `'everything'`, or does each need its
  own `setPolicy('everything')` (the plan calls it on each new board)? And does `setPolicy` on a
  sub-space work like on a top space (its decisions live in the parent's log)?
  **Answered (lead, 2026-10-30)**: no inheritance today (own policy or 'auto'); keep the per-board
  `setPolicy('everything')`. A core fix to inherit it is proposed.

## For hypergraph spec 013 (helpers), from the forum

- **F4 — What the forum needs from helpers.** (a) Nothing at open or while running waits for a
  helper, also when one listed is down (the forum must work with the VPS off). (b) A read of the
  space's listed helpers and an event when the list changes, so the owner's settings screen can show
  and edit them like any other read (spec 012's rule). (c) Per helper, whether this device reaches it
  now, so Tibo can see the VPS is down. (d) A helper listed on the forum also serves its boards
  (sub-spaces), with no extra step per board.
  **Answered (lead, 2026-10-30)**: 013 merged (bab86c3): `space.setHelpers([key])` (owner, top space),
  `space.helpers`, changes fire `decisions`; sub-spaces use their top space's helpers; nothing waits.
  (c) not built: left out of v1.

## Found while building spec 001 (2026-10-30)

- **F6 — "Any member may invite" can't be set up.** Tibo wants every member of the forum to invite.
  The built-in `member` role can't gain `invite` (`defineRole` refuses built-in names), and a custom
  role with `invite` may only invite to roles below it, or `member`/`guest` (`mayInvite`,
  `lib/decisions/state.js:69`). So with `friend = ['post', 'invite']`: the owner's and admins' codes
  give `friend`, but a friend's code can only give `member`, who can't invite. Wanted, one of: a
  space setting "members may invite", a way to give the built-in `member` role more permissions per
  space, or a custom role allowed to invite to itself. The forum meanwhile invites as `friend` when it
  may, else as `member` (so a friend's friend can't invite yet).

- **F7 — `space.subspaces()` lists a sub-space before `hg.space(key)` opens it.** On a member's
  computer, right after the owner adds a board, `forum.subspaces()` already lists it while
  `hg.space(board.key)` still throws `NOT_FOUND` ("No space … here") for a moment. Seen in about 1 run
  in 4 of the full suite (b writes in the board as soon as `subspaces()` lists it). The docs say
  "open one with hg.space(key) (members of the forum have it)". A page showing `subspaces()` as links
  breaks on a quick click. `hg.spaces()` doesn't have the gap (it reads the same map as
  `hg.space()`), so the forum lists boards from `hg.spaces()` filtered by `parent`. Wanted:
  `subspaces()` lists only what `hg.space()` opens (or `hg.space()` opens anything listed).
