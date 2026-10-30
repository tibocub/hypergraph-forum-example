# hypergraph forum

An example app built with [hypergraph](https://github.com/tibocub/hypergraph).

Serves now to test hypergraph in real conditions and will later serves as a piece of documentation
that shows how to build apps with hypergraph.

It's not an app made for one specific forum, its a P2P forum client that let users create and join
forums.

Features implemented:
- Boards
- threads
- comments
- text with basic Markdown (bold text, links, etc.)
- votes
- edit and delete
- moderation
- multi-device support


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


## How hypergraph keeps the data online

### 100% server-less

Peers only, everyone replicates everything.

Hypergraph is designed to be functional without any server or 24/7 running services.
It is configurable so it's possible to make a hypergraph that asks every peer to
replicate the totality of the database, meaning any online peer can send any piece
of data to another.

**Cost**: One full hypergraph replication on each device

**Pros**: Allow people to create self-hosted small communities without the need to setup a hosting service (can make things as easy a creating a discord server)

**Cons: Inconsitent update propagation across peers (the data is eventually consistent, ordered correctly and deterministically)

**Limitations**: Not optimal for big communities or long-lasting data accumulation (forums, chats with full history, big files such as videos)

**Best use cases: Big communities that host lightweight data. A big community to assure consistent updates (always one peer connected to deliver the latest state) 
and lightweight data so storing the entire hypergraph on each device isn't a problem. Not relying on anything else than other peers also make it a very robust solution
as there is no point of failure since everyone hosts everything.

For instance: text-only forums and chats...


### with helper services

One or many services (running on VPS or the devices of people that want to help with hosting)
runs 24/7 to assure that ALL data is ALWAYS available.

Peers only replicate the data they ask for. In this setup, the service only have to assure the availability of the data, not the bandwidth required to assure a fluid transfers.
In a context where 1000 users try to fetch the same piece of data at the same time, the workload get distributed across
all peers.

In fact, 20 users requesting different pieces of data that no other peer can provide to a same running service is much more demanding
than 1000 users requesting the same piece of data.

**Cost**: At least one VPS with enough storage for the entire hypergraph and enough bandwidth to support concurrent requests

**Pros**: Scallable, provides consistent update delivery, allow hosting heavy data (huge indexes, big chats/forums with full history, videos) without replicating everything on every user devices.
It's also possible for users to help benevolently by running helpers on their own devices.

**Cons**: Slower than full local replication because the data must be requested on-demand. This also require someone to have the technical knowledge to setup a service.

**Limitations**: Depends on an infrastructure. As the data and community grows, running more services with more available storage might be required.

**Best use cases**: When there is too much data to replicate entirely on each device or when small communities needs reliable update propagation.
For instance: Collaborative document editing (like Miro or Google Docs),

### Hybrid

A service assure constant availability but anyone connected does too. The service mainly assure that everyone always have the latest updates but
never have to face the situation where 20 users request different pieces of data that no other peer can provide.

It accumulates the Pros of both full replication and service-based hosting but also accumulates the costs and limitations of both.

**Cost**: The full hypergraph on both the peers and one/many service(s)

**Pros**: Data availability scale very well, pratically unstoppable and DDOS-proof, Fast (full data available locally) and consistent updates (the service is always online with the latest updates)

**Cons**: The growth of data in size doesn't scale well.

**Limitations**: The total size of the hypergraph must remain small enough to exist on all devices.

**Best use cases**: Like full server-less. This "hybrid" setup only is the result of running a service when peers already replicates everything to make updates more consistent.
It's also the most robust setup as it can benefits from a service without requirering one.

### Learn more

For a deeper understanding of how the data lives in hypergraphs, check [its repo](https://github.com/tibocub/hypergraph) and its dependencies,
mainly [hypergraph](https://github.com/holepunchto/hypercore) (a single-writer, append-only log optimized for P2P operations),
[hypergraph](https://github.com/holepunchto/autobase) (a multi-writer conflict-free datastructure built on hypercores),
and [blind-peers](https://github.com/holepunchto/blind-peer) (how a running service can host a peer's data when that peer goes offline, and "blind" because it can't read the data it hosts).


## For developers

`npm test` (brittle, peers on a local DHT). The plan: [`specs/001-forum/`](specs/001-forum/).
`FORUM_DIR`, `FORUM_PORT`, `FORUM_NO_BROWSER=1` change where data lives, the port (4790) and whether
a browser opens.
