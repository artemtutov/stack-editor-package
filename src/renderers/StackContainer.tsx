import { NodeResizeControl, Position } from '@xyflow/react'

type Props = {
  id: string
  data: {
    width?: number
    height?: number
    stackId?: string
    onResizeStart?: (containerId: string, side: 'left' | 'right') => void
    onResizeEnd?: (containerId: string) => void
  }
  selected?: boolean
}

export default function StackContainer({ id, data, selected }: Props) {
  const { onResizeStart, onResizeEnd } = data

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'white',
        border: selected ? '2px solid rgba(35, 131, 226, 1)' : '1px solid #d1d5db',
        borderRadius: 4,
        boxShadow: 'none',
        padding: '8px 4px',
        pointerEvents: 'auto',
        transition: 'box-shadow 0.2s, border 0.2s',
        cursor: 'grab',
      }}
    >
      {/* Horizontal resize handles */}
      <NodeResizeControl
        position={Position.Left}
        minWidth={200}
        maxWidth={600}
        onResizeStart={() => onResizeStart?.(id, 'left')}
        onResizeEnd={() => onResizeEnd?.(id)}
        style={{
          background: 'transparent',
          width: '8px',
          height: '100%',
          cursor: 'ew-resize',
          borderRadius: '4px',
        }}
      />
      <NodeResizeControl
        position={Position.Right}
        minWidth={200}
        maxWidth={600}
        onResizeStart={() => onResizeStart?.(id, 'right')}
        onResizeEnd={() => onResizeEnd?.(id)}
        style={{
          background: 'transparent',
          width: '8px',
          height: '100%',
          cursor: 'ew-resize',
          borderRadius: '4px',
        }}
      />
      <div
        className="stack-drag-handle"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: 0.7,
          pointerEvents: 'auto',
          cursor: 'grab',
          padding: '2px 4px',
          borderRadius: 3,
          transition: 'all 0.15s ease',
          userSelect: 'none',
        }}
        role="button"
        tabIndex={-1}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.opacity = '1'
          el.style.backgroundColor = 'rgba(0,0,0,0.05)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.opacity = '0.7'
          el.style.backgroundColor = 'transparent'
        }}
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
