# hypergraph forum

A forum for a group of friends, with no server and no company in the middle. Each member runs it on
their own computer; posts go straight from computer to computer. Invite-only. Built on
[hypergraph](https://github.com/tibocub/hypergraph).

Boards, threads, comments, votes, edit and delete, moderation, a second computer, text with basic
Markdown. Everyone keeps the whole forum.

## Install

You need [Node.js](https://nodejs.org) 20 or newer and [git](https://git-scm.com). Then copy-paste
one line:

- **Windows** (in PowerShell):
  ```powershell
  irm https://raw.githubusercontent.com/tibocub/hypergraph-forum-example/main/install.ps1 | iex
  ```
- **macOS / Linux** (in a terminal):
  ```bash
  curl -fsSL https://raw.githubusercontent.com/tibocub/hypergraph-forum-example/main/install.sh | sh
  ```

It downloads the forum into `hypergraph-forum-app` in your home folder and opens it in your
browser. Then:

1. Choose a password, and write down the 24 words it shows you (they bring your account back if
   this computer dies).
2. Paste the invite code a friend sent you, and your name.

Run the same line again to update. Your data is elsewhere (`.hypergraph-forum` in your home folder),
so updating never touches it.

## Every day

- Start it: open a terminal, then
  ```bash
  cd ~/hypergraph-forum-app/hypergraph-forum-example
  ```
  ```bash
  npm start
  ```
  The browser opens on the forum. Your bookmark of it keeps working.
- **Keep that window open**: you are online with your friends only while it runs. Posts you write
  while your friends are offline reach them when you're both online again.
- Invite a friend: Settings → Make a code. A code works once, for 7 days.
- Another computer of yours: Settings → Add a computer, then install on the new one and choose
  "I already use the forum on another computer".

## Tips

- A friend can only join while you (or an admin) are online. Make a trusted friend admin (People),
  so either of you can let people in.
- Lost a computer? Settings → Your computers → remove, from another of yours.

## The trial: did every post arrive?

Each computer keeps a log of when it first saw every post, comment and vote:
`.hypergraph-forum/delivery.jsonl` in your home folder. At the end, send that file to Tibo. He runs

```bash
node scripts/delivery-report.js tibo.jsonl sam.jsonl ...
```

which lists anything some computer never saw, and how long posts took to arrive.

## For developers

`npm test` (brittle, peers on a local DHT). The plan: [`specs/001-forum/`](specs/001-forum/).
`FORUM_DIR`, `FORUM_PORT`, `FORUM_NO_BROWSER=1` change where data lives, the port (4790) and whether
a browser opens.
