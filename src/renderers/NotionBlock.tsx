import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { BlockData, RichTextPayload } from '../types'
import TipTapEditor from './TipTapEditor'
import { getAbsolutePosition } from '../logic/dragAndDrop'

type Props = {
  id: string
  data: BlockData
  selected?: boolean
  parentId?: string
}

function NotionBlock({ data, id, selected, parentId }: Props) {
  const blockRef = useRef<HTMLDivElement | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const { getNode, getNodes } = useReactFlow()
  const node = getNode(id)
  const allNodes = getNodes()
  const absolutePos = node ? getAbsolutePosition(node, allNodes) : { x: 0, y: 0 }

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

  const dispatchEvent = useCallback(
    (name: string, detail: Record<string, unknown>) => {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail }))
      } catch {}
    },
    []
  )

  const handleAddBelow = useCallback(
    (initialContent?: RichTextPayload) => {
      if (data.onAdd) {
        data.onAdd(initialContent)
      } else {
        dispatchEvent('block:addBelow', { id, content: initialContent })
      }
    },
    [data, dispatchEvent, id]
  )

  const handleAddMultipleBelow = useCallback(
    (payloads: RichTextPayload[]) => {
      if (data.onAddMultiple) {
        data.onAddMultiple(payloads)
      } else {
        dispatchEvent('block:addMultipleBelow', { id, payloads })
      }
    },
    [data, dispatchEvent, id]
  )

  const handleSlashCommand = useCallback((payload: any) => {
    if (data.onSlashCommand) {
      data.onSlashCommand(payload)
    } else {
      dispatchEvent('block:slash', { id, payload })
    }
  }, [data, dispatchEvent, id])

  const handleContentUpdate = useCallback(
    (payload: RichTextPayload) => {
      if (data.onContentUpdate) {
        data.onContentUpdate(payload)
      } else {
        dispatchEvent('block:change', { id, content: payload })
      }
    },
    [data, dispatchEvent, id]
  )

  const handleMergeUp = useCallback((currentContent?: RichTextPayload) => {
    if (data.onMergeUp) {
      data.onMergeUp(id, currentContent)
    } else {
      dispatchEvent('block:mergeUp', { id, currentContent })
    }
  }, [data, dispatchEvent, id])

  const handleFocusPrev = useCallback(() => {
    if (data.onArrowUp) {
      data.onArrowUp(id)
    } else {
      dispatchEvent('block:arrowUp', { id })
    }
  }, [data, dispatchEvent, id])

  const handleFocusNext = useCallback(() => {
    if (data.onArrowDown) {
      data.onArrowDown(id)
    } else {
      dispatchEvent('block:arrowDown', { id })
    }
  }, [data, dispatchEvent, id])

  const handleTabPrev = useCallback(() => {
    if (data.onTabPrev) {
      data.onTabPrev(id)
    } else {
      dispatchEvent('block:tabPrev', { id })
    }
  }, [data, dispatchEvent, id])

  const handleTabNext = useCallback(() => {
    if (data.onTabNext) {
      data.onTabNext(id)
    } else {
      dispatchEvent('block:tabNext', { id })
    }
  }, [data, dispatchEvent, id])

  const handleDelete = useCallback(() => {
    if (data.onDelete) {
      data.onDelete(id)
    } else {
      dispatchEvent('block:delete', { id })
    }
  }, [data, dispatchEvent, id])

  return (
    <div className="notion-block-wrapper" style={{ width: '100%', position: 'relative' }}>
      {/* Debug coordinates - show absolute position */}
      {selected && (
        <div style={{
          position: 'absolute',
          top: '-18px',
          right: '0',
          fontSize: '9px',
          fontWeight: 'bold',
          color: '#666',
          backgroundColor: 'yellow',
          padding: '1px 3px',
          borderRadius: '2px',
          zIndex: 100,
          whiteSpace: 'nowrap',
        }}>
          abs: x: {Math.round(absolutePos.x)}, y: {Math.round(absolutePos.y)}
        </div>
      )}
      <div
        ref={blockRef}
        className={`notion-block ${isFocused ? 'focused' : ''} ${selected ? 'selected' : ''} ${
          data.stackId ? 'in-stack' : ''
        }`}
        style={{
          paddingLeft: '0px',
        }}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement
          if (isFocused && !target.closest('.drag-handle')) {
            event.stopPropagation()
          }
        }}
      >
        <button
          className="drag-handle"
          data-drag-handle
          disabled={isFocused}
          style={{
            position: 'absolute',
            left: '4px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>⋮⋮</span>
        </button>
        <TipTapEditor
          blockId={id}
          contentJson={data.contentJson}
          placeholder={data.placeholder}
          onContentUpdate={handleContentUpdate}
          createBlockBelow={handleAddBelow}
          createMultipleBlocksBelow={handleAddMultipleBelow}
          mergeBlockUp={handleMergeUp}
          focusPrevious={handleFocusPrev}
          focusNext={handleFocusNext}
          focusPreviousTab={handleTabPrev}
          focusNextTab={handleTabNext}
          deleteBlock={handleDelete}
          triggerSlashCommand={handleSlashCommand}
          focusRef={data.focusRef}
          onFocusChange={setIsFocused}
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
  if (JSON.stringify(pd.contentJson) !== JSON.stringify(nd.contentJson)) return false
  if (pd.stackId !== nd.stackId) return false
  if (pd.isBottomNode !== nd.isBottomNode) return false
  if (pd.height !== nd.height) return false
  // ignore function prop identity to avoid needless re-renders while dragging
  return true
}

export default React.memo(NotionBlock, areEqual)
