import { useCallback } from 'react'
import type { Node } from '@xyflow/react'
import {
  applyStackLayout,
  syncStackContainers,
} from '../logic/stackLayout'

export type UseStackLayoutOptions = {
  blockWidth: number
  gap: number
  headerHeight: number
}

export type UseStackLayoutResult = {
  applyLayout: (stackId: string, nodes: Node[]) => Node[]
  syncContainers: (nodes: Node[]) => Node[]
}

/**
 * Hook for managing stack layout calculations
 */
export function useStackLayout(options: UseStackLayoutOptions): UseStackLayoutResult {
  const { blockWidth, gap, headerHeight } = options

  const applyLayout = useCallback(
    (stackId: string, nodes: Node[]): Node[] => {
      return applyStackLayout(
        stackId,
        nodes,
        gap,
        blockWidth,
        headerHeight
      )
    },
    [gap, blockWidth, headerHeight]
  )

  const syncContainers = useCallback(
    (nodes: Node[]): Node[] => {
      return syncStackContainers(nodes, blockWidth, headerHeight)
    },
    [blockWidth, headerHeight]
  )

  return {
    applyLayout,
    syncContainers,
  }
}
