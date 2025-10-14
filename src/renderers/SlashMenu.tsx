import { useEffect, useState, useCallback } from 'react'

const MENU_SECTIONS = [
  {
    id: 'style',
    title: 'Style',
    items: [
      { id: 'text', icon: 'T', title: 'Text', description: 'Just start writing with plain text', keywords: ['text', 'paragraph', 'para', 'p'] },
      { id: 'heading1', icon: 'H₁', title: 'Heading 1', description: 'Big section heading', keywords: ['h1', 'heading', 'title', 'head'] },
      { id: 'heading2', icon: 'H₂', title: 'Heading 2', description: 'Medium section heading', keywords: ['h2', 'heading', 'head'] },
      { id: 'heading3', icon: 'H₃', title: 'Heading 3', description: 'Small section heading', keywords: ['h3', 'heading', 'head'] },
      { id: 'bulletlist', icon: '•', title: 'Bullet List', description: 'Create a simple bulleted list', keywords: ['bullet', 'list', 'ul', 'unordered'] },
      { id: 'numberlist', icon: '1.', title: 'Numbered List', description: 'Create a list with numbering', keywords: ['number', 'numbered', 'list', 'ol', 'ordered'] },
      { id: 'todo', icon: '☐', title: 'To-do list', description: 'Track tasks with a to-do list', keywords: ['todo', 'task', 'checkbox', 'check'] },
      { id: 'blockquote', icon: '❝', title: 'Blockquote', description: 'Capture a quote', keywords: ['quote', 'blockquote', 'cite'] },
    ],
  },
]

const MENU_ITEMS = MENU_SECTIONS.flatMap((section) => section.items)

export type SlashMenuItem = (typeof MENU_ITEMS)[number]

export default function SlashMenu({
  position,
  query = '',
  onSelect,
  onClose,
}: {
  position: { x: number; y: number }
  query?: string
  onSelect: (item: SlashMenuItem) => void
  onClose: () => void
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Filter items by query
  const filteredItems = query
    ? MENU_ITEMS.filter((item) => {
        const q = query.toLowerCase()
        return (
          item.title.toLowerCase().includes(q) ||
          item.keywords.some((keyword) => keyword.includes(q))
        )
      })
    : MENU_ITEMS

  // Group filtered items by section
  const filteredSections = MENU_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => filteredItems.includes(item)),
  })).filter((section) => section.items.length > 0)

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          onSelect(filteredItems[selectedIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [selectedIndex, onSelect, onClose, filteredItems]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.slash-menu')) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Show "No results" if query exists but no matches
  if (query && filteredItems.length === 0) {
    return (
      <div
        className="slash-menu"
        style={{ position: 'fixed', left: `${position.x}px`, top: `${position.y + 24}px` }}
      >
        <div style={{ padding: '12px', color: 'rgba(55, 53, 47, 0.65)', fontSize: '14px' }}>
          No results found
        </div>
      </div>
    )
  }

  return (
    <div
      className="slash-menu"
      style={{ position: 'fixed', left: `${position.x}px`, top: `${position.y + 24}px` }}
    >
      {filteredSections.map((section, sectionIndex) => (
        <div key={section.id} className="slash-menu-section">
          <div className="slash-menu-section-header">{section.title}</div>
          {section.items.map((item) => {
            const globalIndex = filteredItems.indexOf(item)
            return (
              <div
                key={item.id}
                className={`slash-menu-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(item)
                }}
                onMouseEnter={() => setSelectedIndex(globalIndex)}
              >
                <div className="slash-menu-item-icon">{item.icon}</div>
                <div className="slash-menu-item-content">
                  <div className="slash-menu-item-title">{item.title}</div>
                  <div className="slash-menu-item-description">{item.description}</div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

