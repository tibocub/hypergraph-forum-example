# Tasks: The forum (v1)

**Input**: [spec.md](spec.md), [plan.md](plan.md). Tests first in every phase: write the test, see it
fail, then the code. `[P]` = can run in parallel (different files). `[USn]` = user story.

## Phase 1: Setup

- [ ] T001 `npm install` (hypergraph junction); check `import hypergraph from 'hypergraph/next'` works from ESM
- [ ] T002 [P] `test/helpers.js`: `tmpDir`, `testBootstrap`, `eventually`, `codeOf` (from hypergraph's `test/next/helpers.js`)
- [ ] T003 [P] `lib/types.js`: post, comment, vote, profile + rules `title-length`, `vote-value`, `name-length`

## Phase 2: Foundation (server, lock, bridge, live channel)

- [ ] T004 `test/security.test.js`: no token 401, wrong Host 403, non-JSON POST 415, unknown call `UNKNOWN_CALL`, unlisted file 404
- [ ] T005 `lib/server.js`: `startForum({ dir, port, bootstrap })`, 127.0.0.1, token file, `/login` cookie, Host/JSON checks, static list, `close()`
- [ ] T006 `test/helpers.js`: `peer(t, label)` with `setup`, `call`, `events()` / `waitFor`
- [ ] T007 `lib/bridge.js`: `POST /api/call`, the allow-list, `query` object → chain, errors → `{ code, message }`
- [ ] T008 `lib/live.js`: `GET /api/events`, forward hypergraph events (spaces joined later included), keep-alive

## Phase 3: US1 — start the forum, let a friend in (P1)

- [ ] T009 [US1] `test/setup.test.js` (plan.md table)
- [ ] T010 [US1] setup in `lib/server.js`: `POST /api/setup` new account / `joinCode`; only `state`/`setup` before it
- [ ] T011 [US1] `ONE_FORUM` guard on `createSpace` and `redeemInvite` in `lib/bridge.js`
- [ ] T012 [US1] `public/index.html`, `public/app.js` shell (`call`, `EventSource`, hash router), `public/style.css`; screens Setup, recovery phrase, Create forum / Join

## Phase 4: US2 — boards, threads, comments, votes (P1) 🎯 MVP

- [ ] T013 [P] [US2] `test/markdown.test.js`
- [ ] T014 [P] [US2] `public/markdown.js`: escape first, then the small pattern set
- [ ] T015 [US2] `test/posting.test.js` (3 peers; live within 2 s; paging)
- [ ] T016 [US2] fix whatever T015 shows in the bridge (no forum logic in the server)
- [ ] T017 [US2] `app.js`: Board and Thread screens, new thread, comment/reply, vote, edit, delete, names (profile), live re-render
- [ ] T018 [US2] `test/ui.test.js` smoke

**Checkpoint**: Tibo and one friend can use it by hand on two computers (plan.md manual check 2).

## Phase 5: US3 — moderation (P2)

- [ ] T019 [US3] `test/moderation.test.js`
- [ ] T020 [US3] `app.js`: moderator buttons on threads/comments, People screen (roles, ban, unban), Moderation log

## Phase 6: US4 — a second computer (P2)

- [ ] T021 [US4] `test/devices.test.js`
- [ ] T022 [US4] `app.js`: Settings → devices (add: show code; remove: password); Setup → "I have a device code"

## Phase 7: US5 — delivery log (P2)

- [ ] T023 [US5] `test/delivery.test.js` and `test/restart.test.js`
- [ ] T024 [US5] `lib/delivery.js` (wired in `lib/server.js`), `scripts/delivery-report.js`

## Phase 8: US6 — install (P3)

- [ ] T025 [US6] `bin/forum.js`: start, print the link, open the browser (`start` / `open` / `xdg-open`), "already running"
- [ ] T026 [US6] `install.ps1`, `install.sh` (pinned `HYPERGRAPH_REF`), README install and "start again" steps
- [ ] T027 [US6] manual checks 1–3 (plan.md); results noted in this file

## Phase 9: Trial

- [ ] T028 Tibo + 4 friends, 2 weeks; at the end merge everyone's `delivery.jsonl`; SC-001 = 0 missing
- [ ] T029 After hypergraph 013 merges: helpers in the allow-list + owner's settings field (FR-012)

## Order

Phase 1 → 2 → 3 → 4 (MVP) → 5, 6, 7 in any order → 8 → 9. Each phase ends with `npm test` green
and a commit.
