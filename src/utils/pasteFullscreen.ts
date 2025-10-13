export function normalizeFullscreenPaste(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Replace images with a harmless text marker
  doc.querySelectorAll('img').forEach((el) => {
    const alt = el.getAttribute('alt') || ''
    const marker = document.createTextNode(alt ? `(image: ${alt})` : '(image)')
    el.replaceWith(marker)
  })
  // Replace checkboxes with plain text [ ] prefix
  doc.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    const checked = (el as HTMLInputElement).checked
    const marker = document.createTextNode(checked ? '[x] ' : '[ ] ')
    el.replaceWith(marker)
  })
  return doc.body.innerHTML
}

