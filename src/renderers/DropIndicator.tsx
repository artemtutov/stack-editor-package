type Props = {
  position: { x: number; y: number; width: number }
  canvasPosition: { x: number; y: number }
  show: boolean
}

export default function DropIndicator({ position, canvasPosition, show }: Props) {
  if (!show) return null
  return (
    <div
      className="drop-indicator"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div style={{
        position: 'absolute',
        top: '-20px',
        left: '0',
        fontSize: '10px',
        fontWeight: 'bold',
        color: 'rgb(35, 131, 226)',
        backgroundColor: 'white',
        padding: '2px 4px',
        borderRadius: '2px',
        whiteSpace: 'nowrap',
      }}>
        x: {Math.round(canvasPosition.x)}, y: {Math.round(canvasPosition.y)}
      </div>
    </div>
  )
}

