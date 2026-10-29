// GET /api/events: hypergraph's events as Server-Sent Events, to every open
// tab. The page listens first, then reads; on an event it reads again.

const SPACE_EVENTS = ['members', 'decisions', 'status', 'peers']

export class Live {
  constructor () {
    this.clients = new Set()
    this.watched = new Set()
    this.timer = setInterval(() => { for (const c of this.clients) c.write(': keep-alive\n\n') }, 25000)
    this.timer.unref()
  }

  // Follows an opened account: its own events and every space's, spaces
  // joined later included.
  attach (hg) {
    hg.on('spaces', () => { this.#watch(hg); this.send('spaces') })
    hg.on('devices', () => this.send('devices'))
    hg.on('settings', () => this.send('settings'))
    this.#watch(hg)
    this.send('account')
  }

  #watch (hg) {
    for (const { key } of hg.spaces()) {
      if (this.watched.has(key)) continue
      this.watched.add(key)
      const space = hg.space(key)
      space.on('change', ({ records }) => this.send('change', { space: key, records }))
      for (const name of SPACE_EVENTS) space.on(name, () => this.send(name, { space: key }))
    }
  }

  add (res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    res.write(': connected\n\n')
    this.clients.add(res)
    res.on('close', () => this.clients.delete(res))
  }

  send (event, data = {}) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const c of this.clients) c.write(msg)
  }

  close () {
    clearInterval(this.timer)
    for (const c of this.clients) c.end()
  }
}
