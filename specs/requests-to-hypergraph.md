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
  **Fixed (29e8423)**: a sub-space takes the parent's policy; the forum no longer sets it per board.

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
  **Fixed (29e8423)**: a role with `invite` and no `moderate`/`roles`/`decide` invites to its own role;
  every code is `friend` now. Peers on an older hypergraph refuse those invites: everyone updates together.

- **F7 — `space.subspaces()` lists a sub-space before `hg.space(key)` opens it.** On a member's
  computer, right after the owner adds a board, `forum.subspaces()` already lists it while
  `hg.space(board.key)` still throws `NOT_FOUND` ("No space … here") for a moment. Seen in about 1 run
  in 4 of the full suite (b writes in the board as soon as `subspaces()` lists it). The docs say
  "open one with hg.space(key) (members of the forum have it)". A page showing `subspaces()` as links
  breaks on a quick click. `hg.spaces()` doesn't have the gap (it reads the same map as
  `hg.space()`), so the forum lists boards from `hg.spaces()` filtered by `parent`. Wanted:
  `subspaces()` lists only what `hg.space()` opens (or `hg.space()` opens anything listed).
  **Fixed (29e8423)**: listed once it opens (`spaces` fires then); the forum uses `subspaces()` again.

## Found while building Tibo's to-dos (2026-10-30)

- **F8 — Sorting by votes or comments, and a thread's comment count.** A board sorted by votes or by
  comments has to read every thread, then each thread's score (`sum`) and its comments, then sort in
  the page; a thread's comment count (replies included) is one `linked()` per comment, because
  `count('comment', { on })` counts only direct links. Fine for a friends' forum, slow past a few
  hundred threads. Wanted: a query ordered by a sum or count over what links to each record (e.g.
  `query('post').orderBy({ sum: ['vote', 'value'] }).latest(20)`), and a count through a chain of
  links (`count('comment', { under: post })`).

- **F9 — Text search.** Search reads every thread of each board and matches title and text in the
  page. Fine for a friends' forum. Wanted: a word index over a type's text fields
  (`query('post').search('cats great').latest(20)`), so a board of thousands of threads can be searched.

## Found while building the third round of to-dos (2026-10-30)

- **F10 — A list of hidden or flagged records.** `query`, `linked`, `count` and `sum` leave hidden
  records out, and nothing lists them, so the admin panel reads the last 200 decisions of each space and
  `get()`s each hide or flag to see if it still holds. Wanted: `query(type).moderated('hidden' | 'flagged')`
  (or `moderation({ hidden, flagged })`), so moderators see them all however old.
  **Fixed (spec 014, 290a86a)**: `query(type).moderated('hidden' | 'flagged')`; the panel uses it. The list
  doesn't say who hid it or why: the panel points to the log for that.

- **F11 — Ban and delete everything they wrote.** `ban { from }` drops one log from one record on,
  so it can't take a member's whole history: other devices' logs and the boards (sub-spaces) keep
  theirs. The forum bans, then takes down each of their threads, comments and votes in every board, one
  `remove` decision each (a long log, and slow for a busy member). Wanted: `ban(someone, { drop: 'all' })`
  dropping everything they wrote, on every device, in the space and its sub-spaces, in one decision.
  **Fixed (spec 014, 290a86a)**: `ban { drop: 'all' }`; the forum uses it. See F14.

- **F12 — Members report to the moderators.** `moderateAction('flag')` needs moderator rights, so it
  can't be a member's report. The forum adds its own `report` record (`on`, `reason`), which the admin
  panel lists and a moderator dismisses with `remove`. But a record is readable by every member, so
  everyone can see who reported what. Wanted: a member's flag (`flag` for anyone, counted per member),
  or records only moderators can read.
  **Fixed (spec 014, 290a86a)**: `report()` / `reports()`, sealed to the moderators of the moment. The forum's
  own `report` type is unused but stays declared (removing a type breaks opening old data).

- **F13 — Who may write a type.** A forum's `theme` should be written by the owner and admins only. A
  type can say who may *edit* (`editable: { permission }`) but not who may *put*, so any member can put a
  `theme`; the page reads the newest one whose author is owner or admin now, and skips the rest (the
  last 50 only). Wanted: `put: { permission }` (or roles) on a type, refused at write and ignored at read
  like other rules.
  **Fixed (spec 014, 290a86a)**: `put: { permission: 'decide' }`. Adding `put` to `theme` would break old data,
  so the look is a new type `look`; `theme` stays declared, unused.

## Found while adopting spec 014 (2026-10-30)

- **F14 — `ban { drop: 'all' }` resolves before the drop shows on the banning computer.** Right after the
  call, a `query('post').by(them)` there still lists their threads (forum and board) for a moment, while
  their comments and votes are gone already. The docs say every moderation call resolves once your app
  applied it. Seen in `test/admin.test.js` (the test now waits). A moderator who bans and looks at once
  sees the spam still there. Wanted: resolve once everything dropped is out of every list here.