// The delivery log (FR-011): one line per post, comment, vote and name this
// computer sees, with its author's stamp (posted at) and this computer's
// clock (first seen). The first line says which computer and since when it
// is in the forum. scripts/delivery-report.js merges several of these files.

import fs from 'fs'

const LOGGED = new Set(['post', 'comment', 'vote', 'profile'])

export class Delivery {
  constructor (file) {
    this.file = file
    this.seen = new Set()
    this.joinedAt = null
    this.watched = new Set()
    if (!fs.existsSync(file)) return
    for (const text of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!text) continue
      const line = JSON.parse(text)
      if (line.id) this.seen.add(line.id)
      else if (line.joinedAt) this.joinedAt = line.joinedAt
    }
  }

  // Call right after opening, before connecting: nothing arrives unseen.
  attach (hg) {
    this.hg = hg
    hg.on('spaces', () => this.#watch())
    this.#watch()
  }

  #watch () {
    for (const { key } of this.hg.spaces()) {
      if (this.watched.has(key)) continue
      if (!this.joinedAt) {
        this.joinedAt = Date.now()
        this.#append({ identity: this.hg.identity.publicKey, device: this.hg.device.publicKey, joinedAt: this.joinedAt })
      }
      this.watched.add(key)
      const space = this.hg.space(key)
      space.on('change', ({ records }) => this.#seen(space, key, records).catch(() => {}))
    }
  }

  async #seen (space, key, records) {
    for (const r of records) {
      if (!LOGGED.has(r.type) || r.deleted || this.seen.has(r.id)) continue
      const seenAt = Date.now()
      this.seen.add(r.id)
      const { record } = await space.get(r.id)
      if (!record) {
        this.seen.delete(r.id)
        continue
      }
      const line = { id: r.id, type: r.type, space: key, author: record.author, device: record.device, postedAt: record.stamp, seenAt }
      if (r.type === 'profile') line.name = record.name
      if (record.stamp < this.joinedAt) line.backlog = true // written before this computer was in
      this.#append(line)
    }
  }

  #append (line) {
    fs.appendFileSync(this.file, JSON.stringify(line) + '\n')
  }
}
