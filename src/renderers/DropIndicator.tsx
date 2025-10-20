type Props = { position: { x: number; y: number; width: number }; show: boolean }

export default function DropIndicator({ position, show }: Props) {
  if (!show) return null
  return (
    <div
      className="drop-indicator"
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  )
}

