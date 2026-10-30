// A forum's look (theme record): checked when read, since records come from
// other peers; only owner and admins' themes count.

import test from 'brittle'
import { forumOf, eventually } from './helpers.js'
import { safeTheme, contrast } from '../public/theme.js'
import { themeOf } from '../public/lists.js'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]).toString('base64')

test('a good theme applies; anything else falls back to the default', (t) => {
  const good = { bg: '#101820', fg: '#F2F2F2', accent: '#ff8800', link: '#88ccff', font: 'serif', corner: 'square', logo: PNG }
  t.alike(safeTheme(good), { bg: '#101820', fg: '#F2F2F2', accent: '#ff8800', link: '#88ccff', font: 'serif', corner: 'square', logo: `data:image/png;base64,${PNG}` }, 'all of it')

  t.alike(safeTheme({ accent: 'url(https://evil.example/x.png)' }), {}, 'a url() is ignored')
  t.alike(safeTheme({ accent: '#fff;}body{display:none' }), {}, 'CSS injection is ignored')
  t.alike(safeTheme({ accent: '#12345' }), {}, 'a 6-character colour is ignored (#12345)')
  t.alike(safeTheme({ accent: '#1234567' }), {}, 'a 7-digit colour is ignored')
  t.alike(safeTheme({ accent: 'red' }), {}, 'a named colour is ignored')
  t.alike(safeTheme({ font: 'Comic Sans", url(x)', corner: 'blob' }), {}, 'a font or corner not in the list is ignored')
  t.alike(safeTheme({ accent: 42, link: null }), {}, 'not text: ignored')
  t.alike(safeTheme(null), {}, 'no record: the default')

  t.alike(safeTheme({ bg: '#ffffff', fg: '#eeeeee' }), { bg: '#ffffff', fg: '#1d1d1b' }, 'unreadable text (contrast < 4.5): the default text colour')
  t.alike(safeTheme({ bg: '#1a1a19' }), { bg: '#1a1a19', fg: '#e8e8e3' }, 'a background alone: the default text colour that reads on it (dark mode\'s)')
  t.alike(safeTheme({ fg: '#000000' }), {}, 'text alone: dropped (the background differs in dark mode)')
  t.alike(safeTheme({ bg: '#ffffff', fg: '#000000', link: '#ffff00' }), { bg: '#ffffff', fg: '#000000' }, 'an unreadable link colour: the default')
  t.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 0.01, 'contrast black on white is 21')

  t.alike(safeTheme({ logo: Buffer.from('<svg onload=alert(1)>').toString('base64') }), {}, 'an SVG or anything but PNG, JPEG or WebP: no logo')
  t.alike(safeTheme({ logo: 'data:image/png;base64,' + PNG }), {}, 'a logo is plain base64, nothing else')
  t.alike(safeTheme({ logo: PNG.slice(0, -1) + '"' }), {}, 'base64 only')
})

test('only the owner and admins set the forum\'s theme; every member reads the same', async (t) => {
  const { key, peers: [a, b, c] } = await forumOf(t, 'a', 'b', 'c')
  const ib = (await b.call('account', 'state')).identity
  await c.call(key, 'put', 'theme', { accent: '#ff0000' })
  t.alike(await themeOf(a.call, key), {}, 'a friend\'s theme is ignored')

  await a.call(key, 'put', 'theme', { accent: '#00aa00', font: 'mono' })
  t.alike(await eventually(async () => { const th = await themeOf(c.call, key); return th.accent && th }, 10000), { accent: '#00aa00', font: 'mono' }, 'the owner\'s, as c reads it')

  await a.call(key, 'setRole', ib, 'admin')
  t.ok(await eventually(async () => (await b.call(key, 'getRole', ib)) === 'admin', 10000), 'b is admin')
  await b.call(key, 'put', 'theme', { accent: '#0000aa', corner: 'square' })
  t.alike(await eventually(async () => { const th = await themeOf(c.call, key); return th.accent === '#0000aa' && th }, 10000), { accent: '#0000aa', corner: 'square' }, 'an admin\'s newer one wins')

  await b.call(key, 'put', 'theme', {})
  t.alike(await eventually(async () => { const th = await themeOf(c.call, key); return !th.accent && th }, 10000), {}, 'reset to the default')
})
