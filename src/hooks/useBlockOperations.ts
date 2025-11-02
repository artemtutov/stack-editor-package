import { useCallback, useEffect, useRef } from 'react'
import type { Node } from '@xyflow/react'
import type { JSONContent } from '@tiptap/core'
import type { BlockData, RichTextPayload, SlashPayload } from '../types'
import {
  nextBlockId,
  nextStackId,
  findFocusTargetAfterDelete,
  removeBlock,
  getPreviousBlockInStack,
  getPreviousBlockByY,
} from '../logic/stackState'
import { ensureInsertionOrder } from '../logic/stackLayout'
import { createEmptyPayload, mergePayloads, htmlToJson, jsonToHtml, ensureJsonContent, CURRENT_SCHEMA_VERSION, calculateContentLength, calculateNodeSize, calculateInlineTextLength } from '../editor/richText'
import { upgradeContentJson } from '../editor/upgrade'
import { sanitizeAndSave } from '../utils/sanitizeHTML'

export type BlockCallbacks = {
  onContentUpdate: (payload: RichTextPayload) => void
  onAdd: (initialContent?: RichTextPayload) => void
  onHeightChange: (id: string, height: number) => void
  onTabNext: (id: string) => void
  onTabPrev: (id: string) => void
  onArrowUp: (id: string) => void
  onArrowDown: (id: string) => void
  onSlashCommand: (payload: SlashPayload) => void
  onDelete: (id: string) => void
  onSplit: (id: string, before: RichTextPayload, after: RichTextPayload) => void
  onMergeUp: (id: string, currentContent?: RichTextPayload) => void
}

export type NodeRefsMap = Record<
  string,
  {
    current: null | {
      focus: () => void
      setCaretAt?: (pos: number) => void
      setCaretToEnd?: () => void
      getLatestJson?: () => JSONContent
    }
  }
>

export type UseBlockOperationsOptions = {
  nodeRefsMap: React.MutableRefObject<NodeRefsMap>
  nodesRef: React.MutableRefObject<Node[]>
  applyLayout: (stackId: string, nodes: Node[]) => Node[]
  syncContainers: (nodes: Node[]) => Node[]
  handleHeightChange: (nodeId: string, newHeight: number) => void
  handleSlashCommand: (payload: SlashPayload) => void
  tabHandlersRef: React.MutableRefObject<{ handleTabNext?: (id: string) => void; handleTabPrev?: (id: string) => void; handleArrowUp?: (id: string) => void; handleArrowDown?: (id: string) => void }>
  gap: number
  blockWidth: number
  headerHeight: number
}

export type UseBlockOperationsResult = {
  handleDelete: (nodeId: string) => void
  handleMergeUp: (nodeId: string) => void
  addBelow: (currentNodeId: string, initialContent?: RichTextPayload) => void
  addMultipleBelow: (currentNodeId: string, payloads: RichTextPayload[]) => void
  handleSplit: (nodeId: string, before: RichTextPayload, after: RichTextPayload) => void
  replaceStackContent: (stackId: string, blocks: Array<{ id?: string; content: RichTextPayload }>) => Array<{ id: string; content: RichTextPayload }>
  createBlockCallbacks: (nodeId: string, stackId: string, setNodes: any) => Partial<BlockCallbacks>
}

function toPayload(input?: RichTextPayload | string | null): RichTextPayload {
  if (!input) {
    return createEmptyPayload()
  }
  if (typeof input === 'string') {
    const json = htmlToJson(input)
    const html = sanitizeAndSave(jsonToHtml(json))
    return { json, html }
  }
  const json = ensureJsonContent(input.json)
  const html = sanitizeAndSave(input.html || jsonToHtml(json))
  return { json, html }
}

function blockDataToPayload(data: BlockData): RichTextPayload {
  const baseJson = ensureJsonContent(data.contentJson)
  const json = data.schemaVersion !== CURRENT_SCHEMA_VERSION
    ? ensureJsonContent(upgradeContentJson(baseJson, data.schemaVersion, CURRENT_SCHEMA_VERSION))
    : baseJson
  const html = sanitizeAndSave(data.cachedHTML ?? jsonToHtml(json))
  return { json, html }
}

function applyPayloadToNode(node: Node, payload: RichTextPayload): Node {
  return {
    ...node,
    data: {
      ...(node.data as BlockData),
      contentJson: payload.json,
      cachedHTML: payload.html,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    } as BlockData,
  }
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

  const addBelowRef = useRef<(currentNodeId: string, initialContent?: RichTextPayload) => void>(() => {})
  const handleSplitRef = useRef<(nodeId: string, before: RichTextPayload, after: RichTextPayload) => void>(() => {})

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
    (nodeId: string, currentContent?: RichTextPayload) => {
      // Get stackId and prevId using layout queries (minimal nodesRef usage)
      const currentNodes = nodesRef.current as any
      const current = currentNodes.find((n: any) => n.id === nodeId)
      if (!current) return

      const sid = current.data?.stackId
      let prev: any | null = getPreviousBlockInStack(nodeId, currentNodes)
      if (!prev) prev = getPreviousBlockByY(nodeId, currentNodes)
      if (!prev) return

      const prevId = prev.id as string

      // Get LIVE JSON from both editors (bypasses React state sync issues)
      const currentJson = currentContent?.json || ensureJsonContent(null)

      // Get prev editor's latest JSON from its focusRef (not from React state)
      const prevHandle = nodeRefsMap.current[prevId]?.current
      const prevJson = prevHandle?.getLatestJson?.() || ensureJsonContent(null)

      // Create payloads from live editor JSON
      const currentPayload = toPayload(currentContent || { json: currentJson, html: '' })
      const prevPayload = toPayload({ json: prevJson, html: '' })

      // Merge to create a single valid top-level node
      const mergedPayload = mergePayloads(prevPayload, currentPayload)

      // Calculate cursor position: just the inline text length of the prev block
      // This positions the cursor right after the prev text, before the current text
      const prevInlineLength = calculateInlineTextLength({ type: 'doc', content: [prevJson.content?.[0] || { type: 'paragraph' }] })

      setNodes((nds) => {
        // Apply merged payload to prev node and remove current node
        let updated = nds.map((n: any) => (n.id === prevId ? applyPayloadToNode(n, mergedPayload) : n))
        updated = removeBlock(nodeId, updated)

        if (sid) {
          updated = ensureInsertionOrder(sid, updated)
          updated = applyLayout(sid, updated)
        } else {
          updated = syncContainers(updated)
        }

        return updated
      })

      // Use setTimeout to ensure prev editor is mounted and has new JSON
      // This matches the timing pattern used in other operations (Enter, split, etc.)
      // and prevents mobile keyboards from dismissing due to focus gaps
      setTimeout(() => {
        const handle = nodeRefsMap.current[prevId]?.current
        if (handle?.setCaretAt) {
          // Position at the merge point (after prev's inline text, before current's text)
          // +1 to account for the paragraph opening tag in ProseMirror's position system
          handle.setCaretAt(prevInlineLength + 1)
        } else if (handle?.setCaretToEnd) {
          handle.setCaretToEnd()
        } else {
          handle?.focus?.()
        }
      }, 50)
    },
    [nodesRef, setNodes, nodeRefsMap, applyLayout, syncContainers]
  )

  const addBelow = useCallback<(currentNodeId: string, initialContent?: RichTextPayload) => void>(
    (currentNodeId, initialContent) => {
      const payload = toPayload(initialContent)

      const newId = nextBlockId()
      if (!nodeRefsMap.current[newId]) nodeRefsMap.current[newId] = { current: null }

      const currentNodeCheck = nodesRef.current.find((n) => n.id === currentNodeId) as any
      if (!currentNodeCheck) return

      const isCreatingNewStack = !currentNodeCheck.data?.stackId
      // Always generate a new stackId to prevent reusing stale/old stackIds
      const stackId = isCreatingNewStack ? nextStackId(nodesRef.current) : currentNodeCheck.data.stackId

      setNodes((nds) => {
        const currentNode = nds.find((n) => n.id === currentNodeId) as any
        if (!currentNode) return nds

        const newBlockCallbacks = {
          onContentUpdate: (nextPayload: RichTextPayload) =>
            setNodes((inner) =>
              inner.map((ni: any) => (ni.id === newId ? applyPayloadToNode(ni, nextPayload) : ni))
            ),
          onAdd: (initial?: RichTextPayload) => addBelowRef.current(newId, initial),
          onHeightChange: handleHeightChange,
          onTabNext: (id: string) => tabHandlersRef.current.handleTabNext?.(id),
          onTabPrev: (id: string) => tabHandlersRef.current.handleTabPrev?.(id),
          onArrowUp: (id: string) => tabHandlersRef.current.handleArrowUp?.(id),
          onArrowDown: (id: string) => tabHandlersRef.current.handleArrowDown?.(id),
          onSlashCommand: handleSlashCommand,
          onDelete: handleDelete,
          onSplit: (id: string, before: RichTextPayload, after: RichTextPayload) => handleSplitRef.current(id, before, after),
          onMergeUp: handleMergeUp,
        }

        if (isCreatingNewStack) {
          const currentHeight = currentNode.data.height || 24
          const topPadding = 4
          const sidePadding = 4
          const bottomPadding = 4

          const containerX = currentNode.position.x - sidePadding
          const containerY = currentNode.position.y - (headerHeight + topPadding)

          const containerHeight = headerHeight + topPadding + currentHeight + gap + 24 + bottomPadding
          const containerWidth = blockWidth + 8

          const containerNode: Node = {
            id: stackId,
            type: 'stackContainer',
            position: { x: containerX, y: containerY },
            // Inherit parent from original block if grouped
            ...(currentNode.parentId ? { parentId: currentNode.parentId } : {}),
            ...(currentNode.extent ? { extent: currentNode.extent } : {}),
            data: { width: containerWidth, height: containerHeight, stackId },
            selectable: true,
            draggable: true,
            resizable: false,
            zIndex: -1,
          } as Node

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

          const newNode: Node = {
            id: newId,
            type: 'block',
            parentId: stackId,
            position: { x: sidePadding, y: headerHeight + topPadding + currentHeight + gap },
            dragHandle: '.drag-handle',
            className: 'in-stack',
            data: {
              contentJson: payload.json,
              cachedHTML: payload.html,
              schemaVersion: CURRENT_SCHEMA_VERSION,
              stackId,
              isBottomNode: true,
              height: 24,
              insertionOrder: 1,
              focusRef: nodeRefsMap.current[newId],
              ...newBlockCallbacks,
            } as BlockData,
          }

          const updatedNodes = [
            containerNode,
            ...nds.filter((n) => n.id !== currentNodeId),
            applyPayloadToNode(updatedCurrentNode, blockDataToPayload(updatedCurrentNode.data as BlockData)),
            newNode,
          ]

          const final = applyLayout(stackId, updatedNodes)
          setTimeout(() => nodeRefsMap.current[newId]?.current?.focus?.(), 50)
          return final
        }

        const newNode: Node = {
          id: newId,
          type: 'block',
          parentId: stackId,
          position: { x: 4, y: 0 },
          dragHandle: '.drag-handle',
          data: {
            contentJson: payload.json,
            cachedHTML: payload.html,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            stackId,
            isBottomNode: true,
            height: 24,
            insertionOrder: undefined,
            focusRef: nodeRefsMap.current[newId],
            onContentUpdate: (nextPayload: RichTextPayload) =>
              setNodes((inner) =>
                inner.map((ni: any) => (ni.id === newId ? applyPayloadToNode(ni, nextPayload) : ni))
              ),
            onAdd: (initial?: RichTextPayload) => addBelowRef.current(newId, initial),
            onHeightChange: handleHeightChange,
            onTabNext: (id: string) => tabHandlersRef.current.handleTabNext?.(id),
            onTabPrev: (id: string) => tabHandlersRef.current.handleTabPrev?.(id),
            onArrowUp: (id: string) => tabHandlersRef.current.handleArrowUp?.(id),
            onArrowDown: (id: string) => tabHandlersRef.current.handleArrowDown?.(id),
            onSlashCommand: handleSlashCommand,
            onDelete: handleDelete,
            onSplit: (id: string, before: RichTextPayload, after: RichTextPayload) => handleSplitRef.current(id, before, after),
            onMergeUp: handleMergeUp,
          } as BlockData,
        }

        let updatedNodes = [...nds, newNode]
        updatedNodes = ensureInsertionOrder(stackId, updatedNodes)

        // Reorder blocks to insert new block right after current block
        const blocks = updatedNodes.filter(
          (n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer'
        )
        const ordered = [...blocks].sort(
          (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
        )
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
      })
    },
    [setNodes, nodeRefsMap, nodesRef, ensureInsertionOrder, applyLayout, handleHeightChange, tabHandlersRef, handleSlashCommand, handleDelete, handleMergeUp, gap, headerHeight, blockWidth]
  )

  const addMultipleBelow = useCallback(
    (currentNodeId: string, payloads: RichTextPayload[]) => {
      if (payloads.length === 0) return

      const newIds = payloads.map(() => {
        const id = nextBlockId()
        if (!nodeRefsMap.current[id]) nodeRefsMap.current[id] = { current: null }
        return id
      })

      const currentNodeCheck = nodesRef.current.find((n) => n.id === currentNodeId) as any
      if (!currentNodeCheck) return

      const isCreatingNewStack = !currentNodeCheck.data?.stackId
      // Always generate a new stackId to prevent reusing stale/old stackIds
      const stackId = isCreatingNewStack ? nextStackId(nodesRef.current) : currentNodeCheck.data.stackId

      setNodes((nds) => {
        const currentNode = nds.find((n) => n.id === currentNodeId) as any
        if (!currentNode) return nds

        // Create callbacks factory for new blocks
        const createCallbacks = (blockId: string) => ({
          onContentUpdate: (nextPayload: RichTextPayload) =>
            setNodes((inner) =>
              inner.map((ni: any) => (ni.id === blockId ? applyPayloadToNode(ni, nextPayload) : ni))
            ),
          onAdd: (initial?: RichTextPayload) => addBelowRef.current(blockId, initial),
          onHeightChange: handleHeightChange,
          onTabNext: (id: string) => tabHandlersRef.current.handleTabNext?.(id),
          onTabPrev: (id: string) => tabHandlersRef.current.handleTabPrev?.(id),
          onArrowUp: (id: string) => tabHandlersRef.current.handleArrowUp?.(id),
          onArrowDown: (id: string) => tabHandlersRef.current.handleArrowDown?.(id),
          onSlashCommand: handleSlashCommand,
          onDelete: handleDelete,
          onSplit: (id: string, before: RichTextPayload, after: RichTextPayload) => handleSplitRef.current(id, before, after),
          onMergeUp: handleMergeUp,
        })

        if (isCreatingNewStack) {
          const currentHeight = currentNode.data.height || 24
          const topPadding = 4
          const sidePadding = 4
          const bottomPadding = 4

          const containerX = currentNode.position.x - sidePadding
          const containerY = currentNode.position.y - (headerHeight + topPadding)

          // Estimate total height (will be adjusted by applyLayout)
          const estimatedTotalHeight = headerHeight + topPadding + (currentHeight + gap) * (payloads.length + 1) + bottomPadding
          const containerWidth = blockWidth + 8

          const containerNode: Node = {
            id: stackId,
            type: 'stackContainer',
            position: { x: containerX, y: containerY },
            // Inherit parent from original block if grouped
            ...(currentNode.parentId ? { parentId: currentNode.parentId } : {}),
            ...(currentNode.extent ? { extent: currentNode.extent } : {}),
            data: { width: containerWidth, height: estimatedTotalHeight, stackId },
            selectable: true,
            draggable: true,
            resizable: false,
            zIndex: -1,
          } as Node

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

          const newNodes: Node[] = payloads.map((payload, index) => {
            const newId = newIds[index]
            return {
              id: newId,
              type: 'block',
              parentId: stackId,
              position: { x: sidePadding, y: headerHeight + topPadding + (currentHeight + gap) * (index + 1) },
              dragHandle: '.drag-handle',
              className: 'in-stack',
              data: {
                contentJson: payload.json,
                cachedHTML: payload.html,
                schemaVersion: CURRENT_SCHEMA_VERSION,
                stackId,
                isBottomNode: index === payloads.length - 1,
                height: 24,
                insertionOrder: index + 1,
                focusRef: nodeRefsMap.current[newId],
                ...createCallbacks(newId),
              } as BlockData,
            }
          })

          const updatedNodes = [
            containerNode,
            ...nds.filter((n) => n.id !== currentNodeId),
            applyPayloadToNode(updatedCurrentNode, blockDataToPayload(updatedCurrentNode.data as BlockData)),
            ...newNodes,
          ]

          // Focus the first new block
          if (newIds.length > 0) {
            setTimeout(() => nodeRefsMap.current[newIds[0]]?.current?.focus?.(), 50)
          }

          return applyLayout(stackId, updatedNodes)
        }

        // Adding to existing stack
        const newNodes: Node[] = payloads.map((payload, index) => {
          const newId = newIds[index]
          return {
            id: newId,
            type: 'block',
            parentId: stackId,
            position: { x: 4, y: 0 },
            dragHandle: '.drag-handle',
            data: {
              contentJson: payload.json,
              cachedHTML: payload.html,
              schemaVersion: CURRENT_SCHEMA_VERSION,
              stackId,
              isBottomNode: index === payloads.length - 1,
              height: 24,
              insertionOrder: undefined, // Will be set below
              focusRef: nodeRefsMap.current[newId],
              ...createCallbacks(newId),
            } as BlockData,
          }
        })

        let updatedNodes = [...nds, ...newNodes]
        updatedNodes = ensureInsertionOrder(stackId, updatedNodes)

        // Reorder blocks to insert new blocks right after current block
        const blocks = updatedNodes.filter(
          (n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer'
        )
        const ordered = [...blocks].sort(
          (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
        )

        // Filter out new blocks to get the others
        const newIdSet = new Set(newIds)
        const others = ordered.filter((b: any) => !newIdSet.has(b.id))

        // Find current block in others array to get correct insert index
        const curIdxInOthers = others.findIndex((b: any) => b.id === currentNodeId)
        const insertIndex = curIdxInOthers === -1 ? others.length : curIdxInOthers + 1

        // Insert all new blocks after current block
        const reordered = [
          ...others.slice(0, insertIndex),
          ...newNodes.map(n => updatedNodes.find(un => un.id === n.id) as Node),
          ...others.slice(insertIndex),
        ]

        const idToOrder = new Map(reordered.map((b: any, i: number) => [b.id, i]))
        updatedNodes = updatedNodes.map((n: any) =>
          n.data?.stackId === stackId && n.type !== 'stackContainer'
            ? { ...n, data: { ...n.data, insertionOrder: idToOrder.get(n.id) } }
            : n
        )

        const final = applyLayout(stackId, updatedNodes)

        // Focus the first new block
        if (newIds.length > 0) {
          setTimeout(() => nodeRefsMap.current[newIds[0]]?.current?.focus?.(), 50)
        }

        return final
      })
    },
    [setNodes, nodeRefsMap, nodesRef, ensureInsertionOrder, applyLayout, handleHeightChange, tabHandlersRef, handleSlashCommand, handleDelete, handleMergeUp, gap, headerHeight, blockWidth]
  )

  const handleSplit = useCallback<(nodeId: string, before: RichTextPayload, after: RichTextPayload) => void>(
    (nodeId, before, after) => {
      const beforePayload = toPayload(before)
      const afterPayload = toPayload(after)

      const newId = nextBlockId()
      if (!nodeRefsMap.current[newId]) nodeRefsMap.current[newId] = { current: null }

      const nodeCheck = nodesRef.current.find((n) => n.id === nodeId) as any
      if (!nodeCheck) return

      const isCreatingNewStack = !nodeCheck.data?.stackId
      // Always generate a new stackId to prevent reusing stale/old stackIds
      const stackId = isCreatingNewStack ? nextStackId(nodesRef.current) : nodeCheck.data.stackId

      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId) as any
        if (!node) return nds

        const updatedCurrent = applyPayloadToNode(node, beforePayload)

        const newBlockCallbacks = {
          onContentUpdate: (payload: RichTextPayload) =>
            setNodes((inner) => inner.map((ni: any) => (ni.id === newId ? applyPayloadToNode(ni, payload) : ni))),
          onAdd: (initial?: RichTextPayload) => addBelowRef.current(newId, initial),
          onHeightChange: handleHeightChange,
          onTabNext: (id: string) => tabHandlersRef.current.handleTabNext?.(id),
          onTabPrev: (id: string) => tabHandlersRef.current.handleTabPrev?.(id),
          onArrowUp: (id: string) => tabHandlersRef.current.handleArrowUp?.(id),
          onArrowDown: (id: string) => tabHandlersRef.current.handleArrowDown?.(id),
          onSlashCommand: handleSlashCommand,
          onDelete: handleDelete,
          onSplit: (id: string, before: RichTextPayload, after: RichTextPayload) => handleSplitRef.current(id, before, after),
          onMergeUp: handleMergeUp,
        }

        if (isCreatingNewStack) {
          const currentHeight = node.data.height || 24
          const topPadding = 4
          const sidePadding = 4
          const bottomPadding = 4

          const containerX = node.position.x - sidePadding
          const containerY = node.position.y - (headerHeight + topPadding)

          const containerHeight = headerHeight + topPadding + currentHeight + gap + 24 + bottomPadding
          const containerWidth = blockWidth + 8

          const containerNode: Node = {
            id: stackId,
            type: 'stackContainer',
            position: { x: containerX, y: containerY },
            // Inherit parent from original block if grouped
            ...(node.parentId ? { parentId: node.parentId } : {}),
            ...(node.extent ? { extent: node.extent } : {}),
            data: { width: containerWidth, height: containerHeight, stackId },
            selectable: true,
            draggable: true,
            resizable: false,
            zIndex: -1,
          } as Node

          const newNode: Node = {
            id: newId,
            type: 'block',
            parentId: stackId,
            position: { x: sidePadding, y: headerHeight + topPadding + currentHeight + gap },
            dragHandle: '.drag-handle',
            className: 'in-stack',
            data: {
              contentJson: afterPayload.json,
              cachedHTML: afterPayload.html,
              schemaVersion: CURRENT_SCHEMA_VERSION,
              stackId,
              isBottomNode: true,
              height: 24,
              insertionOrder: 1,
              focusRef: nodeRefsMap.current[newId],
              ...newBlockCallbacks,
            } as BlockData,
          }

          const updatedNodes = [
            containerNode,
            ...nds.filter((n) => n.id !== nodeId),
            updatedCurrent,
            newNode,
          ]

          setTimeout(() => nodeRefsMap.current[newId]?.current?.focus?.(), 50)
          return updatedNodes
        }

        const newNode: Node = {
          id: newId,
          type: 'block',
          parentId: stackId,
          position: { x: 4, y: 0 },
          dragHandle: '.drag-handle',
          data: {
            contentJson: afterPayload.json,
            cachedHTML: afterPayload.html,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            stackId,
            isBottomNode: true,
            height: 24,
            insertionOrder: undefined,
            focusRef: nodeRefsMap.current[newId],
            ...newBlockCallbacks,
          } as BlockData,
        }

        let updatedNodes = nds.map((n) => (n.id === nodeId ? updatedCurrent : n))
        updatedNodes = [...updatedNodes, newNode]
        updatedNodes = ensureInsertionOrder(stackId, updatedNodes)

        // Reorder blocks to insert new block right after current block
        const blocks = updatedNodes.filter(
          (n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer'
        )
        const ordered = [...blocks].sort(
          (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
        )
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
      })
    },
    [setNodes, nodeRefsMap, nodesRef, addBelow, handleHeightChange, tabHandlersRef, handleSlashCommand, handleDelete, handleMergeUp, applyLayout, ensureInsertionOrder, gap, headerHeight, blockWidth]
  )

  const replaceStackContent = useCallback(
    (stackId: string, blocksIn: Array<{ id?: string; content: RichTextPayload }>) => {
      let result: Array<{ id: string; content: RichTextPayload }> = []
      setNodes((nds) => {
        const normalized = blocksIn.map(({ id, content }) => ({ id, payload: toPayload(content) }))
        const container = nds.find((n) => n.id === stackId && n.type === 'stackContainer')
        if (!container) return nds

        let working = [...nds]
        const existingBlocks = working
          .filter((n: any) => n.type !== 'stackContainer' && n.data?.stackId === stackId)
          .sort((a: any, b: any) => (a.data?.insertionOrder ?? 0) - (b.data?.insertionOrder ?? 0))
        const existingById = new Map(existingBlocks.map((n: any) => [n.id, n]))
        const keepIds = new Set<string>()

        // Apply updates and create new blocks in incoming order
        let order = 0
        normalized.forEach(({ id, payload }) => {
          if (id && existingById.has(id)) {
            // Update existing
            working = working.map((n: any) => (n.id === id ? applyPayloadToNode(n, payload) : n))
            // Update order
            working = working.map((n: any) => (n.id === id ? { ...n, data: { ...(n.data as BlockData), insertionOrder: order } } : n))
            keepIds.add(id)
            result.push({ id, content: payload })
          } else {
            // Create new
            const newId = nextBlockId()
            if (!nodeRefsMap.current[newId]) nodeRefsMap.current[newId] = { current: null }

            const newNode: Node = {
              id: newId,
              type: 'block',
              parentId: stackId,
              position: { x: 4, y: 0 },
              dragHandle: '.drag-handle',
              data: {
                contentJson: payload.json,
                cachedHTML: payload.html,
                schemaVersion: CURRENT_SCHEMA_VERSION,
                stackId,
                isBottomNode: true,
                height: 24,
                insertionOrder: order,
                focusRef: nodeRefsMap.current[newId],
                onContentUpdate: (nextPayload: RichTextPayload) =>
                  setNodes((inner) =>
                    inner.map((ni: any) => (ni.id === newId ? applyPayloadToNode(ni, nextPayload) : ni))
                  ),
                onAdd: (initial?: RichTextPayload) => addBelowRef.current(newId, initial),
                onHeightChange: handleHeightChange,
                onTabNext: (id: string) => tabHandlersRef.current.handleTabNext?.(id),
                onTabPrev: (id: string) => tabHandlersRef.current.handleTabPrev?.(id),
                onArrowUp: (id: string) => tabHandlersRef.current.handleArrowUp?.(id),
                onArrowDown: (id: string) => tabHandlersRef.current.handleArrowDown?.(id),
                onSlashCommand: handleSlashCommand,
                onDelete: handleDelete,
                onSplit: (id: string, before: RichTextPayload, after: RichTextPayload) => handleSplitRef.current(id, before, after),
                onMergeUp: handleMergeUp,
              } as BlockData,
            }
            working.push(newNode)
            keepIds.add(newId)
            result.push({ id: newId, content: payload })
          }
          order += 1
        })

        // Remove blocks not present in incoming list
        const removeIds = new Set(existingBlocks.map((n) => n.id).filter((id) => !keepIds.has(id)))
        if (removeIds.size) {
          working = working.filter((n) => !removeIds.has(n.id))
        }

        working = ensureInsertionOrder(stackId, working)
        working = applyLayout(stackId, working)
        return working
      })
      return result
    },
    [setNodes, nodeRefsMap, addBelow, handleHeightChange, tabHandlersRef, handleSlashCommand, handleDelete, handleMergeUp, ensureInsertionOrder, applyLayout]
  )

  useEffect(() => {
    addBelowRef.current = addBelow
  }, [addBelow])

  useEffect(() => {
    handleSplitRef.current = handleSplit
  }, [handleSplit])

  const createBlockCallbacks = useCallback(
    (nodeId: string, stackId: string, _setNodesInner: any): Partial<BlockCallbacks> => ({
      onContentUpdate: (payload) =>
        setNodes((inner) => inner.map((ni: any) => (ni.id === nodeId ? applyPayloadToNode(ni, payload) : ni))),
      onAdd: (initialContent?: RichTextPayload) => addBelow(nodeId, initialContent),
      onHeightChange: handleHeightChange,
      onSlashCommand: handleSlashCommand,
      onDelete: handleDelete,
      onSplit: (id: string, before: RichTextPayload, after: RichTextPayload) => handleSplitRef.current(id, before, after),
      onMergeUp: handleMergeUp,
    }),
    [setNodes, addBelow, handleHeightChange, handleSlashCommand, handleDelete, handleSplit, handleMergeUp]
  )

  return {
    handleDelete,
    handleMergeUp,
    addBelow,
    addMultipleBelow,
    handleSplit,
    replaceStackContent,
    createBlockCallbacks,
  }
}
