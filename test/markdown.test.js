// FR-008: basic Markdown, and other members' text never runs as HTML.

import test from 'brittle'
import { markdown } from '../public/markdown.js'

test('HTML is escaped, wherever it is', (t) => {
  t.is(markdown('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>')
  t.is(markdown('**<b>x</b>**'), '<p><strong>&lt;b&gt;x&lt;/b&gt;</strong></p>')
  t.is(markdown('`<script>`'), '<p><code>&lt;script&gt;</code></p>')
  t.is(markdown('```\n<script>alert(1)</script>\n```'), '<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>')
  t.is(markdown('- <i>'), '<ul><li>&lt;i&gt;</li></ul>')
})

test('only http(s) links, and no way out of the attribute', (t) => {
  t.is(markdown('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>', 'javascript: stays text')
  t.is(markdown('[x](data:text/html,hi)'), '<p>[x](data:text/html,hi)</p>', 'data: too')
  t.is(markdown('[x](https://a.b/"onmouseover="alert(1))'), '<p><a href="https://a.b/&quot;onmouseover=&quot;alert(1" rel="noopener noreferrer" target="_blank">x</a>)</p>', 'a quote stays inside the href')
  t.is(markdown('[site](https://example.com/a?b=1&c=2)'), '<p><a href="https://example.com/a?b=1&amp;c=2" rel="noopener noreferrer" target="_blank">site</a></p>')
})

test('each pattern', (t) => {
  t.is(markdown('a **b** *c* `d`'), '<p>a <strong>b</strong> <em>c</em> <code>d</code></p>')
  t.is(markdown('`**not bold**`'), '<p><code>**not bold**</code></p>', 'nothing inside code')
  t.is(markdown('one\ntwo\n\nthree'), '<p>one<br>two</p><p>three</p>', 'lines and paragraphs')
  t.is(markdown('- a\n- b\n\n1. c\n2. d'), '<ul><li>a</li><li>b</li></ul><ol><li>c</li><li>d</li></ol>')
  t.is(markdown('> quoted\n> more\nafter'), '<blockquote>quoted<br>more</blockquote><p>after</p>')
  t.is(markdown('```\ncode\n  kept\n```'), '<pre><code>code\n  kept</code></pre>')
  t.is(markdown(''), '')
  t.is(markdown(null), '')
})
