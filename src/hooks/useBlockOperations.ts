import { useCallback } from 'react'
import type { Node } from '@xyflow/react'
import type { BlockData } from '../types'
import {
  nextBlockId,
  findFocusTargetAfterDelete,
  removeBlock,
  getPreviousBlockInStack,
  getPreviousBlockByY,
} from '../logic/stackState'
import { ensureInsertionOrder } from '../logic/stackLayout'
import type { StackAnchors } from '../logic/stackLayout'

export type BlockCallbacks = {
  onChange: (text: string) => void
  onAdd: () => void
  onHeightChange: (id: string, height: number) => void
  onTabNext: (id: string) => void
  onTabPrev: (id: string) => void
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
  stackAnchors: React.MutableRefObject<StackAnchors>
  nodeRefsMap: React.MutableRefObject<NodeRefsMap>
  nodesRef: React.MutableRefObject<Node[]>
  applyLayout: (stackId: string, nodes: Node[]) => Node[]
  syncContainers: (nodes: Node[]) => Node[]
  handleHeightChange: (nodeId: string, newHeight: number) => void
  handleSlashCommand: (nodeId: string, rectFromChild?: DOMRect | null) => void
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
    stackAnchors,
    nodeRefsMap,
    nodesRef,
    applyLayout,
    syncContainers,
    handleHeightChange,
    handleSlashCommand,
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
      setNodes((nds) => {
        const currentNode = nds.find((n) => n.id === currentNodeId) as any
        if (!currentNode) return nds

        const newId = nextBlockId()
        if (!nodeRefsMap.current[newId]) nodeRefsMap.current[newId] = { current: null }

        const stackId = currentNode.data.stackId || currentNodeId
        if (!currentNode.data.stackId && !stackAnchors.current[stackId]) {
          stackAnchors.current[stackId] = { x: currentNode.position.x, y: currentNode.position.y }
        }

        const newNode: Node = {
          id: newId,
          type: 'block',
          position: { x: currentNode.position.x, y: currentNode.position.y },
          dragHandle: '.drag-handle',
          data: {
            text: '',
            stackId,
            isBottomNode: true,
            height: 24,
            insertionOrder: undefined,
            focusRef: nodeRefsMap.current[newId],
          } as BlockData,
        }

        let updatedNodes = [...nds, newNode]

        if (!currentNode.data.stackId) {
          updatedNodes = updatedNodes.map((n: any) =>
            n.id === currentNodeId ? { ...n, data: { ...n.data, stackId } } : n
          )
        }

        updatedNodes = ensureInsertionOrder(stackId, updatedNodes)

        const blocks = updatedNodes.filter(
          (n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer'
        )
        const ordered = [...blocks].sort(
          (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
        )
        const curIdx = ordered.findIndex((b: any) => b.id === currentNodeId)
        const insertIndex = curIdx === -1 ? ordered.length : curIdx + 1
        const others = ordered.filter((b: any) => b.id !== newId)
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
      })
    },
    [setNodes, stackAnchors, nodeRefsMap, applyLayout]
  )

  const handleSplit = useCallback(
    (nodeId: string, before: string, after: string) => {
      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId) as any
        if (!node) return nds

        const stackId = node.data?.stackId || nodeId
        if (!node.data.stackId && !stackAnchors.current[stackId]) {
          stackAnchors.current[stackId] = { x: node.position.x, y: node.position.y }
        }

        const newId = nextBlockId()
        if (!nodeRefsMap.current[newId]) nodeRefsMap.current[newId] = { current: null }

        const withText = nds.map((n: any) =>
          n.id === nodeId ? { ...n, data: { ...n.data, text: before, stackId } } : n
        )

        const newNode: Node = {
          id: newId,
          type: 'block',
          position: { x: node.position.x, y: node.position.y },
          dragHandle: '.drag-handle',
          data: {
            text: after,
            stackId,
            isBottomNode: true,
            height: 24,
            insertionOrder: undefined,
            focusRef: nodeRefsMap.current[newId],
          } as BlockData,
        }

        let updatedNodes = [...withText, newNode]
        updatedNodes = ensureInsertionOrder(stackId, updatedNodes)

        const blocks = updatedNodes.filter(
          (n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer'
        )
        const ordered = [...blocks].sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))
        const curIdx = ordered.findIndex((b: any) => b.id === nodeId)
        const insertIndex = curIdx === -1 ? ordered.length : curIdx + 1
        const others = ordered.filter((b: any) => b.id !== newId)
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
      })
    },
    [setNodes, stackAnchors, nodeRefsMap, applyLayout]
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
