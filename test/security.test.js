// FR-009: the server answers only with its token, the right Host and JSON
// bodies; only the listed calls and files exist.

import test from 'brittle'
import http from 'http'
import { peer, codeOf } from './helpers.js'

// A raw request, so the Host header can be anything.
function raw (url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

test('no token, a wrong Host, a form post, an unknown call or file: refused', async (t) => {
  const a = await peer(t, 'a')
  const auth = { authorization: `Bearer ${a.token}` }
  const json = { ...auth, 'content-type': 'application/json' }
  const state = JSON.stringify({ on: 'account', method: 'state', args: [] })

  t.is((await raw(a.url + '/')).status, 401, 'the page needs the token')
  t.is((await raw(a.url + '/api/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: state })).status, 401, 'the API too')
  t.is((await raw(a.url + '/api/call', { method: 'POST', headers: { ...json, authorization: 'Bearer nope' }, body: state })).status, 401, 'a wrong token')
  t.is((await raw(a.url + '/api/events')).status, 401, 'the live channel too')
  t.is((await raw(a.url + '/login?token=nope')).status, 401, 'login with a wrong token')

  t.is((await raw(a.url + '/api/call', { method: 'POST', headers: { ...json, host: 'evil.example:80' }, body: state })).status, 403, 'another Host (DNS rebinding)')
  t.is((await raw(a.url + '/api/call', { method: 'POST', headers: { ...json, origin: 'http://evil.example' }, body: state })).status, 403, 'another Origin')
  t.is((await raw(a.url + '/api/call', { method: 'POST', headers: { ...auth, 'content-type': 'text/plain' }, body: state })).status, 415, 'not JSON (a form)')
  t.is((await raw(a.url + '/api/call', { method: 'POST', headers: json, body: '{' })).status, 400, 'bad JSON')

  t.is((await raw(a.url + '/../package.json', { headers: auth })).status, 404, 'no file outside the list')
  t.is((await raw(a.url + '/lib/server.js', { headers: auth })).status, 404, 'not the server code')

  t.is((await raw(a.url + '/api/call', { method: 'POST', headers: json, body: state })).status, 200, 'with the token: fine')
  t.is(await codeOf(a.call('account', 'close')), 'UNKNOWN_CALL', 'a method not on the list')
  t.is(await codeOf(a.call('account', 'constructor')), 'UNKNOWN_CALL', 'nor an object\'s own')
  t.is(await codeOf(a.call('account', 'spaces')), 'NOT_SET_UP', 'before setup only state and setup')
})
