# CLAUDE.md

Read before doing anything here.

## What this is

An invite-only, reddit-style forum for Tibo and 5–20 friends, with no server: each member runs a small
Node process on their own computer and uses it in a browser tab on `127.0.0.1`. It is built on
hypergraph's new core (`require('hypergraph/next')`) to prove hypergraph with real people. Its pieces
(the JSON API, the live channel) later seed HyperBrowser.

State (2026-10-29): spec 001 written (`specs/001-forum/`), nothing built yet.

## Governing documents

- `.specify/memory/constitution.md` — binding.
- Direction and decisions: `E:\Code\P2P\hypergraph\ROADMAP.md` (Decisions 2026-10-29 "forum web
  app"). hypergraph's API: its `docs/next/`; the feature set: its `test/next/forum/`.

## Rules

- **Never edit `../hypergraph`, never work around it.** Anything missing or awkward goes into
  `specs/requests-to-hypergraph.md`, with why. The lead conversation reviews it.
- **Test-first.** `brittle` tests through the JSON API, two or more peers on a local DHT
  (`test/helpers.js`). The browser UI gets a smoke test at most.
- **Plain HTML/JS, no build step**, no framework. ESM everywhere (hypergraph itself is CommonJS).
- **Desktop Node only** (no Bare).
- **Local and locked**: listen on 127.0.0.1, every request needs the random token.
- `/ponytail` (full) for everything written here. Tibo wants short reports in bullets.

## How sessions work here

Like SwarmFS: a lead conversation (in the hypergraph repo) decides and reviews; worker sessions do one
job each, on a branch, commit locally, don't push (Tibo pushes), and stop with a short report.
Spec-kit: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. On Windows
prefix its python scripts with `PYTHONIOENCODING=utf-8`.

## Dependencies

`"hypergraph": "file:../hypergraph"` (a junction made by `npm install`; never `ln -s` on Windows).
hyperdht pinned to 6.32.0 like hypergraph (see its ROADMAP).

## Commits

Small steps. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
