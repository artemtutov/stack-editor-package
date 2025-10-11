import { useCallback } from 'react'
import type { Node } from '@xyflow/react'
import type { BlockData } from '../types'
import {
  nextBlockId,
  nextStackId,
  findFocusTargetAfterDelete,
  removeBlock,
  getPreviousBlockInStack,
  getPreviousBlockByY,
} from '../logic/stackState'
import { ensureInsertionOrder } from '../logic/stackLayout'

export type BlockCallbacks = {
  onChange: (text: string) => void
  onAdd: () => void
  onHeightChange: (id: string, height: number) => void
  onTabNext: (id: string) => void
  onTabPrev: (id: string) => void
  onArrowUp: (id: string) => void
  onArrowDown: (id: string) => void
  onSlashCommand: (id: string, rect?: DOMRect | null) => void
  onDelete: (id: string) => void
  onSplit: (id: string, before: string, after: string) => void
  onMergeUp: (id: string) => void
}

export type NodeRefsMap = Record<
  string,
  { current: null | { focus: () => void; setCaretAt?: (pos: number) => void } }
>

export type UseBlockOperationsOptions = {
  nodeRefsMap: React.MutableRefObject<NodeRefsMap>
  nodesRef: React.MutableRefObject<Node[]>
  applyLayout: (stackId: string, nodes: Node[]) => Node[]
  syncContainers: (nodes: Node[]) => Node[]
  handleHeightChange: (nodeId: string, newHeight: number) => void
  handleSlashCommand: (nodeId: string, rectFromChild?: DOMRect | null) => void
  tabHandlersRef: React.MutableRefObject<{ handleTabNext?: (id: string) => void; handleTabPrev?: (id: string) => void; handleArrowUp?: (id: string) => void; handleArrowDown?: (id: string) => void }>
  gap: number
  blockWidth: number
  headerHeight: number
}

export type UseBlockOperationsResult = {
  handleDelete: (nodeId: string) => void
  handleMergeUp: (nodeId: string) => void
  addBelow: (currentNodeId: string) => void
  handleSplit: (nodeId: string, before: string, after: string) => void
  createBlockCallbacks: (nodeId: string, stackId: string, setNodes: any) => Partial<BlockCallbacks>
}

/**
 * Hook for managing block CRUD operations
 */
export function useBlockOperations(
  options: UseBlockOperationsOptions,
  setNodes: (updater: (nodes: Node[]) => Node[]) => void
): UseBlockOperationsResult {
  const {
    nodeRefsMap,
    nodesRef,
    applyLayout,
    syncContainers,
    handleHeightChange,
    handleSlashCommand,
    tabHandlersRef,
    gap,
    blockWidth,
    headerHeight,
  } = options

  const handleDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const focusId = findFocusTargetAfterDelete(nodeId, nds)
        const node = nds.find((n) => n.id === nodeId) as any
        const stackId = node?.data?.stackId as string | undefined

        let updated = removeBlock(nodeId, nds)

        if (stackId) {
          updated = ensureInsertionOrder(stackId, updated)
          updated = applyLayout(stackId, updated)
        } else {
          updated = syncContainers(updated)
        }

        if (focusId) {
          setTimeout(() => nodeRefsMap.current[focusId]?.current?.focus?.(), 50)
        }
        return updated
      })
    },
    [setNodes, nodeRefsMap, applyLayout, syncContainers]
  )

  const handleMergeUp = useCallback(
    (nodeId: string) => {
      const currentNodes = nodesRef.current as any
      const current = currentNodes.find((n: any) => n.id === nodeId)
      if (!current) return

      const sid = current.data?.stackId
      let prev: any | null = getPreviousBlockInStack(nodeId, currentNodes)
      if (!prev) prev = getPreviousBlockByY(nodeId, currentNodes)
      if (!prev) return

      const prevId = prev.id as string
      const currText = current.data?.text ?? ''
      const prevText = prev.data?.text ?? ''
      const merged = prevText + currText

      setNodes((nds) => {
        let updated = (nds as any).map((n: any) =>
          n.id === prevId ? { ...n, data: { ...n.data, text: merged } } : n
        )
        updated = removeBlock(nodeId, updated)

        if (sid) {
          updated = ensureInsertionOrder(sid, updated)
          updated = applyLayout(sid, updated)
        } else {
          updated = syncContainers(updated)
        }

        return updated
      })

      setTimeout(() => {
        const caretPos = (prevText as string).length
        if (nodeRefsMap.current[prevId]?.current?.setCaretAt) {
          nodeRefsMap.current[prevId].current.setCaretAt(caretPos)
        } else {
          nodeRefsMap.current[prevId]?.current?.focus?.()
        }
      }, 50)
    },
    [nodesRef, setNodes, nodeRefsMap, applyLayout, syncContainers]
  )

  const addBelow = useCallback(
    (currentNodeId: string) => {
      // Generate IDs outside setNodes to prevent multiple calls during React re-renders
      const newId = nextBlockId()
      if (!nodeRefsMap.current[newId]) nodeRefsMap.current[newId] = { current: null }

      const currentNodeCheck = nodesRef.current.find((n) => n.id === currentNodeId) as any
      if (!currentNodeCheck) return

      const isCreatingNewStack = !currentNodeCheck.data.stackId
      const stackId = currentNodeCheck.data.stackId || nextStackId()

      setNodes((nds) => {
        const currentNode = nds.find((n) => n.id === currentNodeId) as any
        if (!currentNode) return nds

        // Use pre-generated newId, stackId, and isCreatingNewStack
        // Create callbacks for the new block
        const newBlockCallbacks = {
          onChange: (txt: string) =>
            setNodes((inner) => inner.map((ni: any) => (ni.id === newId ? { ...ni, data: { ...ni.data, text: txt } } : ni))),
          onAdd: () => addBelow(newId),
          onHeightChange: handleHeightChange,
          onTabNext: (id: string) => tabHandlersRef.current.handleTabNext?.(id),
          onTabPrev: (id: string) => tabHandlersRef.current.handleTabPrev?.(id),
          onArrowUp: (id: string) => tabHandlersRef.current.handleArrowUp?.(id),
          onArrowDown: (id: string) => tabHandlersRef.current.handleArrowDown?.(id),
          onSlashCommand: handleSlashCommand,
          onDelete: handleDelete,
          onSplit: handleSplit,
          onMergeUp: handleMergeUp,
        }

        if (isCreatingNewStack) {
          // Creating a new stack: create container first with proper parent-child setup
          const currentHeight = currentNode.data.height || 24
          const topPadding = 4
          const sidePadding = 4
          const bottomPadding = 4

          // Container position based on current block's absolute position
          const containerX = currentNode.position.x - sidePadding
          const containerY = currentNode.position.y - (headerHeight + topPadding)

          // Calculate container height: header + top padding + both blocks + gap + bottom padding
          const containerHeight = headerHeight + topPadding + currentHeight + gap + 24 + bottomPadding
          const containerWidth = blockWidth + 8

          const containerNode: Node = {
            id: stackId,
            type: 'stackContainer',
            position: { x: containerX, y: containerY },
            data: { width: containerWidth, height: containerHeight, stackId },
            selectable: true,
            draggable: true,
            resizable: false,
            zIndex: -1,
          } as Node

          // Update current block with relative position and parentId
          const updatedCurrentNode = {
            ...currentNode,
            parentId: stackId,
            position: { x: sidePadding, y: headerHeight + topPadding },
            className: 'in-stack',
            data: {
              ...currentNode.data,
              stackId,
              insertionOrder: 0,
              isBottomNode: false,
            },
          }

          // Create new block with relative position and parentId
          const newNode: Node = {
            id: newId,
            type: 'block',
            parentId: stackId,
            position: { x: sidePadding, y: headerHeight + topPadding + currentHeight + gap },
            dragHandle: '.drag-handle',
            className: 'in-stack',
            data: {
              text: '',
              stackId,
              isBottomNode: true,
              height: 24,
              insertionOrder: 1,
              focusRef: nodeRefsMap.current[newId],
              ...newBlockCallbacks,
            } as BlockData,
          }

          // Replace current node and add container and new node
          const updatedNodes = [
            containerNode,
            ...nds.filter(n => n.id !== currentNodeId),
            updatedCurrentNode,
            newNode,
          ]

          setTimeout(() => nodeRefsMap.current[newId]?.current?.focus?.(), 50)
          return updatedNodes
        } else {
          // Adding to existing stack: use existing layout logic
          const newNode: Node = {
            id: newId,
            type: 'block',
            parentId: stackId,
            position: { x: 4, y: 0 },  // Relative position, layout will fix
            dragHandle: '.drag-handle',
            data: {
              text: '',
              stackId,
              isBottomNode: true,
              height: 24,
              insertionOrder: undefined,
              focusRef: nodeRefsMap.current[newId],
              ...newBlockCallbacks,
            } as BlockData,
          }

          let updatedNodes = [...nds, newNode]
          updatedNodes = ensureInsertionOrder(stackId, updatedNodes)

          const blocks = updatedNodes.filter(
            (n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer'
          )
          const ordered = [...blocks].sort(
            (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
          )
          // Find current block in the ordered array (with newBlock)
          const curIdx = ordered.findIndex((b: any) => b.id === currentNodeId)
          // Filter out newBlock to get the others
          const others = ordered.filter((b: any) => b.id !== newId)
          // Find current block in others array (without newBlock) to get correct insert index
          const curIdxInOthers = others.findIndex((b: any) => b.id === currentNodeId)
          const insertIndex = curIdxInOthers === -1 ? others.length : curIdxInOthers + 1
          const reordered = [
            ...others.slice(0, insertIndex),
            updatedNodes.find((n) => n.id === newId) as any,
            ...others.slice(insertIndex),
          ]
          const idToOrder = new Map(reordered.map((b: any, i: number) => [b.id, i]))
          updatedNodes = updatedNodes.map((n: any) =>
            n.data?.stackId === stackId && n.type !== 'stackContainer'
              ? { ...n, data: { ...n.data, insertionOrder: idToOrder.get(n.id) } }
              : n
          )

          const final = applyLayout(stackId, updatedNodes)
          setTimeout(() => nodeRefsMap.current[newId]?.current?.focus?.(), 50)
          return final
        }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNodes, nodeRefsMap, applyLayout, handleHeightChange, handleSlashCommand, tabHandlersRef, gap, blockWidth, headerHeight]
  )

  const handleSplit = useCallback(
    (nodeId: string, before: string, after: string) => {
      // Generate IDs outside setNodes to prevent multiple calls during React re-renders
      const newId = nextBlockId()
      if (!nodeRefsMap.current[newId]) nodeRefsMap.current[newId] = { current: null }

      const nodeCheck = nodesRef.current.find((n) => n.id === nodeId) as any
      if (!nodeCheck) return

      const isCreatingNewStack = !nodeCheck.data?.stackId
      const stackId = nodeCheck.data?.stackId || nextStackId()

      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId) as any
        if (!node) return nds

        // Create callbacks for the new block
        const newBlockCallbacks = {
          onChange: (txt: string) =>
            setNodes((inner) => inner.map((ni: any) => (ni.id === newId ? { ...ni, data: { ...ni.data, text: txt } } : ni))),
          onAdd: () => addBelow(newId),
          onHeightChange: handleHeightChange,
          onTabNext: (id: string) => tabHandlersRef.current.handleTabNext?.(id),
          onTabPrev: (id: string) => tabHandlersRef.current.handleTabPrev?.(id),
          onArrowUp: (id: string) => tabHandlersRef.current.handleArrowUp?.(id),
          onArrowDown: (id: string) => tabHandlersRef.current.handleArrowDown?.(id),
          onSlashCommand: handleSlashCommand,
          onDelete: handleDelete,
          onSplit: handleSplit,
          onMergeUp: handleMergeUp,
        }

        if (isCreatingNewStack) {
          // Creating a new stack: create container first with proper parent-child setup
          const currentHeight = node.data.height || 24
          const topPadding = 4
          const sidePadding = 4
          const bottomPadding = 4

          // Container position based on current block's absolute position
          const containerX = node.position.x - sidePadding
          const containerY = node.position.y - (headerHeight + topPadding)

          // Calculate container height: header + top padding + both blocks + gap + bottom padding
          const containerHeight = headerHeight + topPadding + currentHeight + gap + 24 + bottomPadding
          const containerWidth = blockWidth + 8

          const containerNode: Node = {
            id: stackId,
            type: 'stackContainer',
            position: { x: containerX, y: containerY },
            data: { width: containerWidth, height: containerHeight, stackId },
            selectable: true,
            draggable: true,
            resizable: false,
            zIndex: -1,
          } as Node

          // Update current block with relative position and parentId
          const updatedCurrentNode = {
            ...node,
            parentId: stackId,
            position: { x: sidePadding, y: headerHeight + topPadding },
            className: 'in-stack',
            data: {
              ...node.data,
              text: before,
              stackId,
              insertionOrder: 0,
              isBottomNode: false,
            },
          }

          // Create new block with relative position and parentId
          const newNode: Node = {
            id: newId,
            type: 'block',
            parentId: stackId,
            position: { x: sidePadding, y: headerHeight + topPadding + currentHeight + gap },
            dragHandle: '.drag-handle',
            className: 'in-stack',
            data: {
              text: after,
              stackId,
              isBottomNode: true,
              height: 24,
              insertionOrder: 1,
              focusRef: nodeRefsMap.current[newId],
              ...newBlockCallbacks,
            } as BlockData,
          }

          // Replace current node and add container and new node
          const updatedNodes = [
            containerNode,
            ...nds.filter(n => n.id !== nodeId),
            updatedCurrentNode,
            newNode,
          ]

          setTimeout(() => nodeRefsMap.current[newId]?.current?.focus?.(), 50)
          return updatedNodes
        } else {
          // Splitting in existing stack: use existing layout logic
          const withText = nds.map((n: any) =>
            n.id === nodeId ? { ...n, data: { ...n.data, text: before, stackId } } : n
          )

          const newNode: Node = {
            id: newId,
            type: 'block',
            parentId: stackId,
            position: { x: 4, y: 0 },  // Relative position, layout will fix
            dragHandle: '.drag-handle',
            data: {
              text: after,
              stackId,
              isBottomNode: true,
              height: 24,
              insertionOrder: undefined,
              focusRef: nodeRefsMap.current[newId],
              ...newBlockCallbacks,
            } as BlockData,
          }

          let updatedNodes = [...withText, newNode]
          updatedNodes = ensureInsertionOrder(stackId, updatedNodes)

          const blocks = updatedNodes.filter(
            (n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer'
          )
          const ordered = [...blocks].sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))
          // Find current block in the ordered array (with newBlock)
          const curIdx = ordered.findIndex((b: any) => b.id === nodeId)
          // Filter out newBlock to get the others
          const others = ordered.filter((b: any) => b.id !== newId)
          // Find current block in others array (without newBlock) to get correct insert index
          const curIdxInOthers = others.findIndex((b: any) => b.id === nodeId)
          const insertIndex = curIdxInOthers === -1 ? others.length : curIdxInOthers + 1
          const reordered = [
            ...others.slice(0, insertIndex),
            updatedNodes.find((n) => n.id === newId) as any,
            ...others.slice(insertIndex),
          ]
          const idToOrder = new Map(reordered.map((b: any, i: number) => [b.id, i]))
          updatedNodes = updatedNodes.map((n: any) =>
            n.data?.stackId === stackId && n.type !== 'stackContainer'
              ? { ...n, data: { ...n.data, insertionOrder: idToOrder.get(n.id) } }
              : n
          )

          const final = applyLayout(stackId, updatedNodes)
          setTimeout(() => nodeRefsMap.current[newId]?.current?.focus?.(), 50)
          return final
        }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNodes, nodeRefsMap, applyLayout, handleHeightChange, handleSlashCommand, tabHandlersRef, addBelow, gap, blockWidth, headerHeight]
  )

  const createBlockCallbacks = useCallback(
    (nodeId: string, stackId: string, setNodesInner: any): Partial<BlockCallbacks> => ({
      onAdd: () => addBelow(nodeId),
      onHeightChange: handleHeightChange,
      onSlashCommand: handleSlashCommand,
      onDelete: handleDelete,
      onSplit: handleSplit,
      onMergeUp: handleMergeUp,
    }),
    [addBelow, handleHeightChange, handleSlashCommand, handleDelete, handleSplit, handleMergeUp]
  )

  return {
    handleDelete,
    handleMergeUp,
    addBelow,
    handleSplit,
    createBlockCallbacks,
  }
}
