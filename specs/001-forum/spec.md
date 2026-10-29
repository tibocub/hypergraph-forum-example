# Feature Specification: The forum (v1)

**Feature**: `001-forum` · **Created**: 2026-10-29 · **Status**: Draft, for the lead's review
**Input**: hypergraph `ROADMAP.md`, Decisions "2026-10-29 (forum web app, grilled with Tibo)". Every
decision there is binding; this spec only turns it into stories and checks.

## In one paragraph

One invite-only, reddit-style forum for Tibo and 5–20 friends. No server: each member runs a small
Node program on their own desktop and uses the forum in a browser tab on `127.0.0.1`. Boards,
threads, comments, votes, edit, delete, moderation, one-time invite codes, a second device, text
with basic Markdown. Every member keeps everything. It works with no helper. Done = Tibo + 4 friends
use it for 2 weeks and nothing is lost.

## User Scenarios & Testing

### User Story 1 — Start the forum and let a friend in (P1)

Tibo installs, opens the tab, chooses a password, writes down his recovery phrase and creates the
forum. He makes an invite code and sends it in any chat. A friend installs, chooses a password,
pastes the code, and is in.

**Independent test**: two peers on a local DHT, through the API only: A sets up and creates the
forum, makes a code; B sets up and joins with it; both list the same forum and the same members.

1. **Given** a fresh install, **when** the tab opens, **then** it asks: new account, or "I have a
   device code" (story 4). Nothing else works before that.
2. **Given** a new account, **then** the recovery phrase is shown once and the person chooses to keep
   it here behind their password, or forget it here (written down).
3. **Given** no forum yet, **when** the owner creates it, **then** it exists, set to "every member
   keeps everything". **Given** a forum already, creating another is refused (one forum).
4. **Given** an invite code, **when** a friend uses it while the owner (or an admin) is online,
   **then** they are a member; a second use of the same code is refused (`INVITE_USED_UP`).
5. **Given** nobody who can let people in is online, **then** joining says so in plain words ("ask
   Tibo to open the forum, then try again"), not an error dump.

### User Story 2 — Boards, threads, comments, votes (P1) 🎯

Members post threads in boards, comment, reply to comments, vote up or down, edit and delete their
own posts. Everything shows up live in everyone's open tab.

**Independent test**: three peers; the owner makes a board; B posts in it, C comments and replies,
everyone votes; A's API and live channel see each step; edits and deletes reach everyone.

1. The forum itself is the first board ("General"); the owner and admins add more boards.
2. A thread has a title and a text; a comment has a text; texts use basic Markdown (bold, italic,
   code, links, lists, quotes). No images.
3. A vote is +1 or −1; voting again replaces your vote; a thread shows its score.
4. Only the author edits or deletes their own thread or comment; a deleted one shows as "deleted".
5. A board lists its threads newest first, with paging; a thread shows its comments as a tree,
   oldest first.
6. **Given** a tab open on a board or a thread, **when** anyone posts, comments, votes, edits or
   deletes there, **then** the tab updates by itself within 2 s once the record reached this peer.
7. Every author is shown by their name (each member sets one), not by a key.

### User Story 3 — Moderation (P2)

The owner gives roles (admin, moderator); moderators hide, reveal and take down posts, ban and unban
people; everyone can read the moderation log.

**Independent test**: three peers; A makes B a moderator; B hides C's comment (gone from every list,
"hidden by moderators" on the thread); B reveals it; A bans C (C's later posts count for nobody);
the log lists each decision with who and why.

1. Roles: owner, admin, moderator, member (hypergraph's built-ins).
2. Hide / reveal, take down (gone for good), flag, ban (optionally "from this post on"), unban,
   remove a member.
3. A refused action shows hypergraph's reason (e.g. "their role is at or above yours").

### User Story 4 — A second computer (P2)

A member adds their laptop: on the first computer they ask for a device code (needs their
password), on the new one they install and paste it. Same person, same forum, same name.

**Independent test**: A's device 1 asks for a code; device 2 sets up with it; both show the same
identity and forum; a post from device 2 is A's; removing device 2 works with the password.

### User Story 5 — Nothing lost: the delivery log (P2)

Each member's program writes down, for every thread, comment and vote: when it was posted (its
author's time) and when this computer first saw it. At the end of the trial, the logs merged show
whether every post reached everyone, and how fast.

**Independent test**: B posts; A's log has the post with both times; merging A's and B's logs reports
0 missing; dropping a line from A's log makes the report name that post as missing for A.

### User Story 6 — Install in one copy-paste (P3)

A friend with Node and git pastes one line (PowerShell on Windows, a shell on macOS/Linux); it
downloads the forum, installs it and opens the tab. Running it again updates it, keeping the data.

**Independent test**: by hand on a clean Windows user account (steps in `plan.md`, "Manual checks"); not
automated.

### Edge cases

- **Owner offline when a friend joins**: refused with `INVITE_INVALID` → "try again when Tibo is
  online". Advice in the README: make one friend admin, so either can let people in.
- **Laptop asleep or the program closed**: posts wait on the author's computer; they arrive when both
  are online again. The tab says how many people are online.
- **Restart**: everything is still there; the delivery log doesn't count old posts again.
- **Two devices of one person edit the same post offline**: the later edit wins (hypergraph).
- **Banned or removed member**: their earlier posts stay; anything after counts for nobody.
- **Hidden vs deleted**: hidden posts are left out of lists, shown as "hidden by moderators" in the
  thread; deleted ones as "deleted".
- **Clocks**: "posted at" is the author's stamp; a computer with a wrong clock skews the delays in the
  report, not the "missing" count.
- **Second start while running**: refused ("the forum is already running"), with the link to open.
- **Another program or a web page on the same computer** calling the API: refused without the token.

## Requirements

### Functional

- **FR-001** One forum per install: create it only if this account has none; else join by code.
- **FR-002** Boards = the forum plus its sub-forums (hypergraph sub-spaces), made by owner/admins.
  Every board is set to keep everything.
- **FR-003** Threads, comments, replies, votes, edit, delete, as in hypergraph's
  `test/next/forum/` (post, comment, vote types).
- **FR-004** Moderation and roles as in hypergraph's moderation API; a readable moderation log.
- **FR-005** Invite codes: one use, made by any member (role `friend`), expire after 7 days.
- **FR-006** Device pairing with a code; device list; remove a lost device (password).
- **FR-007** A display name per member, the same on all their devices.
- **FR-008** Basic Markdown, rendered safely: other members' text never runs as HTML.
- **FR-009** A local server on 127.0.0.1 only, with a random token kept in the data folder; every
  API call needs it and the right `Host`.
- **FR-010** A JSON API whose calls mirror hypergraph's (`method` + `args` on the account or a
  space), plus one live channel forwarding hypergraph's events.
- **FR-011** A delivery log per device and a script merging several devices' logs into a report.
- **FR-012** Works with no helper: nothing at start or while running waits for one. When hypergraph
  spec 013 lands, the owner can list helpers in the forum's settings (a seam, not built now).
- **FR-013** README and a copy-paste install script (Windows and macOS/Linux) that also updates.
- **FR-014** Data kept outside the install folder (survives reinstall and update).

### Key entities

- **Forum**: a hypergraph space; its **boards**: the space and its sub-spaces.
- **Thread** (`post`: title, text), **comment** (text, on a thread or a comment), **vote** (+1/−1, one
  per member), **profile** (a member's name).
- **Delivery line**: record id, type, board, author, posted at, first seen here.

## Success criteria

- **SC-001** Tibo + 4 friends use it for 2 weeks; the merged delivery report shows **0 posts
  missing** for anyone, and no one lost anything they wrote.
- **SC-002** On a local DHT (tests), a post reaches another online member's live channel within 2 s.
- **SC-003** A friend goes from the copy-paste line to reading the forum in under 10 minutes,
  without help.
- **SC-004** Every flow of stories 1–5 has an API test with two or more peers, all passing.
- **SC-005** No helper exists during the trial and everything still works.

## Assumptions

- Friends have a desktop (Windows, macOS or Linux), Node 20+ and git, and keep the program's window
  open while they want to be online (no background service in v1).
- The repos are reachable for the install script (GitHub, `tibocub/…`); hypergraph is pinned to a
  commit there.
- Sorting is newest first; no "hot" ranking, no front page across boards, no search, no
  notifications, no images (later).

## Answers (Tibo, 2026-10-30)

1. **Who may invite**: any member. The forum defines a `friend` role (`post`, `invite`) and lets people
   in as `friend`. hypergraph's rules make this partial today (request F6): a friend's invite can only
   give `member`, which can't invite.
2. **Online only while the program runs**: OK for the trial; no background service.
3. **Delivery logs**: friends send their `delivery.jsonl` to Tibo at the end. A post is lost for good
   only if its author never comes back, so the report is mainly for catching replication bugs (two
   members online together and a post still not arriving) and measuring delays.
4. **Names**: a `profile` record, as planned.
