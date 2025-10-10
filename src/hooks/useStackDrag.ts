import { useCallback, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import {
  calculateDropIndicator,
  applyGroupDrag,
  reorderStack,
  type DropInfo,
} from '../logic/dragAndDrop'
import { ensureInsertionOrder, calculateStackLayout } from '../logic/stackLayout'
import { assignBlockToStack } from '../logic/stackState'

export type UseStackDragOptions = {
  xTolerance: number
  blockWidth: number
  enableShiftGroupDrag: boolean
  gap: number
  headerHeight: number
}

export type UseStackDragResult = {
  dropIndicator: {
    show: boolean
    position: { x: number; y: number; width: number }
    targetStackId: string | null
    insertionIndex: number
  }
  onNodeDragStart: (evt: React.MouseEvent, node: Node, nodesRef: React.MutableRefObject<Node[]>) => void
  onNodeDrag: (
    evt: React.MouseEvent,
    node: Node,
    nodesRef: React.MutableRefObject<Node[]>,
    setNodes: (updater: (nodes: Node[]) => Node[]) => void,
    viewportRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  ) => void
  onNodeDragStop: (
    evt: React.MouseEvent,
    node: Node,
    setNodes: (updater: (nodes: Node[]) => Node[]) => void,
    updateBottomFlags: (nodes: Node[]) => Node[],
    syncContainers: (nodes: Node[]) => Node[]
  ) => void
}

/**
 * Hook for managing drag and drop behavior
 */
export function useStackDrag(options: UseStackDragOptions): UseStackDragResult {
  const { xTolerance, blockWidth, enableShiftGroupDrag, gap, headerHeight } = options

  const [dropIndicator, setDropIndicator] = useState({
    show: false,
    position: { x: 0, y: 0, width: 0 },
    targetStackId: null as null | string,
    insertionIndex: -1,
  })

  const dropInfoRef = useRef<DropInfo>(dropIndicator)
  const isDraggingStackRef = useRef(false)
  const dragStartStackIdRef = useRef<string | null>(null)

  const onNodeDragStart = useCallback(
    (_evt: React.MouseEvent, node: Node, nodesRef: React.MutableRefObject<Node[]>) => {
      // Skip container drag - ReactFlow handles it automatically
      if ((node as any).type === 'stackContainer') {
        isDraggingStackRef.current = true
        return
      }

      const stackId = (node as any)?.data?.stackId
      if (!stackId) return

      dragStartStackIdRef.current = stackId
    },
    []
  )

  const onNodeDrag = useCallback(
    (
      evt: React.MouseEvent,
      node: Node,
      nodesRef: React.MutableRefObject<Node[]>,
      setNodes: (updater: (nodes: Node[]) => Node[]) => void,
      viewportRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
    ) => {
      // Skip container drag - ReactFlow handles it
      if ((node as any).type === 'stackContainer') {
        setDropIndicator({ show: false, position: { x: 0, y: 0, width: 0 }, targetStackId: null, insertionIndex: -1 })
        return
      }

      const stackId = (node as any).data.stackId
      if (stackId && evt.shiftKey && enableShiftGroupDrag) {
        setNodes((nds) => {
          const currentNode = nds.find((n) => n.id === node.id)
          if (!currentNode) return nds

          isDraggingStackRef.current = true
          const moved = applyGroupDrag(nds, node, currentNode, stackId)
          setDropIndicator({ show: false, position: { x: 0, y: 0, width: 0 }, targetStackId: null, insertionIndex: -1 })
          return moved
        })
        return
      }

      const dropInfo = calculateDropIndicator(
        node,
        nodesRef.current,
        dragStartStackIdRef.current,
        viewportRef.current,
        xTolerance,
        blockWidth
      )

      dropInfoRef.current = dropInfo
      setDropIndicator({
        show: dropInfo.show,
        position: dropInfo.position,
        targetStackId: dropInfo.targetStackId,
        insertionIndex: dropInfo.insertionIndex,
      })
    },
    [xTolerance, blockWidth, enableShiftGroupDrag]
  )

  const onNodeDragStop = useCallback(
    (
      _evt: React.MouseEvent,
      node: Node,
      setNodes: (updater: (nodes: Node[]) => Node[]) => void,
      updateBottomFlags: (nodes: Node[]) => Node[],
      syncContainers: (nodes: Node[]) => Node[]
    ) => {
      // Skip container drag stop - ReactFlow handles it
      if ((node as any).type === 'stackContainer') {
        isDraggingStackRef.current = false
        return
      }

      setDropIndicator({ show: false, position: { x: 0, y: 0, width: 0 }, targetStackId: null, insertionIndex: -1 })

      requestAnimationFrame(() => {
        setNodes((nds) => {
          const oldNode = nds.find((n) => n.id === node.id) as any
          const oldStackId = oldNode?.data?.stackId as string | undefined
          const isGroupDrag = isDraggingStackRef.current
          const dropInfo = dropInfoRef.current || { show: false, targetStackId: null, insertionIndex: -1 }
          const newStackId = isGroupDrag ? oldStackId : dropInfo.show ? (dropInfo.targetStackId as string) : undefined

          let updatedNodes = assignBlockToStack(node.id, newStackId, nds)

          // Handle old stack cleanup
          if (oldStackId && oldStackId !== newStackId) {
            const remaining = (updatedNodes as any)
              .filter((n: any) => n.data.stackId === oldStackId && n.type !== 'stackContainer')

            if (remaining.length > 0) {
              updatedNodes = calculateStackLayout(oldStackId, updatedNodes, gap, headerHeight)
            }
          }

          // Handle new stack reorder
          if (!isGroupDrag && newStackId) {
            updatedNodes = ensureInsertionOrder(newStackId, updatedNodes)
            updatedNodes = reorderStack(updatedNodes, node.id, newStackId, dropInfo.insertionIndex)
            updatedNodes = calculateStackLayout(newStackId, updatedNodes, gap, headerHeight)
          }

          // Handle group drag - just recalculate layout
          if (isGroupDrag && oldStackId) {
            updatedNodes = calculateStackLayout(oldStackId, updatedNodes, gap, headerHeight)
          }

          isDraggingStackRef.current = false
          dropInfoRef.current = { show: false, targetStackId: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 } }

          const final = updateBottomFlags(updatedNodes)
          return syncContainers(final)
        })
      })
    },
    [gap, headerHeight]
  )

  return {
    dropIndicator,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  }
}
