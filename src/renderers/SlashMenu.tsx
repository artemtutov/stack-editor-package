import { useEffect, useState, useCallback } from 'react'

const MENU_SECTIONS = [
  {
    id: 'style',
    title: 'Style',
    items: [
      { id: 'text', icon: 'T', title: 'Text', description: 'Just start writing with plain text' },
      { id: 'heading1', icon: 'H₁', title: 'Heading 1', description: 'Big section heading' },
      { id: 'heading2', icon: 'H₂', title: 'Heading 2', description: 'Medium section heading' },
      { id: 'heading3', icon: 'H₃', title: 'Heading 3', description: 'Small section heading' },
      { id: 'bulletlist', icon: '•', title: 'Bullet List', description: 'Create a simple bulleted list' },
      { id: 'numberlist', icon: '1.', title: 'Numbered List', description: 'Create a list with numbering' },
      { id: 'todo', icon: '☐', title: 'To-do list', description: 'Track tasks with a to-do list' },
      { id: 'blockquote', icon: '❝', title: 'Blockquote', description: 'Capture a quote' },
      { id: 'codeblock', icon: '</>', title: 'Code Block', description: 'Capture a code snippet' },
    ],
  },
]

const MENU_ITEMS = MENU_SECTIONS.flatMap((section) => section.items)

export type SlashMenuItem = (typeof MENU_ITEMS)[number]

export default function SlashMenu({
  position,
  onSelect,
  onClose,
}: {
  position: { x: number; y: number }
  onSelect: (item: SlashMenuItem) => void
  onClose: () => void
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % MENU_ITEMS.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onSelect(MENU_ITEMS[selectedIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [selectedIndex, onSelect, onClose]
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

  return (
    <div
      className="slash-menu"
      style={{ position: 'fixed', left: `${position.x}px`, top: `${position.y + 24}px` }}
    >
      {MENU_SECTIONS.map((section, sectionIndex) => (
        <div key={section.id} className="slash-menu-section">
          <div className="slash-menu-section-header">{section.title}</div>
          {section.items.map((item, itemIndex) => {
            const globalIndex = MENU_SECTIONS.slice(0, sectionIndex).reduce(
              (acc, sec) => acc + sec.items.length,
              0
            ) + itemIndex
            return (
              <div
                key={item.id}
                className={`slash-menu-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                onClick={() => onSelect(item)}
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

