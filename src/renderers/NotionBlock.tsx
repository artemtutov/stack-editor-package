import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { BlockData } from '../types'

type Props = {
  id: string
  data: BlockData
  selected?: boolean
}

function NotionBlock({ data, id, selected }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const blockRef = useRef<HTMLDivElement | null>(null)
  const [isFocused, setIsFocused] = useState(false)

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const isEmpty = !data.text || data.text.trim() === ''
    if (isEmpty) {
      const computedStyle = getComputedStyle(textarea)
      const lineHeight = parseFloat(computedStyle.lineHeight)
      const paddingTop = parseFloat(computedStyle.paddingTop)
      const oneLineHeight = Math.ceil(lineHeight + paddingTop)
      textarea.style.height = `${oneLineHeight}px`
    } else {
      textarea.style.height = '12px'
      const computedStyle = getComputedStyle(textarea)
      const paddingBottom = parseFloat(computedStyle.paddingBottom)
      const adjustedScrollHeight = textarea.scrollHeight - paddingBottom
      const newHeight = Math.max(24, adjustedScrollHeight)
      textarea.style.height = `${newHeight}px`
    }
  }, [data.text])

  // Track height changes and notify parent (callback or DOM event)
  useEffect(() => {
    const block = blockRef.current
    if (!block) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height =
          (entry as any).borderBoxSize?.[0]?.blockSize ||
          (entry.target as HTMLElement).getBoundingClientRect().height
        if (data.onHeightChange) {
          data.onHeightChange(id, height)
        } else {
          try {
            window.dispatchEvent(new CustomEvent('block:height', { detail: { id, height } }))
          } catch {}
        }
      }
    })

    resizeObserver.observe(block)
    return () => resizeObserver.disconnect()
  }, [id, data])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    },
    [id, data]
  )

  // Expose focus method
  useEffect(() => {
    if (data.focusRef) {
      data.focusRef.current = {
        focus: () => {
          textareaRef.current?.focus()
          setIsFocused(true)
        },
        setCaretToEnd: () => {
          const ta = textareaRef.current
          if (ta) {
            const len = ta.value.length
            ta.setSelectionRange(len, len)
            ta.focus()
            setIsFocused(true)
          }
        },
        setCaretAt: (pos: number) => {
          const ta = textareaRef.current
          if (ta) {
            const clamped = Math.max(0, Math.min(ta.value.length, pos))
            ta.setSelectionRange(clamped, clamped)
            ta.focus()
            setIsFocused(true)
          }
        },
      }
    }
  }, [data.focusRef])

  return (
    <div className="notion-block-wrapper">
      {/* Left Controls (+ button and drag handle) */}
      <div className="block-left-controls">
        <button
          className="add-button"
          onClick={() => {
            if (data.onAdd) {
              data.onAdd()
            } else {
              try {
                window.dispatchEvent(new CustomEvent('block:addBelow', { detail: { id } }))
              } catch {}
            }
          }}
          title="Add block below"
        >
          +
        </button>
        <button className="drag-handle" data-drag-handle>
          <span style={{ fontSize: 14, lineHeight: 1 }}>⋮⋮</span>
        </button>
      </div>

      <div
        ref={blockRef}
        className={`notion-block ${isFocused ? 'focused' : ''} ${selected ? 'selected' : ''} ${
          data.stackId ? 'in-stack' : ''
        }`}
      >
        <textarea
          ref={textareaRef}
          value={data.text}
          onChange={(e) => {
            const val = e.target.value
            if (data.onChange) {
              data.onChange(val)
            } else {
              try {
                window.dispatchEvent(new CustomEvent('block:change', { detail: { id, text: val } }))
              } catch {}
            }
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          rows={1}
          placeholder={data.placeholder || "Type '/' for commands"}
          className="notion-block-textarea"
        />
      </div>
    </div>
  )
}

function areEqual(prev: Props, next: Props) {
  if (prev.id !== next.id) return false
  if (prev.selected !== next.selected) return false
  const pd = prev.data
  const nd = next.data
  if (pd.text !== nd.text) return false
  if (pd.stackId !== nd.stackId) return false
  if (pd.isBottomNode !== nd.isBottomNode) return false
  if (pd.height !== nd.height) return false
  // ignore function prop identity to avoid needless re-renders while dragging
  return true
}

export default React.memo(NotionBlock, areEqual)
