import { useCallback, useEffect, useRef } from 'react'
import type { Node } from '@xyflow/react'
import {
  getNextBlockInStack,
  getPreviousBlockInStack,
  getPreviousBlockByY,
  getNextBlockByY,
  isLastInStack,
} from '../logic/stackState'
import type { NodeRefsMap } from './useBlockOperations'
import type { RichTextPayload } from '../types'

export type UseKeyboardNavOptions = {
  nodesRef: React.MutableRefObject<Node[]>
  nodeRefsMap: React.MutableRefObject<NodeRefsMap>
  addBelow: (nodeId: string, initialContent?: RichTextPayload) => void
}

export type UseKeyboardNavResult = {
  handleTabNext: (currentId: string) => void
  handleTabPrev: (currentId: string) => void
  handleArrowUp: (currentId: string) => void
  handleArrowDown: (currentId: string) => void
}

/**
 * Hook for managing keyboard navigation between blocks
 */
export function useKeyboardNav(options: UseKeyboardNavOptions): UseKeyboardNavResult {
  const { nodesRef, nodeRefsMap, addBelow } = options

  const handleTabNext = useCallback(
    (currentId: string) => {
      const all = nodesRef.current as any
      const node = all.find((n: any) => n.id === currentId)
      if (!node) return

      const sid = node.data?.stackId
      if (!sid) {
        // Solo → start a stack and add below
        addBelow(currentId)
        return
      }

      if (isLastInStack(currentId, all)) {
        // At end → append
        addBelow(currentId)
        return
      }

      // Focus next
      const next = getNextBlockInStack(currentId, all)
      if (next) {
        setTimeout(() => nodeRefsMap.current[next.id]?.current?.focus?.(), 0)
      }
    },
    [nodesRef, nodeRefsMap, addBelow]
  )

  const handleTabPrev = useCallback(
    (currentId: string) => {
      const all = nodesRef.current as any
      const node = all.find((n: any) => n.id === currentId)
      if (!node) return

      const sid = node.data?.stackId
      if (!sid) return

      const blocks = all
        .filter((n: any) => n.data?.stackId === sid && n.type !== 'stackContainer')
        .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))

      const idx = blocks.findIndex((b: any) => b.id === currentId)
      if (idx > 0) {
        const prev = blocks[idx - 1]
        setTimeout(() => nodeRefsMap.current[prev.id]?.current?.focus?.(), 0)
      }
    },
    [nodesRef, nodeRefsMap]
  )

  const handleArrowUp = useCallback(
    (currentId: string) => {
      const all = nodesRef.current as any
      const node = all.find((n: any) => n.id === currentId)
      if (!node) return

      // Try previous block in stack first
      let prev = getPreviousBlockInStack(currentId, all)
      // Fallback to previous by Y position
      if (!prev) prev = getPreviousBlockByY(currentId, all)

      if (prev) {
        setTimeout(() => nodeRefsMap.current[prev.id]?.current?.focus?.(), 0)
      }
    },
    [nodesRef, nodeRefsMap]
  )

  const handleArrowDown = useCallback(
    (currentId: string) => {
      const all = nodesRef.current as any
      const node = all.find((n: any) => n.id === currentId)
      if (!node) return

      // Try next block in stack first
      let next = getNextBlockInStack(currentId, all)
      // Fallback to next by Y position
      if (!next) next = getNextBlockByY(currentId, all)

      if (next) {
        setTimeout(() => nodeRefsMap.current[next.id]?.current?.focus?.(), 0)
      }
    },
    [nodesRef, nodeRefsMap]
  )

  return {
    handleTabNext,
    handleTabPrev,
    handleArrowUp,
    handleArrowDown,
  }
}

/**
 * Hook for exposing tab handlers via ref (used internally)
 */
export function useTabHandlers(handlers: UseKeyboardNavResult) {
  const tabHandlers = useRef<{ handleTabNext?: (id: string) => void; handleTabPrev?: (id: string) => void }>({})

  useEffect(() => {
    tabHandlers.current.handleTabNext = handlers.handleTabNext
    tabHandlers.current.handleTabPrev = handlers.handleTabPrev
  }, [handlers.handleTabNext, handlers.handleTabPrev])

  return tabHandlers
}
