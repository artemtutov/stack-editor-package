import { useCallback, useRef } from 'react'
import type { Node } from '@xyflow/react'
import {
  applyStackLayout,
  syncStackContainers,
  type StackAnchors,
} from '../logic/stackLayout'

export type UseStackLayoutOptions = {
  blockWidth: number
  gap: number
  headerHeight: number
}

export type UseStackLayoutResult = {
  stackAnchors: React.MutableRefObject<StackAnchors>
  applyLayout: (stackId: string, nodes: Node[]) => Node[]
  syncContainers: (nodes: Node[]) => Node[]
}

/**
 * Hook for managing stack layout calculations
 */
export function useStackLayout(options: UseStackLayoutOptions): UseStackLayoutResult {
  const { blockWidth, gap, headerHeight } = options
  const stackAnchorsRef = useRef<StackAnchors>({})

  const applyLayout = useCallback(
    (stackId: string, nodes: Node[]): Node[] => {
      return applyStackLayout(
        stackId,
        nodes,
        stackAnchorsRef.current,
        gap,
        blockWidth,
        headerHeight
      )
    },
    [gap, blockWidth, headerHeight]
  )

  const syncContainers = useCallback(
    (nodes: Node[]): Node[] => {
      return syncStackContainers(nodes, stackAnchorsRef.current, blockWidth, headerHeight)
    },
    [blockWidth, headerHeight]
  )

  return {
    stackAnchors: stackAnchorsRef,
    applyLayout,
    syncContainers,
  }
}
