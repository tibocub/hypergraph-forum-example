// The forum's record types and rules: every member's app must declare the
// same. Between versions only add fields at the end of a type, and add types.

export const types = {
  post: { fields: { title: 'string', text: 'text' } },
  comment: { fields: { text: 'text', on: 'link' }, links: { on: ['post', 'comment'] } },
  vote: { fields: { value: 'int', on: 'link' }, links: { on: ['post', 'comment'] }, onePerMember: true },
  // A member's name and about-me (their page): their latest profile record.
  profile: { fields: { name: 'string', quote: 'string', contact: 'string', websites: 'text' } },
  // A member telling the moderators about a post or comment (hypergraph's flag is moderators' only).
  report: { fields: { on: 'link', reason: 'string' }, links: { on: ['post', 'comment'] } },
  // The forum's look (public/theme.js checks it when read; only owner and admins' count). logo: base64.
  theme: { fields: { bg: 'string', fg: 'string', accent: 'string', link: 'string', font: 'string', corner: 'string', logo: 'string' } }
}

// A rule's id changes whenever what it accepts changes (hypergraph's rule).
export const rules = [
  { id: 'title-length', validate: (r) => r.type !== 'post' || (r.title || '').length <= 300 },
  { id: 'vote-value', validate: (r) => r.type !== 'vote' || r.value === 1 || r.value === -1 },
  { id: 'name-length', validate: (r) => r.type !== 'profile' || ((r.name || '').length >= 1 && r.name.length <= 40) },
  { id: 'report-length', validate: (r) => r.type !== 'report' || (r.reason || '').length <= 300 },
  { id: 'about-length', validate: (r) => r.type !== 'profile' || ((r.quote || '').length <= 300 && (r.contact || '').length <= 300 && (r.websites || '').length <= 2000) }
]
