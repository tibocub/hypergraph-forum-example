// A forum's look: a few colours, a font and a corner style from fixed lists,
// and a small logo. Checked when read (records come from other peers) and
// applied only through CSS variables, never as CSS text.

export const FONTS = { sans: 'system-ui, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, Consolas, monospace' }
export const CORNERS = { rounded: ['6px', '4px'], square: ['0', '0'], round: ['14px', '10px'] }
export const LOGO_MAX = 40000 // bytes; the record stays under hypergraph's 64 KB

const DEFAULT_FG = { light: '#1d1d1b', dark: '#e8e8e3' } // as style.css
const COLOR = /^#[0-9a-f]{6}$/i
const color = (v) => typeof v === 'string' && COLOR.test(v) ? v : null

// WCAG contrast ratio of two #rrggbb colours (1 to 21).
export function contrast (x, y) {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

// The logo as a data: URL if it is plain base64 of a PNG, JPEG or WebP (no SVG: it can run scripts).
function logoOf (v) {
  if (typeof v !== 'string' || v.length > Math.ceil(LOGO_MAX / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return null
  const head = atob(v.slice(0, 16))
  const type = head.startsWith('\x89PNG') ? 'png' : head.startsWith('\xff\xd8\xff') ? 'jpeg' : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP' ? 'webp' : null
  return type && `data:image/${type};base64,${v}`
}

// The valid part of a theme record: { bg, fg, accent, link, font, corner, logo }, each only if good.
// Text only with a background (light and dark mode have their own); text that is unreadable on it
// (contrast < 4.5) becomes the default text colour (light or dark mode's) that is; links likewise drop.
export function safeTheme (r) {
  const out = {}
  const bg = color(r?.bg)
  let fg = color(r?.fg)
  if (bg && !(fg && contrast(fg, bg) >= 4.5)) fg = [DEFAULT_FG.light, DEFAULT_FG.dark].sort((x, y) => contrast(y, bg) - contrast(x, bg))[0]
  if (bg && contrast(fg, bg) >= 4.5) Object.assign(out, { bg, fg })
  if (color(r?.accent)) out.accent = r.accent
  if (color(r?.link) && out.bg && contrast(r.link, out.bg) >= 4.5) out.link = r.link
  if (Object.hasOwn(FONTS, r?.font ?? '')) out.font = r.font
  if (Object.hasOwn(CORNERS, r?.corner ?? '')) out.corner = r.corner
  const logo = logoOf(r?.logo)
  if (logo) out.logo = logo
  return out
}

// Sets the page's CSS variables from a safeTheme(); what it lacks goes back to the stylesheet's.
export function applyTheme (th, root = document.documentElement) {
  const vars = {
    '--bg': th.bg, '--card': th.bg, '--fg': th.fg, '--muted': th.fg, '--accent': th.accent, '--link': th.link,
    '--font': th.font && FONTS[th.font], '--radius': th.corner && CORNERS[th.corner][0], '--radius-sm': th.corner && CORNERS[th.corner][1]
  }
  for (const [name, value] of Object.entries(vars)) value ? root.style.setProperty(name, value) : root.style.removeProperty(name)
}
