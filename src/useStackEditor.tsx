import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useNodesState,
  type Node,
  type NodeTypes,
} from '@xyflow/react'

import NotionBlock from './renderers/NotionBlock'
import StackContainer from './renderers/StackContainer'
import SlashMenu, { type SlashMenuItem } from './renderers/SlashMenu'
import DropIndicator from './renderers/DropIndicator'
import type {
  BlockData,
  StackEditorHookArgs,
  StackEditorHookResult,
  InitialBlock,
  StackEditorOptions,
} from './types'

// Default options
const DEFAULTS: Required<StackEditorOptions> = {
  blockWidth: 200,
  gap: 2,
  headerHeight: 28,
  enableContainerDrag: true,
  enableShiftGroupDrag: true,
  enableSlashMenu: true,
  xTolerance: 10,
  yHysteresis: 3,
  indicatorStabilityPx: 0.5,
}

let globalIdCounter = 0
const nextId = () => `block_${globalIdCounter++}`

export function useStackEditor(args?: StackEditorHookArgs): StackEditorHookResult {
  const opts = { ...DEFAULTS, ...(args?.options || {}) }

  // State
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])

  // Refs
  const nodeRefsMap = useRef<Record<string, { current: null | { focus: () => void; setCaretAt?: (pos: number) => void } }>>({})
  const nodesRef = useRef<Node[]>([])
  const stackTopOnDragStartRef = useRef<Record<string, number>>({})
  const stackTopIdOnDragStartRef = useRef<Record<string, string>>({})
  const stackAnchorsRef = useRef<Record<string, { x: number; y: number }>>({})
  const isDraggingStackRef = useRef(false)
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })
  const dragStartStackIdRef = useRef<string | null>(null)
  const dragStartAnchorXRef = useRef(0)
  const containerDragStartRef = useRef<
    | null
    | {
        pos: { x: number; y: number }
        stackId: string
        origPositions: Record<string, { x: number; y: number }>
      }
  >(null)

  // Slash menu and drop indicator overlays
  const [slashMenu, setSlashMenu] = useState<null | { nodeId: string; position: { x: number; y: number } }>(null)
  const [dropIndicator, setDropIndicator] = useState({
    show: false,
    position: { x: 0, y: 0, width: 0 },
    targetStackId: null as null | string,
    insertionIndex: -1,
  })
  const dropInfoRef = useRef(dropIndicator)

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // Node utils
  const getStackBlocks = useCallback((stackId: string, allNodes: Node[]) => {
    return allNodes.filter((n) => (n as any).type !== 'stackContainer' && (n as any).data?.stackId === stackId)
  }, [])

  const ensureInsertionOrder = useCallback(
    (stackId: string, allNodes: Node[]): Node[] => {
      const blocks = getStackBlocks(stackId, allNodes)
      if (blocks.length === 0) return allNodes
      const missing = blocks.some((b: any) => typeof b.data?.insertionOrder !== 'number')
      if (!missing) return allNodes
      const sortedByY = [...blocks].sort((a, b) => a.position.y - b.position.y)
      let idx = 0
      const idToOrder = new Map(sortedByY.map((b) => [b.id, idx++]))
      return allNodes.map((n: any) =>
        n.type !== 'stackContainer' && n.data?.stackId === stackId
          ? { ...n, data: { ...n.data, insertionOrder: idToOrder.get(n.id) } }
          : n
      )
    },
    [getStackBlocks]
  )

  const isBottomNode = useCallback((nodeId: string, allNodes: Node[]) => {
    const node = allNodes.find((n) => n.id === nodeId)
    if (!node) return true
    const stackId = (node as any).data?.stackId
    if (!stackId) return true
    const stackNodes = allNodes.filter((n: any) => n.data?.stackId === stackId)
    const maxY = Math.max(...stackNodes.map((n) => n.position.y))
    return node.position.y === maxY
  }, [])

  const updateBottomNodeFlags = useCallback(
    (allNodes: Node[]) => {
      return allNodes.map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          isBottomNode: isBottomNode(n.id, allNodes),
        },
      }))
    },
    [isBottomNode]
  )

  const calculateStackLayout = useCallback(
    (stackId: string, allNodes: Node[]): Node[] => {
      let updated = ensureInsertionOrder(stackId, allNodes)
      const blocks = getStackBlocks(stackId, updated)
      if (blocks.length === 0) return updated

      let anchor = stackAnchorsRef.current[stackId]
      if (!anchor) {
        const topByY = [...blocks].sort((a, b) => a.position.y - b.position.y)[0]
        anchor = { x: topByY.position.x, y: topByY.position.y }
        stackAnchorsRef.current[stackId] = anchor
      }

      const sorted = [...blocks].sort(
        // @ts-ignore
        (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
      )
      let currentY = anchor.y
      const idToPos = new Map<string, { x: number; y: number }>()
      sorted.forEach((b: any) => {
        const h = b.data?.height || 24
        idToPos.set(b.id, { x: anchor!.x, y: currentY })
        currentY += h + opts.gap
      })

      updated = updated.map((n: any) =>
        n.type !== 'stackContainer' && n.data?.stackId === stackId
          ? { ...n, position: { x: idToPos.get(n.id)!.x, y: idToPos.get(n.id)!.y } }
          : n
      )
      return updated
    },
    [ensureInsertionOrder, getStackBlocks, opts.gap]
  )

  const syncStackContainers = useCallback(
    (allNodes: Node[]): Node[] => {
      const blockNodes = allNodes.filter((n: any) => n.type !== 'stackContainer')

      const stackGroups: Record<string, Node[]> = {}
      blockNodes.forEach((node: any) => {
        const stackId = node.data?.stackId
        if (stackId) {
          if (!stackGroups[stackId]) stackGroups[stackId] = []
          stackGroups[stackId].push(node)
        }
      })

      const updatedBlocks = blockNodes.map((n: any) => {
        const sid = n.data?.stackId
        const inMultiNodeStack = sid && (stackGroups[sid]?.length || 0) > 1
        if (inMultiNodeStack) {
          return { ...n, className: 'in-stack' }
        }
        const { className, ...rest } = n
        return rest as any
      })

      const newContainers: Node[] = Object.entries(stackGroups).map(([stackId, stackNodes]) => {
        const anchor = stackAnchorsRef.current[stackId]
        const ys = (stackNodes as any).map((n: any) => n.position.y)
        const heights = (stackNodes as any).map((n: any) => n.data.height || 24)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys.map((y: number, i: number) => y + heights[i]))
        const containerWidth = opts.blockWidth + 8
        const containerHeight = maxY - minY + (opts.headerHeight + 8)
        const containerX = anchor ? anchor.x - 4 : (stackNodes as any)[0].position.x - 4
        return {
          id: `container-${stackId}`,
          type: 'stackContainer',
          position: { x: containerX, y: minY - (opts.headerHeight ?? 28) },
          data: { width: containerWidth, height: containerHeight, stackId },
          selectable: false,
          draggable: true,
          dragHandle: '.stack-drag-handle',
          zIndex: -1,
        } as Node
      })

      return [...updatedBlocks, ...newContainers]
    },
    [opts.blockWidth, opts.headerHeight]
  )

  const applyStackLayout = useCallback(
    (stackId: string, allNodes: Node[]) => {
      const laidOut = calculateStackLayout(stackId, allNodes)
      const withFlags = updateBottomNodeFlags(laidOut)
      return syncStackContainers(withFlags)
    },
    [calculateStackLayout, updateBottomNodeFlags, syncStackContainers]
  )

  // Public helpers
  const focus = useCallback((blockId: string) => {
    nodeRefsMap.current[blockId]?.current?.focus?.()
  }, [])

  const handleHeightChange = useCallback(
    (nodeId: string, newHeight: number) => {
      setNodes((nds) => {
        // Persist the measured height onto the node's data first
        let updated = nds.map((n: any) =>
          n.id === nodeId ? { ...n, data: { ...n.data, height: newHeight } } : n
        )
        const changedNode = updated.find((n) => n.id === nodeId) as any
        if (changedNode?.data?.stackId) {
          return applyStackLayout(changedNode.data.stackId, updated)
        }
        return syncStackContainers(updated)
      })
    },
    [setNodes, applyStackLayout, syncStackContainers]
  )

  const handleSlashCommand = useCallback((nodeId: string, rectFromChild?: DOMRect | null) => {
    if (!opts.enableSlashMenu) return
    const rect = rectFromChild || (document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement | null)?.getBoundingClientRect() || null
    if (!rect) return
    setSlashMenu({ nodeId, position: { x: rect.left, y: rect.top } })
  }, [opts.enableSlashMenu])

  const onSlashMenuSelect = useCallback((item: SlashMenuItem) => {
    // Placeholder for future block transforms
    console.log('Selected:', item.id)
    setSlashMenu(null)
  }, [])

  const handleDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId) as any
        if (!node) return nds
        const stackId = node.data?.stackId as string | undefined

        // Choose focus target: previous in stack by order, else previous by Y
        let focusId: string | null = null
        if (stackId) {
          const blocks = (nds as any)
            .filter((n: any) => n.type !== 'stackContainer' && n.data?.stackId === stackId)
            .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))
          const idx = blocks.findIndex((b: any) => b.id === nodeId)
          if (idx > 0) focusId = blocks[idx - 1].id
        }
        if (!focusId) {
          const sorted = [...(nds as any)]
            .filter((n: any) => n.type !== 'stackContainer')
            .sort((a: any, b: any) => a.position.y - b.position.y)
          const i = sorted.findIndex((n: any) => n.id === nodeId)
          if (i > 0) focusId = sorted[i - 1].id
        }

        let updated = nds.filter((n) => n.id !== nodeId)
        if (stackId) {
          updated = ensureInsertionOrder(stackId, updated)
          updated = calculateStackLayout(stackId, updated)
        }
        const final = updateBottomNodeFlags(updated)
        const synced = syncStackContainers(final)

        if (focusId) {
          setTimeout(() => nodeRefsMap.current[focusId!]?.current?.focus?.(), 50)
        }
        return synced
      })
    },
    [setNodes, ensureInsertionOrder, calculateStackLayout, updateBottomNodeFlags, syncStackContainers]
  )

  const handleMergeUp = useCallback((nodeId: string) => {
    // Compute previous block from current snapshot for focus after merge
    const currentNodes = nodesRef.current as any
    const current = currentNodes.find((n: any) => n.id === nodeId)
    if (!current) return
    const sid = current.data?.stackId
    let prev: any | null = null
    if (sid) {
      const blocks = currentNodes
        .filter((n: any) => n.type !== 'stackContainer' && n.data?.stackId === sid)
        .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))
      const idx = blocks.findIndex((b: any) => b.id === nodeId)
      if (idx > 0) prev = blocks[idx - 1]
    }
    if (!prev) {
      // Fallback: previous by Y among all blocks
      const allBlocks = currentNodes.filter((n: any) => n.type !== 'stackContainer').sort((a: any, b: any) => a.position.y - b.position.y)
      const i = allBlocks.findIndex((n: any) => n.id === nodeId)
      if (i > 0) prev = allBlocks[i - 1]
    }
    if (!prev) return

    const prevId = prev.id as string
    const currText = current.data?.text ?? ''
    const prevText = prev.data?.text ?? ''
    const merged = prevText + currText

    setNodes((nds) => {
      let updated = (nds as any).map((n: any) =>
        n.id === prevId ? { ...n, data: { ...n.data, text: merged } } : n
      )
      updated = updated.filter((n: any) => n.id !== nodeId)

      // Re-layout affected stacks
      if (sid) {
        updated = ensureInsertionOrder(sid, updated)
        updated = calculateStackLayout(sid, updated)
      }
      // The prev stack layout will adapt via ResizeObserver; ensure containers sync
      const final = updateBottomNodeFlags(updated)
      return syncStackContainers(final)
    })

    // Focus previous block at the join boundary (between previous text and merged text)
    setTimeout(() => {
      const caretPos = (prevText as string).length
      nodeRefsMap.current[prevId]?.current?.setCaretAt?.(caretPos) ||
        nodeRefsMap.current[prevId]?.current?.focus?.()
    }, 50)
  }, [setNodes, ensureInsertionOrder, calculateStackLayout, syncStackContainers, updateBottomNodeFlags])

  const addBelow = useCallback(
    (currentNodeId: string) => {
      setNodes((nds) => {
        const currentNode = nds.find((n) => n.id === currentNodeId) as any
        if (!currentNode) return nds
        const newId = nextId()
        if (!nodeRefsMap.current[newId]) nodeRefsMap.current[newId] = { current: null }
        const stackId = currentNode.data.stackId || currentNodeId
        if (!currentNode.data.stackId && !stackAnchorsRef.current[stackId]) {
          stackAnchorsRef.current[stackId] = { x: currentNode.position.x, y: currentNode.position.y }
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

        let updatedNodes = [...nds, newNode].map((n: any) =>
          n.id === newId
            ? {
                ...n,
                data: {
                  ...n.data,
                  onChange: (txt: string) =>
                    setNodes((inner) => {
                      const withText = inner.map((ni: any) =>
                        ni.id === newId ? { ...ni, data: { ...ni.data, text: txt } } : ni
                      )
                      return applyStackLayout(stackId, withText)
                    }),
                  onAdd: () => addBelow(newId),
                  onHeightChange: handleHeightChange,
                  onTabNext: (id: string) => tabHandlers.current.handleTabNext?.(id),
                  onTabPrev: (id: string) => tabHandlers.current.handleTabPrev?.(id),
                  onSlashCommand: handleSlashCommand,
                  onDelete: handleDelete,
                  onSplit: handleSplit,
                  onMergeUp: handleMergeUp,
                },
              }
            : n
        )

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

        const final = applyStackLayout(stackId, updatedNodes)
        setTimeout(() => nodeRefsMap.current[newId]?.current?.focus?.(), 50)
        return final
      })
    },
    [setNodes, applyStackLayout, ensureInsertionOrder, handleHeightChange, handleSlashCommand, handleDelete, handleMergeUp]
  )

  const handleSplit = useCallback(
    (nodeId: string, before: string, after: string) => {
      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId) as any
        if (!node) return nds

        const stackId = node.data?.stackId || nodeId
        if (!node.data.stackId && !stackAnchorsRef.current[stackId]) {
          stackAnchorsRef.current[stackId] = { x: node.position.x, y: node.position.y }
        }

        const newId = nextId()
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

        // Wire callbacks for new node
        updatedNodes = updatedNodes.map((n: any) =>
          n.id === newId
            ? {
                ...n,
                data: {
                  ...n.data,
                  onChange: (txt: string) =>
                    setNodes((inner) => {
                      const withText2 = inner.map((ni: any) =>
                        ni.id === newId ? { ...ni, data: { ...ni.data, text: txt } } : ni
                      )
                      return applyStackLayout(stackId, withText2)
                    }),
                  onAdd: () => addBelow(newId),
                  onHeightChange: handleHeightChange,
                  onTabNext: (id: string) => tabHandlers.current.handleTabNext?.(id),
                  onTabPrev: (id: string) => tabHandlers.current.handleTabPrev?.(id),
                  onSlashCommand: handleSlashCommand,
                  onDelete: handleDelete,
                  onSplit: handleSplit,
                  onMergeUp: handleMergeUp,
                },
              }
            : n
        )

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

        const final = applyStackLayout(stackId, updatedNodes)
        setTimeout(() => nodeRefsMap.current[newId]?.current?.focus?.(), 50)
        return final
      })
    },
    [setNodes, ensureInsertionOrder, applyStackLayout, handleHeightChange, handleSlashCommand, handleDelete, handleMergeUp]
  )

  // Tab navigation registry (simple placeholder to allow external handlers later)
  const tabHandlers = useRef<{ handleTabNext?: (id: string) => void; handleTabPrev?: (id: string) => void }>(
    {}
  )

  // Drag indicator calc
  const calculateDropIndicator = useCallback((draggedNode: Node, allNodes: Node[]) => {
    const X_TOLERANCE = opts.xTolerance
    const draggedNodeId = draggedNode.id
    const pointerX = draggedNode.position.x
    const pointerY = draggedNode.position.y

    // Build stacks map
    const stacks: Record<string, Node[]> = {}
    ;(allNodes as any).forEach((n: any) => {
      const sid = n.data?.stackId
      if (n.type !== 'stackContainer' && sid) {
        if (!stacks[sid]) stacks[sid] = []
        stacks[sid].push(n)
      }
    })

    // Prefer original stack if aligned in X
    const startSid = dragStartStackIdRef.current
    const startAnchorX = dragStartAnchorXRef.current
    let targetStackId: string | null = null

    const alignedWithStart = startSid && Math.abs(pointerX - startAnchorX) <= X_TOLERANCE
    if (alignedWithStart && startSid && stacks[startSid]) {
      targetStackId = startSid
    } else {
      // Pick stack whose anchor X is within tolerance and closest in X
      let bestSid: string | null = null
      let bestDx = Infinity
      Object.keys(stacks).forEach((sid) => {
        const ax = stackAnchorsRef.current[sid]?.x ?? (stacks[sid] as any)[0].position.x
        const dx = Math.abs(pointerX - ax)
        if (dx <= X_TOLERANCE && dx < bestDx) {
          bestDx = dx
          bestSid = sid
        }
      })
      targetStackId = bestSid
    }

    if (!targetStackId) {
      return { show: false, targetStackId: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 } }
    }

    const stackBlocks = (stacks[targetStackId] as any)
      .filter((n: any) => n.id !== draggedNodeId)
      .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))

    let insertionIndex = stackBlocks.length
    let indicatorY = pointerY
    if (stackBlocks.length > 0) {
      for (let i = 0; i < stackBlocks.length; i++) {
        const block = stackBlocks[i]
        const blockHeight = block.data?.height || 24
        const blockMidY = block.position.y + blockHeight / 2
        if (pointerY < blockMidY) {
          insertionIndex = i
          indicatorY = block.position.y
          break
        }
        if (i === stackBlocks.length - 1) {
          insertionIndex = stackBlocks.length
          indicatorY = block.position.y + blockHeight
        }
      }
    } else {
      insertionIndex = 0
      indicatorY = pointerY
    }

    const anchorX = stackAnchorsRef.current[targetStackId]?.x ?? (stackBlocks[0]?.position.x ?? pointerX)
    const { x: vx, y: vy, zoom } = viewportRef.current
    const screenX = vx + anchorX * zoom
    const screenY = vy + indicatorY * zoom
    const screenW = opts.blockWidth * zoom

    return {
      show: true,
      targetStackId,
      insertionIndex,
      position: { x: screenX, y: screenY, width: screenW },
    }
  }, [opts.blockWidth, opts.xTolerance])

  // Event handlers
  const onNodeDragStart = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      // Container drag start: store initial position + original block positions
      if ((node as any).type === 'stackContainer') {
        const sid = (node as any).data?.stackId as string
        const orig: Record<string, { x: number; y: number }> = {}
        ;(nodesRef.current as any).forEach((n: any) => {
          if (n.type !== 'stackContainer' && n.data?.stackId === sid) {
            orig[n.id] = { x: n.position.x, y: n.position.y }
          }
        })
        containerDragStartRef.current = { pos: { x: node.position.x, y: node.position.y }, stackId: sid, origPositions: orig }
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
      dragStartAnchorXRef.current = stackAnchorsRef.current[stackId]?.x ?? stackNodes[0].position.x
    },
    []
  )

  const onNodeDrag = useCallback(
    (evt: React.MouseEvent, node: Node) => {
      // Container drag: move entire stack by fixed delta from drag start
      if ((node as any).type === 'stackContainer' && containerDragStartRef.current) {
        const start = containerDragStartRef.current
        const stackId = start.stackId
        const deltaX = node.position.x - start.pos.x
        const deltaY = node.position.y - start.pos.y
        setNodes((nds) => {
          const moved = (nds as any).map((n: any) => {
            if (n.type !== 'stackContainer' && n.data?.stackId === stackId) {
              const orig = start.origPositions[n.id]
              if (orig) {
                return { ...n, position: { x: orig.x + deltaX, y: orig.y + deltaY } }
              }
            }
            if (n.id === (node as any).id) return { ...n, position: node.position }
            return n
          })

          // Update anchor to new top during drag for smooth container alignment
          const stackBlocks = moved.filter((n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer')
          if (stackBlocks.length > 0) {
            const topBlock = [...stackBlocks].sort((a: any, b: any) => a.position.y - b.position.y)[0]
            stackAnchorsRef.current[stackId] = { x: topBlock.position.x, y: topBlock.position.y }
          }

          // Hide drop indicator during container drag
          setDropIndicator({ show: false, position: { x: 0, y: 0, width: 0 }, targetStackId: null, insertionIndex: -1 })
          return moved
        })
        return
      }

      const stackId = (node as any).data.stackId
      if (stackId && evt.shiftKey && opts.enableShiftGroupDrag) {
        setNodes((nds) => {
          const currentNode = nds.find((n) => n.id === node.id)
          if (!currentNode) return nds
          isDraggingStackRef.current = true
          const deltaX = node.position.x - currentNode.position.x
          const deltaY = node.position.y - currentNode.position.y
          const moved = (nds as any).map((n: any) => {
            if (n.data.stackId === stackId && n.id !== node.id) {
              return { ...n, position: { x: n.position.x + deltaX, y: n.position.y + deltaY } }
            }
            if (n.id === node.id) return { ...n, position: node.position }
            return n
          })
          setDropIndicator({ show: false, position: { x: 0, y: 0, width: 0 }, targetStackId: null, insertionIndex: -1 })
          return moved
        })
        return
      }

      const dropInfo = calculateDropIndicator(node, nodesRef.current)
      dropInfoRef.current = dropInfo
      setDropIndicator({
        show: dropInfo.show,
        position: dropInfo.position,
        targetStackId: dropInfo.targetStackId,
        insertionIndex: dropInfo.insertionIndex,
      })
    },
    [setNodes, calculateDropIndicator]
  )

  const onNodeDragStop = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      if ((node as any).type === 'stackContainer' && containerDragStartRef.current) {
        const stackId = (node as any).data.stackId
        setNodes((nds) => {
          const stackBlocks = (nds as any)
            .filter((n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer')
            .sort((a: any, b: any) => a.position.y - b.position.y)
          if (stackBlocks.length > 0) {
            stackAnchorsRef.current[stackId] = { x: stackBlocks[0].position.x, y: stackBlocks[0].position.y }
            const laidOut = calculateStackLayout(stackId, nds)
            return syncStackContainers(laidOut)
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

          let updatedNodes = nds.map((n: any) =>
            n.id === node.id ? { ...n, data: { ...n.data, stackId: newStackId } } : n
          )

          if (oldStackId && oldStackId !== newStackId) {
            const remaining = (updatedNodes as any)
              .filter((n: any) => n.data.stackId === oldStackId && n.type !== 'stackContainer')
              .sort((a: any, b: any) => a.position.y - b.position.y)
            if (remaining.length > 0) {
              updatedNodes = calculateStackLayout(oldStackId, updatedNodes)
              const initialTop = stackTopOnDragStartRef.current[oldStackId]
              const initialTopId = stackTopIdOnDragStartRef.current[oldStackId]
              if (typeof initialTop === 'number' && initialTopId) {
                const currentTopNode = (updatedNodes as any)
                  .filter((n: any) => n.data.stackId === oldStackId && n.type !== 'stackContainer')
                  .sort((a: any, b: any) => a.position.y - b.position.y)[0]
                if (currentTopNode && currentTopNode.id === initialTopId) {
                  const currentTop = currentTopNode.position.y
                  const anchorDelta = initialTop - currentTop
                  if (anchorDelta) {
                    updatedNodes = (updatedNodes as any).map((n: any) =>
                      n.data.stackId === oldStackId
                        ? { ...n, position: { ...n.position, y: n.position.y + anchorDelta } }
                        : n
                    )
                  }
                }
              }
            }
          }

          if (!isGroupDrag && newStackId) {
            updatedNodes = ensureInsertionOrder(newStackId, updatedNodes)
            const blocksAll = (updatedNodes as any).filter(
              (n: any) => n.data?.stackId === newStackId && n.type !== 'stackContainer'
            )
            const orderedAll = [...blocksAll].sort(
              (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
            )
            const dragged = (updatedNodes as any).find((n: any) => n.id === node.id)
            const othersOrdered = orderedAll.filter((b: any) => b.id !== node.id)

            const rawIndex = dropInfo.show ? dropInfo.insertionIndex : othersOrdered.length
            const insertIndex = Math.max(0, Math.min(othersOrdered.length, rawIndex))

            const reordered = [...othersOrdered.slice(0, insertIndex), dragged, ...othersOrdered.slice(insertIndex)]
            const idToOrder = new Map(reordered.map((b: any, i: number) => [b.id, i]))
            updatedNodes = (updatedNodes as any).map((n: any) =>
              n.data?.stackId === newStackId && n.type !== 'stackContainer'
                ? { ...n, data: { ...n.data, insertionOrder: idToOrder.get(n.id) } }
                : n
            )
            updatedNodes = calculateStackLayout(newStackId, updatedNodes)
          }

          if (isGroupDrag && oldStackId) {
            const top = (updatedNodes as any)
              .filter((n: any) => n.data?.stackId === oldStackId && n.type !== 'stackContainer')
              .sort((a: any, b: any) => a.position.y - b.position.y)[0]
            if (top) {
              stackAnchorsRef.current[oldStackId] = { x: top.position.x, y: top.position.y }
              updatedNodes = calculateStackLayout(oldStackId, updatedNodes)
            }
          }

          isDraggingStackRef.current = false
          dropInfoRef.current = { show: false, targetStackId: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 } }
          const final = updateBottomNodeFlags(updatedNodes)
          return syncStackContainers(final)
        })
      })
    },
    [setNodes, updateBottomNodeFlags, syncStackContainers, calculateStackLayout, ensureInsertionOrder]
  )

  const onMove = useCallback((_evt: any, viewport: { x: number; y: number; zoom: number }) => {
    viewportRef.current = viewport
  }, [])

  // Tab navigation behavior
  const handleTabNext = useCallback((currentId: string) => {
    const all = nodesRef.current as any
    const node = all.find((n: any) => n.id === currentId)
    if (!node) return
    const sid = node.data?.stackId
    if (!sid) {
      // Solo → start a stack and add below
      addBelow(currentId)
      return
    }
    const blocks = all
      .filter((n: any) => n.data?.stackId === sid && n.type !== 'stackContainer')
      .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))
    const idx = blocks.findIndex((b: any) => b.id === currentId)
    if (idx === -1 || idx === blocks.length - 1) {
      // At end → append
      addBelow(currentId)
      return
    }
    // Focus next
    const next = blocks[idx + 1]
    setTimeout(() => nodeRefsMap.current[next.id]?.current?.focus?.(), 0)
  }, [addBelow])

  const handleTabPrev = useCallback((currentId: string) => {
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
  }, [])

  // Expose tab handlers so renderer callbacks call these
  useEffect(() => {
    tabHandlers.current.handleTabNext = handleTabNext
    tabHandlers.current.handleTabPrev = handleTabPrev
  }, [handleTabNext, handleTabPrev])

  // nodeTypes mapping
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      block: (props: any) => <NotionBlock {...props} />,
      stackContainer: (props: any) => <StackContainer {...props} />,
    }),
    []
  )

  // Initialize nodes
  useEffect(() => {
    if (nodesRef.current.length > 0) return

    const initial: InitialBlock[] = args?.controlled?.value ?? args?.initialBlocks ?? [{ text: '' }]

    const created: Node[] = initial.map((blk, idx) => {
      const id = blk.id ?? nextId()
      if (!nodeRefsMap.current[id]) nodeRefsMap.current[id] = { current: null }
      const x = 100
      const y = 100 + idx * 28
      const data: BlockData = {
        text: blk.text ?? '',
        height: 24,
        insertionOrder: idx,
        isBottomNode: idx === initial.length - 1,
        focusRef: nodeRefsMap.current[id],
      }
      const node: Node = {
        id,
        type: 'block',
        position: { x, y },
        dragHandle: '.drag-handle',
        data,
      }
      return node
    })

    // Wire callbacks and stack up if more than one
    const stackId = created[0]?.id
    const withStack = created.map((n) => ({
      ...n,
      data: { ...(n.data as BlockData), stackId: created.length > 1 ? stackId : (n.data as any).stackId },
    }))

    const wired = withStack.map((n) => ({
      ...n,
      data: {
        ...(n.data as BlockData),
        onChange: (txt: string) =>
          setNodes((inner) => inner.map((ni: any) => (ni.id === n.id ? { ...ni, data: { ...ni.data, text: txt } } : ni))),
        onAdd: () => addBelow(n.id),
        onHeightChange: handleHeightChange,
        onTabNext: (id: string) => tabHandlers.current.handleTabNext?.(id),
        onTabPrev: (id: string) => tabHandlers.current.handleTabPrev?.(id),
        onSlashCommand: handleSlashCommand,
        onDelete: handleDelete,
        onSplit: handleSplit,
        onMergeUp: handleMergeUp,
      } as BlockData,
    }))

    let laidOut = wired
    if (created.length > 1) {
      stackAnchorsRef.current[stackId!] = { x: created[0].position.x, y: created[0].position.y }
      laidOut = applyStackLayout(stackId!, wired)
    } else {
      laidOut = syncStackContainers(wired)
    }

    setNodes(laidOut)
  }, [args?.initialBlocks, args?.controlled, setNodes, addBelow, handleHeightChange, handleSlashCommand, handleDelete, handleSplit, handleMergeUp, applyStackLayout, syncStackContainers])

  const overlays = (
    <>
      {slashMenu && (
        <SlashMenu
          position={slashMenu.position}
          onSelect={onSlashMenuSelect}
          onClose={() => setSlashMenu(null)}
        />
      )}
      <DropIndicator show={dropIndicator.show} position={dropIndicator.position} />
    </>
  )

  return {
    nodes,
    nodeTypes,
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onMove,
    focus,
    addBelow,
    split: handleSplit,
    delete: handleDelete,
    overlays,
  }
}

export default useStackEditor
