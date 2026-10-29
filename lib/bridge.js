// POST /api/call: { on: 'account' | a space key, method, args } runs that
// hypergraph call and returns its answer. Only the calls listed here exist.

import { types } from './types.js'

const ACCOUNT = new Set(['spaces', 'createSpace', 'redeemInvite', 'devices', 'addDevice', 'removeDevice',
  'settings', 'setSetting', 'recoveryPhrase', 'protectRecoveryPhrase', 'forgetRecoveryPhrase'])
const SPACE = new Set(['get', 'put', 'edit', 'del', 'query', 'linked', 'count', 'sum', 'members', 'getRole',
  'setRole', 'removeRole', 'roles', 'defineRole', 'moderateAction', 'decisions', 'createInvite', 'revokeInvite',
  'createSubspace', 'subspaces', 'setPolicy', 'status', 'peers'])
const FILTERS = ['on', 'by', 'where', 'since', 'until']

export class CallError extends Error {
  constructor (code, message) {
    super(message)
    this.code = code
  }
}

// The account's forum: its top space, or null.
export const forumOf = (hg) => hg.spaces().find((s) => !s.parent) || null

export async function call (hg, { on, method, args = [] }) {
  if (!Array.isArray(args)) throw new CallError('BAD_REQUEST', 'args is a list')
  if (on === 'account' && method === 'state') return state(hg)
  if (!(on === 'account' ? ACCOUNT : SPACE).has(method)) throw new CallError('UNKNOWN_CALL', `No call "${method}" here`)
  if (!hg) throw new CallError('NOT_SET_UP', 'Set up this computer first (a new account, or a device code)')

  if (on === 'account') {
    if ((method === 'createSpace' || method === 'redeemInvite') && forumOf(hg)) throw new CallError('ONE_FORUM', 'This account is already in its forum')
    if (method === 'addDevice') {
      const { code, added } = await hg.addDevice(...args)
      added.catch(() => {}) // the 'devices' event says when it is used
      return { code }
    }
    return await hg[method](...args)
  }
  const space = hg.space(on)
  if (method === 'query') {
    const { type, limit = 20, after, ...filters } = args[0] || {}
    if (!types[type]) throw new CallError('BAD_REQUEST', `No type "${type}"`)
    let q = space.query(type)
    for (const f of FILTERS) if (filters[f] != null) q = q[f](filters[f])
    return await q.latest(limit, { after })
  }
  return await space[method](...args)
}

function state (hg) {
  if (!hg) return { setUp: false }
  return { setUp: true, identity: hg.identity.publicKey, device: hg.device.publicKey, forum: forumOf(hg) }
}

// For JSON: a Space as { key, name, parent, private }.
export function toJSON (key, value) {
  if (value && typeof value === 'object' && typeof value.query === 'function' && value.key) {
    return { key: value.key, name: value.name, parent: value.parent, private: value.private }
  }
  return value
}
