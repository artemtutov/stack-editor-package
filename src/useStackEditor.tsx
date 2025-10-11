import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNodesState, applyNodeChanges, useStoreApi, type Node, type NodeTypes, type NodeChange } from '@xyflow/react'
import { useLiveResize } from './stores/useLiveResize'
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
  const [nodes, setNodesBase, onNodesChangeBase] = useNodesState<Node>([])
  const nodesRef = useRef<Node[]>([])
  const nodeRefsMap = useRef<NodeRefsMap>({})
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })
  const storeApi = useStoreApi()

  // Live resize state
  const liveResize = useLiveResize()
  const activeResizeContainerRef = useRef<string | null>(null)

  // Ref to hold callback injection function (populated later)
  const injectCallbacksRef = useRef<((nodes: Node[]) => Node[]) | null>(null)

  // Ref to hold wrapped setNodes function (populated later)
  const setNodesRef = useRef<((updater: Node[] | ((nodes: Node[]) => Node[])) => void) | null>(null)

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
      setNodesBase((nds) => {
        let updated = nds.map((n: any) =>
          n.id === nodeId ? { ...n, data: { ...n.data, height: newHeight } } : n
        )
        const changedNode = updated.find((n) => n.id === nodeId) as any
        if (changedNode?.data?.stackId) {
          updated = applyLayout(changedNode.data.stackId, updated)
        } else {
          updated = syncContainers(updated)
        }
        // Inject callbacks if injection function is ready
        return injectCallbacksRef.current ? injectCallbacksRef.current(updated) : updated
      })
    },
    [setNodesBase, applyLayout, syncContainers]
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

  // Wrapper setNodes function that uses ref (for early usage before setNodes is defined)
  const setNodesWrapper = useCallback(
    (updater: Node[] | ((nodes: Node[]) => Node[])) => {
      if (setNodesRef.current) {
        setNodesRef.current(updater)
      } else {
        // Fallback: use setNodesBase directly
        setNodesBase(updater)
      }
    },
    [setNodesBase]
  )

  // Block operations (will use syncContainers directly, callbacks injected later)
  const blockOps = useBlockOperations(
    {
      nodeRefsMap,
      nodesRef,
      applyLayout,
      syncContainers,
      handleHeightChange,
      handleSlashCommand,
      tabHandlersRef: tabHandlers,
      gap: opts.gap,
      blockWidth: opts.blockWidth,
      headerHeight: opts.headerHeight,
    },
    setNodesWrapper
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

  // Resize callbacks
  const onContainerResizeStart = useCallback(
    (containerId: string, side: 'left' | 'right') => {
      const node = storeApi.getState().nodeLookup?.get(containerId)
      const width =
        (node as any)?.measured?.width ||
        (nodesRef.current.find((n) => n.id === containerId) as any)?.data?.width ||
        200
      const x = (node as any)?.internals?.positionAbsolute?.x || 0

      console.log('🟢 Resize start:', { containerId, side, width, x })
      activeResizeContainerRef.current = containerId
      liveResize.startResize(containerId, side, width, x)
    },
    [storeApi, liveResize]
  )

  const onContainerResizeEnd = useCallback(
    (containerId: string) => {
      const resizeState = liveResize.getState(containerId)
      if (!resizeState) return

      // Persist final width once
      const node = storeApi.getState().nodeLookup?.get(containerId)
      const finalWidth = (node as any)?.measured?.width || resizeState.startWidth

      setNodesBase((nds) => {
        const updated = nds.map((n: any) =>
          n.id === containerId
            ? {
                ...n,
                style: { ...n.style, width: finalWidth },
                data: { ...n.data, width: finalWidth, manualWidth: finalWidth },
              }
            : n
        )
        // Inject callbacks if injection function is ready
        return injectCallbacksRef.current ? injectCallbacksRef.current(updated) : updated
      })

      // Clear resize state
      activeResizeContainerRef.current = null
      liveResize.endResize(containerId)
    },
    [liveResize, storeApi, setNodesBase]
  )

  // Inject resize callbacks into container nodes
  const injectContainerCallbacks = useCallback(
    (nodes: Node[]) => {
      return nodes.map((n: any) =>
        n.type === 'stackContainer'
          ? {
              ...n,
              data: {
                ...n.data,
                onResizeStart: onContainerResizeStart,
                onResizeEnd: onContainerResizeEnd,
              },
            }
          : n
      )
    },
    [onContainerResizeStart, onContainerResizeEnd]
  )

  // Populate ref for use in early callbacks
  injectCallbacksRef.current = injectContainerCallbacks

  // Wrapped setNodes that automatically injects callbacks
  const setNodes = useCallback(
    (updater: Node[] | ((nodes: Node[]) => Node[])) => {
      setNodesBase((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        return injectContainerCallbacks(next)
      })
    },
    [setNodesBase, injectContainerCallbacks]
  )

  // Populate ref for use in early callbacks
  setNodesRef.current = setNodes

  // Wrapped syncContainers that also injects callbacks
  const syncContainersWithCallbacks = useCallback(
    (nodes: Node[]) => {
      const synced = syncContainers(nodes)
      return injectContainerCallbacks(synced)
    },
    [syncContainers, injectContainerCallbacks]
  )

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

    // Inject resize callbacks into containers
    laidOut = injectContainerCallbacks(laidOut)

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

  // Custom onNodesChange with position guard and dx calculation
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        // 1) Apply RF changes first
        let next = applyNodeChanges(changes, prev)

        // 2) Handle dimension changes for containers during resize
        for (const change of changes as any) {
          if (change.type !== 'dimensions') continue

          const container = next.find((n) => n.id === change.id)
          if ((container as any)?.type !== 'stackContainer') continue

          const resizeState = liveResize.getState(change.id)
          if (!resizeState) continue

          // Get current width from change or node lookup
          const node = storeApi.getState().nodeLookup?.get(change.id)
          const currentWidth = change.dimensions?.width || (node as any)?.measured?.width || resizeState.startWidth

          // Mirror container width to children (accounting for padding)
          const childWidth = currentWidth - 8 // 4px left + 4px right padding
          next = next.map((n: any) =>
            n.parentId === change.id
              ? {
                  ...n,
                  style: { ...n.style, width: childWidth },
                  data: { ...n.data, width: childWidth },
                }
              : n
          )
        }

        // 3) Position guard: ignore child position changes during active resize
        const activeContainerId = activeResizeContainerRef.current
        if (activeContainerId) {
          for (const change of changes as any) {
            if (change.type === 'position') {
              const node = next.find((n) => n.id === change.id)
              if ((node as any)?.parentId === activeContainerId) {
                // Rollback this child's position by keeping the previous version
                const prevNode = prev.find((n) => n.id === change.id)
                if (prevNode) {
                  next = next.map((n) => (n.id === change.id ? prevNode : n))
                }
              }
            }
          }
        }

        return next
      })
    },
    [setNodes, liveResize, storeApi]
  )

  return {
    nodes,
    nodeTypes,
    onNodesChange,
    onNodeDragStart: (evt, node) => drag.onNodeDragStart(evt, node, nodesRef),
    onNodeDrag: (evt, node) => drag.onNodeDrag(evt, node, nodesRef, setNodes, viewportRef),
    onNodeDragStop: (evt, node) => drag.onNodeDragStop(evt, node, setNodes, updateBottomNodeFlags, syncContainersWithCallbacks),
    onMove,
    focus,
    addBelow: blockOps.addBelow,
    split: blockOps.handleSplit,
    delete: blockOps.handleDelete,
    overlays,
  }
}

export default useStackEditor
