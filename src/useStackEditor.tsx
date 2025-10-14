import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNodesState, applyNodeChanges, useStoreApi, type Node, type NodeTypes, type NodeChange } from '@xyflow/react'
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
  RichTextPayload,
} from './types'
import { useStackLayout } from './hooks/useStackLayout'
import { useStackDrag } from './hooks/useStackDrag'
import { useBlockOperations, type NodeRefsMap } from './hooks/useBlockOperations'
import { useKeyboardNav, useTabHandlers } from './hooks/useKeyboardNav'
import { nextBlockId, nextStackId } from './logic/stackState'
import { updateBottomNodeFlags } from './logic/stackLayout'
import { sanitizeAndSave } from './utils/sanitizeHTML'
import { createEmptyPayload, htmlToJson, jsonToHtml, ensureJsonContent, CURRENT_SCHEMA_VERSION } from './editor/richText'

// Default options
const DEFAULTS: Required<StackEditorOptions> = {
  blockWidth: 242,
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

  // Active resize tracking
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

        // Skip layout sync during active resize to avoid width conflicts
        if (!activeResizeContainerRef.current) {
          if (changedNode?.data?.stackId) {
            updated = applyLayout(changedNode.data.stackId, updated)
          } else {
            updated = syncContainers(updated)
          }
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

  // Create keyboard navigation handlers ref early
  const tabHandlers = useRef<{ handleTabNext?: (id: string) => void; handleTabPrev?: (id: string) => void; handleArrowUp?: (id: string) => void; handleArrowDown?: (id: string) => void }>({})

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

  // Wire up keyboard navigation handlers
  useEffect(() => {
    tabHandlers.current.handleTabNext = keyboardNav.handleTabNext
    tabHandlers.current.handleTabPrev = keyboardNav.handleTabPrev
    tabHandlers.current.handleArrowUp = keyboardNav.handleArrowUp
    tabHandlers.current.handleArrowDown = keyboardNav.handleArrowDown
  }, [keyboardNav.handleTabNext, keyboardNav.handleTabPrev, keyboardNav.handleArrowUp, keyboardNav.handleArrowDown])

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
      activeResizeContainerRef.current = containerId
    },
    []
  )

  const onContainerResize = useCallback(
    (containerId: string, newWidth: number) => {
      const childWidth = newWidth - 8 // Account for container padding

      const setNodesFn = setNodesRef.current || setNodesBase
      setNodesFn((nds) =>
        nds.map((n: any) =>
          // Only update children - let React Flow handle container dimensions
          n.parentId === containerId
            ? {
                ...n,
                style: { ...n.style, width: childWidth },
                data: { ...n.data, width: childWidth },
              }
            : n
        )
      )
    },
    [setNodesBase]
  )

  const onContainerResizeEnd = useCallback(
    (containerId: string) => {
      // Get final width from React Flow
      const node = storeApi.getState().nodeLookup?.get(containerId)
      const finalWidth = (node as any)?.measured?.width || 200
      const childWidth = finalWidth - 8 // Account for container padding

      // Persist width to both container and children, then run layout sync
      const setNodesFn = setNodesRef.current || setNodesBase
      setNodesFn((nds) => {
        let updated = nds.map((n: any) =>
          n.id === containerId
            ? {
                ...n,
                style: { ...n.style, width: finalWidth },
                data: { ...n.data, width: finalWidth, manualWidth: finalWidth },
              }
            : n.parentId === containerId
            ? {
                ...n,
                style: { ...n.style, width: childWidth },
                data: { ...n.data, width: childWidth },
              }
            : n
        )

        // Now safe to run layout sync to recalculate heights
        updated = syncContainers(updated)

        return updated
      })

      // Clear active resize tracking
      activeResizeContainerRef.current = null
    },
    [storeApi, setNodesBase, syncContainers]
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
                onResize: onContainerResize,
                onResizeEnd: onContainerResizeEnd,
                getStackBlocks: () => {
                  const stackId = (n.data as any)?.stackId
                  if (!stackId) return []
                  return nodesRef.current
                    .filter((node: any) => node.type !== 'stackContainer' && node.data?.stackId === stackId)
                    .sort(
                      (a: any, b: any) => (a.data?.insertionOrder ?? 0) - (b.data?.insertionOrder ?? 0)
                    )
                },
                replaceStackContent: (
                  stackId: string,
                  blocks: Array<{ id?: string; content: RichTextPayload }>
                ) => blockOps.replaceStackContent(stackId, blocks),
              },
            }
          : n
      )
    },
    [onContainerResizeStart, onContainerResize, onContainerResizeEnd, blockOps]
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

    const initial: InitialBlock[] =
      args?.controlled?.value ?? args?.initialBlocks ?? [{}]

    const resolvePayload = (blk: InitialBlock): RichTextPayload => {
      if (blk.contentJson) {
        const json = ensureJsonContent(blk.contentJson)
        const html = sanitizeAndSave(jsonToHtml(json))
        return { json, html }
      }
      if (blk.html !== undefined) {
        const json = htmlToJson(blk.html)
        const html = sanitizeAndSave(blk.html)
        return { json, html }
      }
      return createEmptyPayload()
    }

    const created: Node[] = initial.map((blk, idx) => {
      const id = blk.id ?? nextBlockId()
      if (!nodeRefsMap.current[id]) nodeRefsMap.current[id] = { current: null }
      const x = 100
      const y = 100 + idx * 28
      const payload = resolvePayload(blk)
      const data: BlockData = {
        contentJson: payload.json,
        cachedHTML: payload.html,
        schemaVersion: CURRENT_SCHEMA_VERSION,
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
    const stackId = created.length > 1 ? nextStackId() : undefined
    const withStack = created.map((n) => ({
      ...n,
      data: { ...(n.data as BlockData), stackId },
    }))

    // Wire up callbacks
    const wired = withStack.map((n) => ({
      ...n,
      data: {
        ...(n.data as BlockData),
        onContentUpdate: (payload) =>
          setNodes((inner) => inner.map((ni: any) => (ni.id === n.id ? { ...ni, data: {
                ...(ni.data as BlockData),
                contentJson: ensureJsonContent(payload.json),
                cachedHTML: sanitizeAndSave(payload.html),
                schemaVersion: CURRENT_SCHEMA_VERSION,
              } } : ni))),
        onAdd: (initialContent?: RichTextPayload) => blockOps.addBelow(n.id, initialContent),
        onAddMultiple: (payloads: RichTextPayload[]) => blockOps.addMultipleBelow(n.id, payloads),
        onHeightChange: handleHeightChange,
        onTabNext: (id: string) => tabHandlers.current.handleTabNext?.(id),
        onTabPrev: (id: string) => tabHandlers.current.handleTabPrev?.(id),
        onArrowUp: (id: string) => tabHandlers.current.handleArrowUp?.(id),
        onArrowDown: (id: string) => tabHandlers.current.handleArrowDown?.(id),
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

  // Custom onNodesChange with position guard
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        // 1) Apply RF changes first
        let next = applyNodeChanges(changes, prev)

        // 2) Position guard: ignore child position changes during active resize
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
    [setNodes]
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
