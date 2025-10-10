import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNodesState, type Node, type NodeTypes } from '@xyflow/react'
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
import { useStackLayout } from './hooks/useStackLayout'
import { useStackDrag } from './hooks/useStackDrag'
import { useBlockOperations, type NodeRefsMap } from './hooks/useBlockOperations'
import { useKeyboardNav, useTabHandlers } from './hooks/useKeyboardNav'
import { nextBlockId } from './logic/stackState'
import { updateBottomNodeFlags } from './logic/stackLayout'

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

export function useStackEditor(args?: StackEditorHookArgs): StackEditorHookResult {
  const opts = { ...DEFAULTS, ...(args?.options || {}) }

  // Core state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const nodesRef = useRef<Node[]>([])
  const nodeRefsMap = useRef<NodeRefsMap>({})
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })

  // Slash menu state
  const [slashMenu, setSlashMenu] = useState<null | { nodeId: string; position: { x: number; y: number } }>(null)

  // Update nodes ref
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // Layout management
  const { applyLayout, syncContainers } = useStackLayout({
    blockWidth: opts.blockWidth,
    gap: opts.gap,
    headerHeight: opts.headerHeight,
  })

  // Height change handler
  const handleHeightChange = useCallback(
    (nodeId: string, newHeight: number) => {
      setNodes((nds) => {
        let updated = nds.map((n: any) =>
          n.id === nodeId ? { ...n, data: { ...n.data, height: newHeight } } : n
        )
        const changedNode = updated.find((n) => n.id === nodeId) as any
        if (changedNode?.data?.stackId) {
          return applyLayout(changedNode.data.stackId, updated)
        }
        return syncContainers(updated)
      })
    },
    [setNodes, applyLayout, syncContainers]
  )

  // Slash command handler
  const handleSlashCommand = useCallback(
    (nodeId: string, rectFromChild?: DOMRect | null) => {
      if (!opts.enableSlashMenu) return
      const rect =
        rectFromChild ||
        (document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement | null)?.getBoundingClientRect() ||
        null
      if (!rect) return
      setSlashMenu({ nodeId, position: { x: rect.left, y: rect.top } })
    },
    [opts.enableSlashMenu]
  )

  const onSlashMenuSelect = useCallback((item: SlashMenuItem) => {
    console.log('Selected:', item.id)
    setSlashMenu(null)
  }, [])

  // Create tabHandlers ref early
  const tabHandlers = useRef<{ handleTabNext?: (id: string) => void; handleTabPrev?: (id: string) => void }>({})

  // Block operations
  const blockOps = useBlockOperations(
    {
      nodeRefsMap,
      nodesRef,
      applyLayout,
      syncContainers,
      handleHeightChange,
      handleSlashCommand,
      tabHandlersRef: tabHandlers,
    },
    setNodes
  )

  // Keyboard navigation
  const keyboardNav = useKeyboardNav({
    nodesRef,
    nodeRefsMap,
    addBelow: blockOps.addBelow,
  })

  // Wire up tab handlers
  useEffect(() => {
    tabHandlers.current.handleTabNext = keyboardNav.handleTabNext
    tabHandlers.current.handleTabPrev = keyboardNav.handleTabPrev
  }, [keyboardNav.handleTabNext, keyboardNav.handleTabPrev])

  // Drag and drop
  const drag = useStackDrag({
    xTolerance: opts.xTolerance,
    blockWidth: opts.blockWidth,
    enableShiftGroupDrag: opts.enableShiftGroupDrag,
    gap: opts.gap,
    headerHeight: opts.headerHeight,
  })

  // Viewport tracking
  const onMove = useCallback((_evt: any, viewport: { x: number; y: number; zoom: number }) => {
    viewportRef.current = viewport
  }, [])

  // Public API
  const focus = useCallback((blockId: string) => {
    nodeRefsMap.current[blockId]?.current?.focus?.()
  }, [])

  // Node types
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
      const id = blk.id ?? nextBlockId()
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
      return {
        id,
        type: 'block',
        position: { x, y },
        dragHandle: '.drag-handle',
        data,
      } as Node
    })

    // Set up initial stack if multiple blocks
    const stackId = created[0]?.id
    const withStack = created.map((n) => ({
      ...n,
      data: { ...(n.data as BlockData), stackId: created.length > 1 ? stackId : (n.data as any).stackId },
    }))

    // Wire up callbacks
    const wired = withStack.map((n) => ({
      ...n,
      data: {
        ...(n.data as BlockData),
        onChange: (txt: string) =>
          setNodes((inner) => inner.map((ni: any) => (ni.id === n.id ? { ...ni, data: { ...ni.data, text: txt } } : ni))),
        onAdd: () => blockOps.addBelow(n.id),
        onHeightChange: handleHeightChange,
        onTabNext: (id: string) => tabHandlers.current.handleTabNext?.(id),
        onTabPrev: (id: string) => tabHandlers.current.handleTabPrev?.(id),
        onSlashCommand: handleSlashCommand,
        onDelete: blockOps.handleDelete,
        onSplit: blockOps.handleSplit,
        onMergeUp: blockOps.handleMergeUp,
      } as BlockData,
    }))

    // Apply layout (sync containers will handle parent-child setup)
    let laidOut: Node[] = wired
    if (created.length > 1) {
      laidOut = applyLayout(stackId!, wired) as Node[]
    } else {
      laidOut = syncContainers(wired) as Node[]
    }

    setNodes(laidOut)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args?.initialBlocks, args?.controlled])

  // Overlays
  const overlays = (
    <>
      {slashMenu && (
        <SlashMenu position={slashMenu.position} onSelect={onSlashMenuSelect} onClose={() => setSlashMenu(null)} />
      )}
      <DropIndicator show={drag.dropIndicator.show} position={drag.dropIndicator.position} />
    </>
  )

  return {
    nodes,
    nodeTypes,
    onNodesChange,
    onNodeDragStart: (evt, node) => drag.onNodeDragStart(evt, node, nodesRef),
    onNodeDrag: (evt, node) => drag.onNodeDrag(evt, node, nodesRef, setNodes, viewportRef),
    onNodeDragStop: (evt, node) => drag.onNodeDragStop(evt, node, setNodes, updateBottomNodeFlags, syncContainers),
    onMove,
    focus,
    addBelow: blockOps.addBelow,
    split: blockOps.handleSplit,
    delete: blockOps.handleDelete,
    overlays,
  }
}

export default useStackEditor
