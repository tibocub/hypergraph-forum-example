// Smoke test of the page: the login link sets the cookie, then the page and
// its scripts load with it.

import test from 'brittle'
import { peer } from './helpers.js'

test('the login link, then the page and its files', async (t) => {
  const a = await peer(t, 'a')
  const login = await fetch(`${a.url}/login?token=${a.token}`, { redirect: 'manual' })
  t.is(login.status, 302, 'login redirects to the page')
  const cookie = login.headers.get('set-cookie')
  t.ok(/HttpOnly/.test(cookie) && /SameSite=Strict/.test(cookie), 'an HttpOnly, SameSite=Strict cookie')

  const headers = { cookie: cookie.split(';')[0] }
  const page = await fetch(a.url + '/', { headers })
  t.ok((await page.text()).includes('src="/app.js"'), 'the page loads app.js')
  for (const file of ['/app.js', '/markdown.js', '/lists.js', '/theme.js', '/style.css']) {
    const res = await fetch(a.url + file, { headers })
    t.is(res.status, 200, `${file} served`)
  }
  const js = await (await fetch(a.url + '/app.js', { headers })).text()
  t.ok(js.includes("from './markdown.js'"), 'app.js is the module')
})
