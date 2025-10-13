import { createPortal } from 'react-dom'

export type FullscreenModalProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export default function FullscreenModal({ isOpen, onClose, children }: FullscreenModalProps) {
  if (!isOpen) return null

  const fullscreen = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#ffffff',
        zIndex: 9999,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )

  return createPortal(fullscreen, document.body)
}
