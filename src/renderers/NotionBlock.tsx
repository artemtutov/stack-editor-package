import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '@xyflow/react'
import type { BlockData } from '../types'
import { useBlockKeyboard } from '../hooks/useBlockKeyboard'
import { useLiveResize } from '../stores/useLiveResize'

type Props = {
  id: string
  data: BlockData
  selected?: boolean
  parentId?: string
}

function NotionBlock({ data, id, selected, parentId }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const blockRef = useRef<HTMLDivElement | null>(null)
  const [isFocused, setIsFocused] = useState(false)

  // Live resize transform (Option A)
  const zoom = useStore((s) => s.transform[2])
  const parentContainerId = (data as any).parentContainerId || parentId
  const resizeState = useLiveResize((state) =>
    parentContainerId ? state.resizing.get(parentContainerId) : undefined
  )
  const dxWorld = resizeState?.dx ?? 0
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const dxScreen = zoom ? dxWorld / zoom : dxWorld
  const dxSnapped = Math.round(dxScreen * dpr) / dpr

  // Debug log
  if (resizeState && dxSnapped !== 0) {
    console.log('🔵 Block transform:', { id, parentContainerId, dx: resizeState.dx, dxSnapped })
  }

  // Use extracted keyboard handler
  const handleKeyDown = useBlockKeyboard(id, data, textareaRef, blockRef)

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
    <div className="notion-block-wrapper" style={{ width: '100%' }}>
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
        {/* Inner wrapper for live resize transform */}
        <div
          className="block-content-wrapper"
          style={{
            transform: dxSnapped !== 0 ? `translate3d(${dxSnapped}px, 0, 0)` : undefined,
            transition: 'none',
          }}
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
