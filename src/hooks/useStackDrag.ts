import { useCallback, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import {
  calculateDropIndicator,
  applyGroupDrag,
  reorderStack,
  type DropInfo,
} from '../logic/dragAndDrop'
import { ensureInsertionOrder, calculateStackLayout } from '../logic/stackLayout'
import { assignBlockToStack, nextStackId } from '../logic/stackState'
import type { ChangeEvent } from '../types'

export type UseStackDragOptions = {
  xTolerance: number
  blockWidth: number
  enableShiftGroupDrag: boolean
  enableAutoGrouping: boolean
  groupNodeTypes: string[]
  gap: number
  headerHeight: number
  emitChange: (event: ChangeEvent) => void
}

export type UseStackDragResult = {
  dropIndicator: {
    show: boolean
    position: { x: number; y: number; width: number }
    canvasPosition: { x: number; y: number }
    targetStackId: string | null
    insertionIndex: number
  }
  onNodeDragStart: (evt: React.MouseEvent | React.TouchEvent, node: Node, nodesRef: React.MutableRefObject<Node[]>) => void
  onNodeDrag: (
    evt: React.MouseEvent | React.TouchEvent,
    node: Node,
    nodesRef: React.MutableRefObject<Node[]>,
    setNodes: (updater: (nodes: Node[]) => Node[]) => void,
    flowToScreenPosition: (position: { x: number; y: number }) => { x: number; y: number },
    zoom: number
  ) => void
  onNodeDragStop: (
    evt: React.MouseEvent | React.TouchEvent,
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
  const { xTolerance, blockWidth, enableShiftGroupDrag, enableAutoGrouping, groupNodeTypes, gap, headerHeight, emitChange } = options

  const [dropIndicator, setDropIndicator] = useState({
    show: false,
    position: { x: 0, y: 0, width: 0 },
    canvasPosition: { x: 0, y: 0 },
    targetStackId: null as null | string,
    insertionIndex: -1,
  })

  type IndicatorState = {
    show: boolean
    position: { x: number; y: number; width: number }
    canvasPosition: { x: number; y: number }
    targetStackId: string | null
    insertionIndex: number
  }

  const indicatorStateRef = useRef<IndicatorState>(dropIndicator)
  const pendingIndicatorRef = useRef<IndicatorState | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const INDICATOR_EPS = 0.5

  const shouldUpdateIndicator = (prev: IndicatorState, next: IndicatorState) => {
    if (prev.show !== next.show) return true
    if (prev.targetStackId !== next.targetStackId) return true
    if (prev.insertionIndex !== next.insertionIndex) return true
    if (Math.abs(prev.position.x - next.position.x) > INDICATOR_EPS) return true
    if (Math.abs(prev.position.y - next.position.y) > INDICATOR_EPS) return true
    if (Math.abs(prev.position.width - next.position.width) > 1) return true
    return false
  }

  const scheduleIndicatorUpdate = (next: IndicatorState, immediate = false) => {
    const prev = indicatorStateRef.current
    if (!shouldUpdateIndicator(prev, next) && !immediate) return

    if (immediate) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      indicatorStateRef.current = next
      setDropIndicator(next)
      return
    }

    pendingIndicatorRef.current = next
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const candidate = pendingIndicatorRef.current
        if (!candidate) return
        pendingIndicatorRef.current = null
        if (shouldUpdateIndicator(indicatorStateRef.current, candidate)) {
          indicatorStateRef.current = candidate
          setDropIndicator(candidate)
        }
      })
    }
  }

  const dropInfoRef = useRef<DropInfo>({ ...dropIndicator, targetType: null })
  const isDraggingStackRef = useRef(false)
  const dragStartStackIdRef = useRef<string | null>(null)

  const onNodeDragStart = useCallback(
    (_evt: React.MouseEvent | React.TouchEvent, node: Node, nodesRef: React.MutableRefObject<Node[]>) => {
      // Skip container drag - ReactFlow handles it automatically
      if ((node as any).type === 'stackContainer') {
        isDraggingStackRef.current = true
        return
      }

      const stackId = (node as any)?.data?.stackId
      if (stackId) {
        dragStartStackIdRef.current = stackId
      }

      // NOTE: Extent constraint removal is now handled by useStackEditor
      // to avoid double-handling. The stack editor will remove extent
      // constraints before calling this handler.
    },
    []
  )

  const onNodeDrag = useCallback(
    (
      evt: React.MouseEvent | React.TouchEvent,
      node: Node,
      nodesRef: React.MutableRefObject<Node[]>,
      setNodes: (updater: (nodes: Node[]) => Node[]) => void,
      flowToScreenPosition: (position: { x: number; y: number }) => { x: number; y: number },
      zoom: number
    ) => {
      // Skip container drag - ReactFlow handles it
      if ((node as any).type === 'stackContainer') {
        scheduleIndicatorUpdate({ show: false, position: { x: 0, y: 0, width: 0 }, canvasPosition: { x: 0, y: 0 }, targetStackId: null, insertionIndex: -1 })
        return
      }

      const stackId = (node as any).data.stackId
      if (stackId && evt.shiftKey && enableShiftGroupDrag) {
        setNodes((nds) => {
          const currentNode = nds.find((n) => n.id === node.id)
          if (!currentNode) return nds

          isDraggingStackRef.current = true
          const moved = applyGroupDrag(nds, node, currentNode, stackId)
          scheduleIndicatorUpdate({ show: false, position: { x: 0, y: 0, width: 0 }, canvasPosition: { x: 0, y: 0 }, targetStackId: null, insertionIndex: -1 })
          return moved
        })
        return
      }

      const dropInfo = calculateDropIndicator(
        node,
        nodesRef.current,
        dragStartStackIdRef.current,
        flowToScreenPosition,
        zoom,
        xTolerance,
        blockWidth,
        headerHeight
      )

      dropInfoRef.current = dropInfo
      scheduleIndicatorUpdate({
        show: dropInfo.show,
        position: dropInfo.position,
        canvasPosition: dropInfo.canvasPosition,
        targetStackId: dropInfo.targetStackId,
        insertionIndex: dropInfo.insertionIndex,
      })
    },
    [xTolerance, blockWidth, enableShiftGroupDrag]
  )

  const onNodeDragStop = useCallback(
    (
      _evt: React.MouseEvent | React.TouchEvent,
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

      scheduleIndicatorUpdate({ show: false, position: { x: 0, y: 0, width: 0 }, canvasPosition: { x: 0, y: 0 }, targetStackId: null, insertionIndex: -1 }, true)

      // Capture stack IDs for event emission
      let capturedOldStackId: string | undefined
      let capturedNewStackId: string | undefined
      let capturedCanonicalName: string | undefined

      requestAnimationFrame(() => {
        setNodes((nds) => {
          const oldNode = nds.find((n) => n.id === node.id) as any
          const oldStackId = oldNode?.data?.stackId as string | undefined
          const isGroupDrag = isDraggingStackRef.current
          const dropInfo = dropInfoRef.current || { show: false, targetStackId: null, insertionIndex: -1, targetType: null }

          // Capture for event emission
          capturedOldStackId = oldStackId
          capturedCanonicalName = oldNode?.data?.canonicalName

          // Handle solo block attachment - create a new stack
          if (!isGroupDrag && dropInfo.show && dropInfo.targetType === 'solo' && dropInfo.targetNodeId) {
            const targetNode = nds.find((n) => n.id === dropInfo.targetNodeId) as any
            if (targetNode && !targetNode.data?.stackId) {
              const newStackId = nextStackId(nds)

              // Capture new stack ID for event emission
              capturedNewStackId = newStackId

              // Position dragged node at target's location if it's from a stack or if target is grouped
              let updatedNodes = nds
              const isOldNodeInStack = oldNode.parentId && nds.find(n => n.id === oldNode.parentId)?.type === 'stackContainer'

              // Always position dragged node at target if it's from a stack (to use target's absolute position)
              // OR assign to same group parent if target is grouped
              if (isOldNodeInStack || targetNode.parentId) {
                updatedNodes = nds.map(n =>
                  n.id === node.id
                    ? {
                        ...n,
                        parentId: targetNode.parentId, // undefined if target not grouped
                        extent: targetNode.parentId ? ('parent' as const) : undefined,
                        position: { x: targetNode.position.x, y: targetNode.position.y }
                      }
                    : n
                )
              }

              // Assign both blocks to the new stack
              updatedNodes = assignBlockToStack(node.id, newStackId, updatedNodes)
              updatedNodes = assignBlockToStack(dropInfo.targetNodeId, newStackId, updatedNodes)

              // Determine insertion order based on Y position
              const draggedAbsY = oldNode.position.y
              const targetAbsY = targetNode.position.y
              const draggedFirst = draggedAbsY < targetAbsY

              updatedNodes = updatedNodes.map((n: any) => {
                if (n.id === node.id) {
                  return { ...n, data: { ...n.data, insertionOrder: draggedFirst ? 0 : 1 } }
                }
                if (n.id === dropInfo.targetNodeId) {
                  return { ...n, data: { ...n.data, insertionOrder: draggedFirst ? 1 : 0 } }
                }
                return n
              })

              // Handle old stack cleanup if dragged block was in a stack
              if (oldStackId) {
                const remaining = updatedNodes.filter((n: any) => n.data?.stackId === oldStackId && n.type !== 'stackContainer')
                if (remaining.length > 0) {
                  updatedNodes = syncContainers(updatedNodes)
                  updatedNodes = calculateStackLayout(oldStackId, updatedNodes, gap, headerHeight)
                }
              }

              // Apply layout to new stack
              updatedNodes = syncContainers(updatedNodes)
              updatedNodes = calculateStackLayout(newStackId, updatedNodes, gap, headerHeight)

              isDraggingStackRef.current = false
              dropInfoRef.current = { show: false, targetStackId: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 }, canvasPosition: { x: 0, y: 0 }, targetType: null }

              const final = updateBottomFlags(updatedNodes)
              return syncContainers(final)
            }
          }

          const newStackId = isGroupDrag ? oldStackId : dropInfo.show ? (dropInfo.targetStackId as string) : undefined

          // Capture new stack ID for event emission
          capturedNewStackId = newStackId

          let updatedNodes = assignBlockToStack(node.id, newStackId, nds)

          // Handle old stack cleanup
          if (oldStackId && oldStackId !== newStackId) {
            const remaining = (updatedNodes as any)
              .filter((n: any) => n.data.stackId === oldStackId && n.type !== 'stackContainer')

            if (remaining.length > 0) {
              updatedNodes = syncContainers(updatedNodes)
              updatedNodes = calculateStackLayout(oldStackId, updatedNodes, gap, headerHeight)
            }
          }

          // Handle new stack reorder
          if (!isGroupDrag && newStackId) {
            updatedNodes = ensureInsertionOrder(newStackId, updatedNodes)
            updatedNodes = reorderStack(updatedNodes, node.id, newStackId, dropInfo.insertionIndex)
            updatedNodes = syncContainers(updatedNodes)
            updatedNodes = calculateStackLayout(newStackId, updatedNodes, gap, headerHeight)
          }

          // Handle group drag - just recalculate layout
          if (isGroupDrag && oldStackId) {
            updatedNodes = syncContainers(updatedNodes)
            updatedNodes = calculateStackLayout(oldStackId, updatedNodes, gap, headerHeight)
          }

          isDraggingStackRef.current = false
          dropInfoRef.current = { show: false, targetStackId: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 }, canvasPosition: { x: 0, y: 0 }, targetType: null }

          const final = updateBottomFlags(updatedNodes)
          return syncContainers(final)
        })

        // Emit block.move.end event after drag completes
        if (capturedCanonicalName && (capturedNewStackId || capturedOldStackId)) {
          emitChange({
            type: 'block.move.end',
            blockId: node.id,
            canonicalName: capturedCanonicalName,
          })
        }
      })
    },
    [gap, headerHeight, emitChange]
  )

  return {
    dropIndicator,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  }
}
