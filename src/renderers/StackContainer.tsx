type Props = {
  data: { width?: number; height?: number; stackId?: string }
  selected?: boolean
}

export default function StackContainer({ data, selected }: Props) {
  return (
    <div
      style={{
        width: data.width || 200,
        height: data.height || 100,
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
