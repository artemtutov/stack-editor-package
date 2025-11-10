import { createPortal } from 'react-dom'

export type FullscreenModalProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  isSidebarOpen?: boolean
}

export default function FullscreenModal({ isOpen, onClose, children, isSidebarOpen }: FullscreenModalProps) {
  if (!isOpen) return null

  const fullscreen = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: isSidebarOpen ? '300px' : 0,
        right: 0,
        bottom: 0,
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
