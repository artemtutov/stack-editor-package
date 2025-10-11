import { useCallback } from 'react'
import type { BlockData } from '../types'

export type BlockKeyboardHandlers = {
  onSlashCommand?: (id: string, rect?: DOMRect | null) => void
  onDelete?: (id: string) => void
  onMergeUp?: (id: string) => void
  onSplit?: (id: string, before: string, after: string) => void
  onTabNext?: (id: string) => void
  onTabPrev?: (id: string) => void
}

/**
 * Hook for handling keyboard events in a block
 * Extracts keyboard interaction logic from the NotionBlock component
 */
export function useBlockKeyboard(
  id: string,
  data: BlockData,
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  blockRef: React.RefObject<HTMLDivElement>
) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash command
      if (e.key === '/') {
        e.preventDefault()
        const rect = blockRef.current?.getBoundingClientRect() || null
        if (data.onSlashCommand) {
          data.onSlashCommand(id, rect)
        } else {
          try {
            window.dispatchEvent(new CustomEvent('block:slash', { detail: { id, rect } }))
          } catch {}
        }
        return
      }

      // Backspace - delete or merge
      if (e.key === 'Backspace') {
        const ta = textareaRef.current
        const text = data.text ?? ''
        if (ta && ta.selectionStart === 0 && ta.selectionEnd === 0) {
          e.preventDefault()
          if (text.length === 0) {
            if (data.onDelete) {
              data.onDelete(id)
            } else {
              try {
                window.dispatchEvent(new CustomEvent('block:delete', { detail: { id } }))
              } catch {}
            }
          } else {
            if (data.onMergeUp) {
              data.onMergeUp(id)
            } else {
              try {
                window.dispatchEvent(new CustomEvent('block:mergeUp', { detail: { id } }))
              } catch {}
            }
          }
          return
        }
      }

      // Enter - split block
      if (e.key === 'Enter' && !e.shiftKey) {
        const ta = textareaRef.current
        if (ta) {
          e.preventDefault()
          const start = ta.selectionStart ?? 0
          const end = ta.selectionEnd ?? start
          const before = (data.text ?? '').slice(0, start)
          const after = (data.text ?? '').slice(end)
          if (data.onSplit) {
            data.onSplit(id, before, after)
          } else {
            try {
              window.dispatchEvent(new CustomEvent('block:split', { detail: { id, before, after } }))
            } catch {}
          }
          return
        }
      }

      // Tab navigation
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        if (data.onTabNext) {
          data.onTabNext(id)
        } else {
          try {
            window.dispatchEvent(new CustomEvent('block:tabNext', { detail: { id } }))
          } catch {}
        }
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        if (data.onTabPrev) {
          data.onTabPrev(id)
        } else {
          try {
            window.dispatchEvent(new CustomEvent('block:tabPrev', { detail: { id } }))
          } catch {}
        }
      }

      // Arrow Up - navigate to previous block when cursor at start
      if (e.key === 'ArrowUp') {
        const ta = textareaRef.current
        if (ta && ta.selectionStart === 0 && ta.selectionEnd === 0) {
          e.preventDefault()
          if (data.onArrowUp) {
            data.onArrowUp(id)
          } else {
            try {
              window.dispatchEvent(new CustomEvent('block:arrowUp', { detail: { id } }))
            } catch {}
          }
          return
        }
      }

      // Arrow Down - navigate to next block when cursor at end
      if (e.key === 'ArrowDown') {
        const ta = textareaRef.current
        const text = data.text ?? ''
        if (ta && ta.selectionStart === text.length && ta.selectionEnd === text.length) {
          e.preventDefault()
          if (data.onArrowDown) {
            data.onArrowDown(id)
          } else {
            try {
              window.dispatchEvent(new CustomEvent('block:arrowDown', { detail: { id } }))
            } catch {}
          }
          return
        }
      }
    },
    [id, data, textareaRef, blockRef]
  )

  return handleKeyDown
}
