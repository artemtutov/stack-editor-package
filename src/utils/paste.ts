/**
 * Split pasted HTML content into individual top-level blocks.
 */
export function splitPastedContent(html: string): string[] {
  if (!html.trim()) {
    return ['<p></p>']
  }

  if (typeof DOMParser === 'undefined') {
    return [html]
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const topLevelNodes = Array.from(doc.body.children)

  if (topLevelNodes.length <= 1) {
    return [html]
  }

  return topLevelNodes.map((node) => node.outerHTML)
}
