import { create } from 'zustand'

type ResizeState = {
  side: 'left' | 'right'
  startWidth: number
  dx: number
}

type LiveResizeStore = {
  // containerId -> resize state
  resizing: Map<string, ResizeState>

  startResize: (containerId: string, side: 'left' | 'right', startWidth: number) => void
  updateDx: (containerId: string, dx: number) => void
  endResize: (containerId: string) => void
  getState: (containerId: string) => ResizeState | undefined
}

export const useLiveResize = create<LiveResizeStore>((set, get) => ({
  resizing: new Map(),

  startResize: (containerId, side, startWidth) => {
    set((state) => {
      const newMap = new Map(state.resizing)
      newMap.set(containerId, { side, startWidth, dx: 0 })
      return { resizing: newMap }
    })
  },

  updateDx: (containerId, dx) => {
    set((state) => {
      const newMap = new Map(state.resizing)
      const current = newMap.get(containerId)
      if (current) {
        newMap.set(containerId, { ...current, dx })
      }
      return { resizing: newMap }
    })
  },

  endResize: (containerId) => {
    set((state) => {
      const newMap = new Map(state.resizing)
      newMap.delete(containerId)
      return { resizing: newMap }
    })
  },

  getState: (containerId) => {
    return get().resizing.get(containerId)
  },
}))
