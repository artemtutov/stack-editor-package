import { useCallback, useMemo, useState, Suspense, lazy, useEffect } from 'react'
import { NodeResizeControl, Position, ResizeControlVariant } from '@xyflow/react'
import FullscreenModal from './FullscreenModal'
const LazyFullscreenStackEditor = lazy(() => import('./FullscreenStackEditor'))
import type { BlockData, RichTextPayload } from '../types'
import { ensureJsonContent, jsonToHtml, CURRENT_SCHEMA_VERSION } from '../editor/richText'
import { upgradeContentJson } from '../editor/upgrade'
import { sanitizeAndSave } from '../utils/sanitizeHTML'

type Props = {
  id: string
  data: {
    width?: number
    height?: number
    stackId?: string
    position?: { x: number; y: number }
    onResizeStart?: (containerId: string, side: 'left' | 'right') => void
    onResize?: (containerId: string, newWidth: number) => void
    onResizeEnd?: (containerId: string) => void
    getStackBlocks?: () => any[]
    replaceStackContent?: (stackId: string, blocks: Array<{ id?: string; content: RichTextPayload }>) => void
    registerStackExpand?: (stackId: string, openFn: () => void) => void
  }
  selected?: boolean
}

export default function StackContainer({ id, data, selected }: Props) {
  const { onResizeStart, onResize, onResizeEnd } = data
  const [fullscreenState, setFullscreenState] = useState<null | { stackId: string; blocks: Array<{ id: string; content: RichTextPayload }> }>(null)

  const handleOpenFullscreen = useCallback(() => {
    if (!data.getStackBlocks) return
    const nodes = data.getStackBlocks()
    if (!nodes?.length) return
    const ordered = nodes
      .filter((node: any) => node.type !== 'stackContainer')
      .sort((a: any, b: any) => (a.data?.insertionOrder ?? 0) - (b.data?.insertionOrder ?? 0))

    const stackId = data.stackId ?? (ordered[0]?.data?.stackId as string | undefined)
    if (!stackId) return

      const blocks = ordered.map((node: any) => {
        const blockData = node.data as BlockData
        const baseJson = ensureJsonContent(blockData.contentJson)
        const json = blockData.schemaVersion !== CURRENT_SCHEMA_VERSION
          ? ensureJsonContent(upgradeContentJson(baseJson, blockData.schemaVersion, CURRENT_SCHEMA_VERSION))
          : baseJson
        const html = sanitizeAndSave(blockData.cachedHTML ?? jsonToHtml(json))
        return {
          id: node.id as string,
          content: { json, html },
        }
      })

    setFullscreenState({ stackId, blocks })
  }, [data])

  const handleCancelFullscreen = useCallback(() => {
    setFullscreenState(null)
  }, [])

  const handleSaveFullscreen = useCallback(
    (blocksIn: Array<{ id?: string; content: RichTextPayload }>) => {
      if (!fullscreenState) return
      if (data.replaceStackContent && fullscreenState.stackId) {
        const results = data.replaceStackContent(fullscreenState.stackId, blocksIn)
        // Optionally surface minted IDs to host here via a callback prop.
        // console.debug('Fullscreen save results:', results)
      }
      setFullscreenState(null)
    },
    [data, fullscreenState]
  )

  // Register expand callback with the hook
  useEffect(() => {
    console.log('[StackContainer] useEffect - stackId:', data.stackId, 'registerStackExpand:', !!data.registerStackExpand);
    if (data.stackId && data.registerStackExpand) {
      console.log('[StackContainer] Registering expand callback for stackId:', data.stackId);
      data.registerStackExpand(data.stackId, handleOpenFullscreen)
    }
  }, [data.stackId, data.registerStackExpand, handleOpenFullscreen])

  return (
    <>
      <FullscreenModal isOpen={!!fullscreenState} onClose={handleCancelFullscreen} title="Stack">
        {fullscreenState && LazyFullscreenStackEditor ? (
          <Suspense fallback={<div style={{ padding: 24 }}>Loading editor…</div>}>
            <LazyFullscreenStackEditor
              isOpen
              blocks={fullscreenState.blocks}
              onCancel={handleCancelFullscreen}
              onSave={handleSaveFullscreen}
            />
          </Suspense>
        ) : null}
      </FullscreenModal>

      {/* Normal stack container view */}
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'white',
          border: selected ? '2px solid rgba(35, 131, 226, 1)' : '1px solid #d1d5db',
        borderRadius: 4,
        boxShadow: 'none',
        padding: 0,
        pointerEvents: 'auto',
        transition: 'box-shadow 0.2s, border 0.2s',
        cursor: 'grab',
        position: 'relative',
      }}
    >
      {/* Horizontal resize handles */}
      <NodeResizeControl
        position={Position.Left}
        variant={ResizeControlVariant.Line}
        color="orange"
        minWidth={250}
        maxWidth={600}
        onResizeStart={() => onResizeStart?.(id, 'left')}
        onResize={(_, params) => onResize?.(id, params.width)}
        onResizeEnd={() => onResizeEnd?.(id)}
      />
      <NodeResizeControl
        position={Position.Right}
        variant={ResizeControlVariant.Line}
        color="orange"
        minWidth={250}
        maxWidth={600}
        onResizeStart={() => onResizeStart?.(id, 'right')}
        onResize={(_, params) => onResize?.(id, params.width)}
        onResizeEnd={() => onResizeEnd?.(id)}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div
          className="stack-drag-handle"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: 1,
            pointerEvents: 'auto',
            cursor: 'grab',
            padding: '8px 8px 8px 10px',
            borderRadius: 3,
            transition: 'all 0.15s ease',
            userSelect: 'none',
          }}
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            // prevent text selection but let ReactFlow detect drag handle
            e.preventDefault()
            const el = e.currentTarget as HTMLElement
            el.style.cursor = 'grabbing'
          }}
          onMouseUp={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.cursor = 'grab'
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1, color: '#888', cursor: 'grab' }}>⋮⋮</span>
          <span
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: '#9ca3af',
              fontWeight: 500,
              cursor: 'grab',
            }}
          >
            STACK
          </span>
        </div>

        {/* Maximize button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleOpenFullscreen()
          }}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '4px',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '16px',
            marginRight: '8px',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={async (e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6'
            // Prefetch fullscreen editor chunk on intent
            try { await import('./FullscreenStackEditor' /* webpackPrefetch: true */) } catch {}
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="Maximize"
        >
          ⛶
        </button>
      </div>
      </div>
    </>
  )
}
