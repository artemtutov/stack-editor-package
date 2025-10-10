import { useCallback, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import {
  calculateDropIndicator,
  applyContainerDrag,
  applyGroupDrag,
  reorderStack,
  preserveStackTop,
  type DropInfo,
  type ContainerDragState,
} from '../logic/dragAndDrop'
import type { StackAnchors } from '../logic/stackLayout'
import { ensureInsertionOrder, calculateStackLayout } from '../logic/stackLayout'
import { assignBlockToStack } from '../logic/stackState'

export type UseStackDragOptions = {
  xTolerance: number
  blockWidth: number
  enableShiftGroupDrag: boolean
  stackAnchors: React.MutableRefObject<StackAnchors>
  gap: number
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
  const { xTolerance, blockWidth, enableShiftGroupDrag, stackAnchors, gap } = options

  const [dropIndicator, setDropIndicator] = useState({
    show: false,
    position: { x: 0, y: 0, width: 0 },
    targetStackId: null as null | string,
    insertionIndex: -1,
  })

  const dropInfoRef = useRef<DropInfo>(dropIndicator)
  const isDraggingStackRef = useRef(false)
  const dragStartStackIdRef = useRef<string | null>(null)
  const dragStartAnchorXRef = useRef(0)
  const stackTopOnDragStartRef = useRef<Record<string, number>>({})
  const stackTopIdOnDragStartRef = useRef<Record<string, string>>({})
  const containerDragStartRef = useRef<ContainerDragState | null>(null)

  const onNodeDragStart = useCallback(
    (_evt: React.MouseEvent, node: Node, nodesRef: React.MutableRefObject<Node[]>) => {
      // Container drag start
      if ((node as any).type === 'stackContainer') {
        const sid = (node as any).data?.stackId as string
        const orig: Record<string, { x: number; y: number }> = {}
        ;(nodesRef.current as any).forEach((n: any) => {
          if (n.type !== 'stackContainer' && n.data?.stackId === sid) {
            orig[n.id] = { x: n.position.x, y: n.position.y }
          }
        })
        containerDragStartRef.current = {
          pos: { x: node.position.x, y: node.position.y },
          stackId: sid,
          origPositions: orig,
        }
        isDraggingStackRef.current = true
        return
      }

      const all = nodesRef.current as any
      const stackId = (node as any)?.data?.stackId
      if (!stackId) return

      const stackNodes = all
        .filter((n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer')
        .sort((a: any, b: any) => a.position.y - b.position.y)

      if (stackNodes.length === 0) return

      const topY = stackNodes[0].position.y
      const topId = stackNodes[0].id
      stackTopOnDragStartRef.current[stackId] = topY
      stackTopIdOnDragStartRef.current[stackId] = topId
      dragStartStackIdRef.current = stackId
      dragStartAnchorXRef.current = stackAnchors.current[stackId]?.x ?? stackNodes[0].position.x
    },
    [stackAnchors]
  )

  const onNodeDrag = useCallback(
    (
      evt: React.MouseEvent,
      node: Node,
      nodesRef: React.MutableRefObject<Node[]>,
      setNodes: (updater: (nodes: Node[]) => Node[]) => void,
      viewportRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
    ) => {
      // Container drag
      if ((node as any).type === 'stackContainer' && containerDragStartRef.current) {
        setNodes((nds) => {
          const moved = applyContainerDrag(nds, node, containerDragStartRef.current!, stackAnchors.current)
          setDropIndicator({ show: false, position: { x: 0, y: 0, width: 0 }, targetStackId: null, insertionIndex: -1 })
          return moved
        })
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
        stackAnchors.current,
        dragStartStackIdRef.current,
        dragStartAnchorXRef.current,
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
    [xTolerance, blockWidth, enableShiftGroupDrag, stackAnchors]
  )

  const onNodeDragStop = useCallback(
    (
      _evt: React.MouseEvent,
      node: Node,
      setNodes: (updater: (nodes: Node[]) => Node[]) => void,
      updateBottomFlags: (nodes: Node[]) => Node[],
      syncContainers: (nodes: Node[]) => Node[]
    ) => {
      // Container drag stop
      if ((node as any).type === 'stackContainer' && containerDragStartRef.current) {
        const stackId = (node as any).data.stackId
        setNodes((nds) => {
          const stackBlocks = (nds as any)
            .filter((n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer')
            .sort((a: any, b: any) => a.position.y - b.position.y)

          if (stackBlocks.length > 0) {
            stackAnchors.current[stackId] = { x: stackBlocks[0].position.x, y: stackBlocks[0].position.y }
            const laidOut = calculateStackLayout(stackId, nds, stackAnchors.current, gap)
            return syncContainers(laidOut)
          }
          return nds
        })
        containerDragStartRef.current = null
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
              .sort((a: any, b: any) => a.position.y - b.position.y)

            if (remaining.length > 0) {
              updatedNodes = calculateStackLayout(oldStackId, updatedNodes, stackAnchors.current, gap)
              const initialTop = stackTopOnDragStartRef.current[oldStackId]
              const initialTopId = stackTopIdOnDragStartRef.current[oldStackId]

              if (typeof initialTop === 'number' && initialTopId) {
                updatedNodes = preserveStackTop(updatedNodes, oldStackId, initialTop, initialTopId)
              }
            }
          }

          // Handle new stack reorder
          if (!isGroupDrag && newStackId) {
            updatedNodes = ensureInsertionOrder(newStackId, updatedNodes)
            updatedNodes = reorderStack(updatedNodes, node.id, newStackId, dropInfo.insertionIndex)
            updatedNodes = calculateStackLayout(newStackId, updatedNodes, stackAnchors.current, gap)
          }

          // Handle group drag anchor update
          if (isGroupDrag && oldStackId) {
            const top = (updatedNodes as any)
              .filter((n: any) => n.data?.stackId === oldStackId && n.type !== 'stackContainer')
              .sort((a: any, b: any) => a.position.y - b.position.y)[0]

            if (top) {
              stackAnchors.current[oldStackId] = { x: top.position.x, y: top.position.y }
              updatedNodes = calculateStackLayout(oldStackId, updatedNodes, stackAnchors.current, gap)
            }
          }

          isDraggingStackRef.current = false
          dropInfoRef.current = { show: false, targetStackId: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 } }

          const final = updateBottomFlags(updatedNodes)
          return syncContainers(final)
        })
      })
    },
    [stackAnchors, gap]
  )

  return {
    dropIndicator,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  }
}
