import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'mark',
  'code',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
]

const ALLOWED_ATTR = ['href', 'target', 'rel']

const FORBID_TAGS = ['style', 'script', 'iframe', 'object', 'embed']

/**
 * Sanitize HTML to the subset of tags we support.
 */
export function sanitizeHTML(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    FORBID_ATTR: ['style', 'onerror', 'onload'],
  })

  let normalized = clean
    .replace(/<b>/gi, '<strong>')
    .replace(/<\/b>/gi, '</strong>')
    .replace(/<i>/gi, '<em>')
    .replace(/<\/i>/gi, '</em>')

  normalized = sanitizeLinks(fixLinkSecurity(normalized))

  return normalized
}

/**
 * Ensure links with target="_blank" have secure rel attributes.
 */
function fixLinkSecurity(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const links = doc.querySelectorAll('a[target="_blank"]')

  links.forEach((link) => {
    const rel = link.getAttribute('rel') || ''
    const relValues = new Set(rel.split(/\s+/).filter(Boolean))
    relValues.add('noopener')
    relValues.add('noreferrer')
    link.setAttribute('rel', Array.from(relValues).join(' '))
  })

  return doc.body.innerHTML
}

/**
 * Allow only https and mailto links; strip others.
 */
function sanitizeLinks(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const links = doc.querySelectorAll('a[href]')

  links.forEach((link) => {
    const href = link.getAttribute('href') || ''
    const isHttps = href.startsWith('https:')
    const isMailto = href.startsWith('mailto:')
    if (!isHttps && !isMailto) {
      link.removeAttribute('href')
      link.removeAttribute('target')
      link.removeAttribute('rel')
    }
  })

  return doc.body.innerHTML
}

/**
 * Sanitize then enforce a minimal non-empty paragraph.
 */
export function sanitizeAndSave(html: string): string {
  const sanitized = sanitizeHTML(html)
  if (!sanitized.trim() || sanitized === '<p></p>') {
    return '<p></p>'
  }
  return sanitized
}
