// What the page reads, built from hypergraph calls: `call(on, method, ...args)`
// is the page's call (and the tests' peer.call).

// How many comments are under `id`, replies included.
export async function commentCount (call, space, id) {
  const { items } = await call(space, 'linked', id, 'comment')
  const under = await Promise.all(items.map((c) => commentCount(call, space, c.id)))
  return items.length + under.reduce((a, b) => a + b, 0)
}
