// Basic Markdown to HTML, safe for other members' text: everything is escaped
// first, then a few patterns become tags. Paragraphs, **bold**, *italic*,
// `code`, ``` blocks, > quotes, - and 1. lists, [links](https://…).

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const KINDS = [['ul', /^[-*] /], ['ol', /^\d+\. /], ['blockquote', /^> ?/]]
const kindOf = (line) => (KINDS.find(([, re]) => re.test(line)) || [null])[0]
const strip = (line) => line.replace(KINDS.find(([, re]) => re.test(line))[1], '')

// Code spans first, so nothing inside them becomes a tag.
function inline (text) {
  return text.split(/(`[^`\n]+`)/).map((part, i) => i % 2 ? `<code>${esc(part.slice(1, -1))}</code>` : spans(esc(part))).join('')
}

function spans (s) {
  return s
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
}

export function markdown (src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let para = []
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('```')) {
      flush()
      const code = []
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i])
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    const kind = kindOf(line)
    if (kind) {
      flush()
      const items = []
      for (; i < lines.length && kindOf(lines[i]) === kind; i++) items.push(inline(strip(lines[i])))
      i--
      out.push(kind === 'blockquote' ? `<blockquote>${items.join('<br>')}</blockquote>` : `<${kind}>${items.map((x) => `<li>${x}</li>`).join('')}</${kind}>`)
      continue
    }
    if (line.trim()) para.push(line)
    else flush()
  }
  flush()
  return out.join('')
}
