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
    // Check if the single node is a wrapper containing multiple paragraphs
    if (topLevelNodes.length === 1) {
      const wrapper = topLevelNodes[0]
      const children = Array.from(wrapper.children)

      // If it's a div/meta-container with multiple block-level children, extract them
      if (wrapper.tagName === 'DIV' && children.length > 1) {
        const blockChildren = children.filter(c =>
          ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'].includes(c.tagName)
        )

        if (blockChildren.length > 1) {
          return blockChildren.map(node => node.outerHTML)
        }
      }
    }

    return [html]
  }

  return topLevelNodes.map((node) => node.outerHTML)
}
