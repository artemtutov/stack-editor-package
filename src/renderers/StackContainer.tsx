import { NodeResizeControl, Position, ResizeControlVariant } from '@xyflow/react'

type Props = {
  id: string
  data: {
    width?: number
    height?: number
    stackId?: string
    onResizeStart?: (containerId: string, side: 'left' | 'right') => void
    onResize?: (containerId: string, newWidth: number) => void
    onResizeEnd?: (containerId: string) => void
  }
  selected?: boolean
}

export default function StackContainer({ id, data, selected }: Props) {
  const { onResizeStart, onResize, onResizeEnd } = data

  return (
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
      }}
    >
      {/* Horizontal resize handles */}
      <NodeResizeControl
        position={Position.Left}
        variant={ResizeControlVariant.Line}
        color="orange"
        minWidth={200}
        maxWidth={600}
        onResizeStart={() => onResizeStart?.(id, 'left')}
        onResize={(_, params) => onResize?.(id, params.width)}
        onResizeEnd={() => onResizeEnd?.(id)}
      />
      <NodeResizeControl
        position={Position.Right}
        variant={ResizeControlVariant.Line}
        color="orange"
        minWidth={200}
        maxWidth={600}
        onResizeStart={() => onResizeStart?.(id, 'right')}
        onResize={(_, params) => onResize?.(id, params.width)}
        onResizeEnd={() => onResizeEnd?.(id)}
      />
      <div
        className="stack-drag-handle"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: 1,
          pointerEvents: 'auto',
          cursor: 'grab',
          padding: '8px',
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
        <span style={{ fontSize: 10, lineHeight: 1, color: '#888' }}>⋮⋮</span>
        <span
          style={{
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: '#666',
            fontWeight: 500,
          }}
        >
          STACK
        </span>
      </div>
    </div>
  )
}
