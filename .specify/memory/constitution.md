# hypergraph-forum-example Constitution

Version 1.0.0 (2026-10-29). Adapted from hypergraph's and SwarmFS's.

## I. Nothing Lost (NON-NEGOTIABLE)

A post, comment or vote a member made reaches every member, and survives restarts, updates and a
device going offline. Every member keeps the whole forum. A change that could lose or hide data
needs a test showing it doesn't.

## II. Test-First, Through the API (NON-NEGOTIABLE)

Every flow has a `brittle` test that plays it through the JSON API, with two or more real peers on
a local DHT, written before the code. Every fix adds a test that fails before and passes after.
If a flow is awkward to test, the API is wrong.

## III. Compose hypergraph, Never Edit It

The forum uses `require('hypergraph/next')` and nothing below it: no replication, crypto or
networking code here. Something missing or awkward in hypergraph goes into
`specs/requests-to-hypergraph.md`, with why. No workaround, no edit of `../hypergraph`.

## IV. Small and Plain

Plain HTML/JS in the browser, no build step, no framework. Node on desktop only. Few
dependencies. The smallest design that meets the decisions in hypergraph's `ROADMAP.md`.

## V. Local and Locked

The server listens on 127.0.0.1 only and answers only with its random token (and the right Host).
Text from other members is untrusted: rendered escaped, never as HTML.

## Governance

Decisions live in `E:\Code\P2P\hypergraph\ROADMAP.md` (lead conversation). This file changes only
with Tibo's OK; bump the version.
