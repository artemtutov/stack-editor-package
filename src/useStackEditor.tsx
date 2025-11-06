import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  useStoreApi,
  useReactFlow,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeChange,
  MarkerType,
  ConnectionMode,
} from '@xyflow/react'
import type { Editor } from '@tiptap/core'
import NotionBlock from './renderers/NotionBlock'
import StackContainer from './renderers/StackContainer'
import SlashMenu, { type SlashMenuItem } from './renderers/SlashMenu'
import DropIndicator from './renderers/DropIndicator'
import type {
  BlockData,
  StackContainerData,
  StackEditorHookArgs,
  StackEditorHookResult,
  InitialBlock,
  StackEditorOptions,
  RichTextPayload,
  SlashPayload,
  StackSnapshot,
  ChangeEvent,
  ChangeListener,
  StackEdge,
} from './types'
import { STACK_SNAPSHOT_VERSION } from './types'
import { useStackLayout } from './hooks/useStackLayout'
import { useStackDrag } from './hooks/useStackDrag'
import { useBlockOperations, type NodeRefsMap } from './hooks/useBlockOperations'
import { useKeyboardNav, useTabHandlers } from './hooks/useKeyboardNav'
import { nextBlockId, nextStackId } from './logic/stackState'
import { updateBottomNodeFlags, getStackBlocks } from './logic/stackLayout'
import { sanitizeAndSave } from './utils/sanitizeHTML'
import { createEmptyPayload, htmlToJson, jsonToHtml, ensureJsonContent, CURRENT_SCHEMA_VERSION } from './editor/richText'
import { getAbsolutePosition, convertAbsoluteToRelative, convertRelativeToAbsolute, findIntersectingGroup } from './logic/grouping'
import { enableLogging, disableLogging } from './utils/setupLogger'
import { CanonicalNameRegistry, generateCanonicalName } from './logic/canonicalNames'
import { extractPreview, detectContentType, computeContentHashSync, PREVIEW_ALGO_VERSION, HASH_ALGO_VERSION } from './logic/contentHelpers'

// Default options
const DEFAULTS: Required<StackEditorOptions> = {
  blockWidth: 242,
  gap: 2,
  headerHeight: 28,
  enableContainerDrag: true,
  enableShiftGroupDrag: true,
  enableSlashMenu: true,
  enableAutoGrouping: true,
  groupNodeTypes: ['group'],
  xTolerance: 10,
  yHysteresis: 3,
  indicatorStabilityPx: 0.5,
  enableLogging: false,
}

/**
 * useStackEditor - Core hook for managing stacked block editor state.
 *
 * @description
 * Provides the complete editor state and API for building custom editor UIs.
 * Manages block creation, deletion, navigation, drag-and-drop, and layout.
 *
 * This hook is used internally by the StackEditor component, but can also be
 * used directly for more control over the editor's behavior.
 *
 * @param args - Editor configuration
 * @param args.initialBlocks - Initial blocks to render (optional)
 * @param args.options - Editor configuration options (optional)
 *
 * @returns Editor state and API
 * @returns nodes - React Flow nodes representing blocks and containers
 * @returns nodeTypes - Node type definitions for React Flow
 * @returns onNodesChange - Handler for React Flow node changes
 * @returns onNodeDragStart - Handler for drag start
 * @returns onNodeDrag - Handler for dragging
 * @returns onNodeDragStop - Handler for drag end
 * @returns onMove - Handler for viewport changes
 * @returns focus - Function to focus a specific block
 * @returns addBelow - Function to add a new block below another
 * @returns split - Function to split a block at cursor position
 * @returns delete - Function to delete a block
 * @returns overlays - React elements for modals, slash menu, drop indicators
 *
 * @example
 * ```tsx
 * import { useStackEditor } from '@stack-editor/react'
 * import { ReactFlow } from '@xyflow/react'
 *
 * function MyEditor() {
 *   const editor = useStackEditor({
 *     initialBlocks: [{ html: '<p>Hello</p>' }],
 *     options: { blockWidth: 300 }
 *   })
 *
 *   return (
 *     <>
 *       <ReactFlow
 *         nodes={editor.nodes}
 *         nodeTypes={editor.nodeTypes}
 *         onNodesChange={editor.onNodesChange}
 *         onNodeDragStart={editor.onNodeDragStart}
 *         onNodeDrag={editor.onNodeDrag}
 *         onNodeDragStop={editor.onNodeDragStop}
 *       />
 *       {editor.overlays}
 *     </>
 *   )
 * }
 * ```
 */
export function useStackEditor(args?: StackEditorHookArgs): StackEditorHookResult {
  const opts = { ...DEFAULTS, ...(args?.options || {}) }
  const callbacks = args?.callbacks || {}

  // Handle logging toggle
  useEffect(() => {
    if (opts.enableLogging) {
      enableLogging()
    } else {
      disableLogging()
    }
  }, [opts.enableLogging])

  // Core state
  const [nodes, setNodesBase, onNodesChangeBase] = useNodesState<Node>([])
  const nodesRef = useRef<Node[]>([])
  const nodeRefsMap = useRef<NodeRefsMap>({})
  const storeApi = useStoreApi()
  const reactFlowInstance = useReactFlow()

  // Edge state
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Active resize tracking
  const activeResizeContainerRef = useRef<string | null>(null)

  // Zoom state tracking for guarding layout recalculations
  const isZoomingRef = useRef<boolean>(false)
  const previousZoomRef = useRef<number>(1)
  const zoomDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSyncRef = useRef<boolean>(false)

  // Pan state tracking for guarding layout recalculations
  const isPanningRef = useRef<boolean>(false)
  const previousPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Ref to hold callback injection function (populated later)
  const injectCallbacksRef = useRef<((nodes: Node[]) => Node[]) | null>(null)

  // Ref to hold wrapped setNodes function (populated later)
  const setNodesRef = useRef<((updater: Node[] | ((nodes: Node[]) => Node[])) => void) | null>(null)

  // Ref to hold stack expand callbacks (stackId -> openFullscreen function)
  const stackExpandCallbacksRef = useRef<Map<string, () => void>>(new Map())

  // Slash menu state
  const [slashMenu, setSlashMenu] = useState<null | (SlashPayload & { position: { x: number; y: number } })>(null)

  // History/undo-redo state
  const isInTransactionRef = useRef(false)
  const transactionNameRef = useRef<string | undefined>(undefined)
  const changeListenersRef = useRef<Set<ChangeListener>>(new Set())
  const isRestoringRef = useRef(false)

  // Canonical name registry
  const canonicalNameRegistryRef = useRef(new CanonicalNameRegistry())

  // Update nodes ref
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // Listen for history:restoring event to cancel in-flight work
  useEffect(() => {
    const handleHistoryRestoring = () => {
      isRestoringRef.current = true
      // Cancel any in-flight layout/async work here if needed
      console.log('📦 Stack Editor: History restoring, pausing operations')

      // Reset after a brief delay
      setTimeout(() => {
        isRestoringRef.current = false
      }, 100)
    }

    window.addEventListener('history:restoring', handleHistoryRestoring)
    return () => {
      window.removeEventListener('history:restoring', handleHistoryRestoring)
    }
  }, [])

  // Helper to emit change events to listeners (moved early for callback dependencies)
  const emitChange = useCallback((event: ChangeEvent) => {
    // Skip emitting during transactions or restoration
    if (isInTransactionRef.current || isRestoringRef.current) return

    // Add event metadata if not present
    const enrichedEvent: ChangeEvent = {
      ...event,
      eventId: event.eventId ?? crypto.randomUUID(),
      timestamp: event.timestamp ?? Date.now(),
    }

    changeListenersRef.current.forEach(listener => {
      try {
        listener(enrichedEvent)
      } catch (err) {
        console.error('📦 Stack Editor: Error in change listener:', err)
      }
    })
  }, [])

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
        // Early-out: check if height actually changed (epsilon threshold)
        const existingNode = nds.find((n) => n.id === nodeId) as any
        const currentHeight = existingNode?.data?.height ?? 0
        if (Math.abs(currentHeight - newHeight) < 0.5) {
          return nds // No meaningful change, skip update
        }

        let updated = nds.map((n: any) =>
          n.id === nodeId ? { ...n, data: { ...n.data, height: newHeight } } : n
        )
        const changedNode = updated.find((n) => n.id === nodeId) as any

        // Skip layout sync during active resize to avoid width conflicts
        // Also skip during zoom or pan to prevent coordinate confusion
        if (!activeResizeContainerRef.current && !isZoomingRef.current && !isPanningRef.current) {
          if (changedNode?.data?.stackId) {
            updated = applyLayout(changedNode.data.stackId, updated)
          } else {
            updated = syncContainers(updated)
          }
        } else if (isZoomingRef.current || isPanningRef.current) {
          // Queue a sync for after viewport motion completes
          pendingSyncRef.current = true
        }

        // Inject callbacks if injection function is ready
        return injectCallbacksRef.current ? injectCallbacksRef.current(updated) : updated
      })
    },
    [setNodesBase, applyLayout, syncContainers]
  )

  // Slash command handler
  const handleSlashCommand = useCallback(
    (payload: SlashPayload) => {
      if (!opts.enableSlashMenu) return
      setSlashMenu({
        ...payload,
        position: payload.anchor,
      })
    },
    [opts.enableSlashMenu]
  )

  const onSlashMenuSelect = useCallback((item: SlashMenuItem) => {
    if (!slashMenu) return

    const editor = slashMenu.getEditor()
    if (!editor) {
      console.log('[SLASH MENU] No editor instance found')
      setSlashMenu(null)
      return
    }

    console.log('[SLASH MENU] Selected item:', item.id)
    console.log('[SLASH MENU] Range:', slashMenu.range)
    console.log('[SLASH MENU] Content before:', editor.getText())
    console.log('[SLASH MENU] Node type before:', editor.state.selection.$from.parent.type.name)

    // IMPORTANT: Delete the "/query" text and apply command in a SINGLE chain
    // Running them separately causes TipTap's selection state to get out of sync
    const chain = editor.chain().focus().deleteRange(slashMenu.range)

    // Apply the transformation command in the same chain
    switch (item.id) {
      case 'text':
        chain.setParagraph()
        break
      case 'heading1':
        chain.setHeading({ level: 1 })
        break
      case 'heading2':
        chain.setHeading({ level: 2 })
        break
      case 'heading3':
        chain.setHeading({ level: 3 })
        break
      case 'bulletlist':
        chain.clearNodes().toggleBulletList()
        break
      case 'numberlist':
        chain.clearNodes().toggleOrderedList()
        break
      case 'todo':
        chain.clearNodes().toggleTaskList?.()
        break
      case 'blockquote':
        chain.clearNodes().setBlockquote()
        break
    }

    // Execute the entire chain as one transaction
    chain.run()

    console.log('[SLASH MENU] Content after:', editor.getText())
    console.log('[SLASH MENU] Node type after:', editor.state.selection.$from.parent.type.name)

    // Close menu
    setSlashMenu(null)
  }, [slashMenu])

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
      canonicalNameRegistry: canonicalNameRegistryRef,
      emitChange,
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
    enableAutoGrouping: opts.enableAutoGrouping,
    groupNodeTypes: opts.groupNodeTypes,
    gap: opts.gap,
    headerHeight: opts.headerHeight,
  })

  // Viewport tracking with zoom and pan detection
  const onMove = useCallback((_evt: any, viewport: { x: number; y: number; zoom: number }) => {
    // Detect zoom changes
    const previousZoom = previousZoomRef.current
    const currentZoom = viewport.zoom

    if (Math.abs(previousZoom - currentZoom) > 0.001) {
      // Zoom changed - set flag and start debounce timer
      isZoomingRef.current = true
      previousZoomRef.current = currentZoom

      // Clear any existing timer
      if (zoomDebounceTimerRef.current) {
        clearTimeout(zoomDebounceTimerRef.current)
      }

      // Set new timer - flag clears 100ms after last zoom change
      zoomDebounceTimerRef.current = setTimeout(() => {
        isZoomingRef.current = false

        // Run queued sync if needed
        if (pendingSyncRef.current) {
          pendingSyncRef.current = false
          setNodesBase((nds) => {
            const synced = syncContainers(nds)
            const updated = updateBottomNodeFlags(synced)
            return injectCallbacksRef.current ? injectCallbacksRef.current(updated) : updated
          })
        }
      }, 100)
    }

    // Detect pan (translate) changes
    const prevPan = previousPanRef.current
    const panDeltaX = Math.abs(viewport.x - prevPan.x)
    const panDeltaY = Math.abs(viewport.y - prevPan.y)
    previousPanRef.current = { x: viewport.x, y: viewport.y }

    if (panDeltaX > 0.5 || panDeltaY > 0.5) {
      isPanningRef.current = true

      if (panDebounceTimerRef.current) {
        clearTimeout(panDebounceTimerRef.current)
      }

      // Clear pan flag shortly after last pan update
      panDebounceTimerRef.current = setTimeout(() => {
        isPanningRef.current = false

        if (pendingSyncRef.current) {
          pendingSyncRef.current = false
          setNodesBase((nds) => {
            const synced = syncContainers(nds)
            const updated = updateBottomNodeFlags(synced)
            return injectCallbacksRef.current ? injectCallbacksRef.current(updated) : updated
          })
        }
      }, 100)
    }
  }, [syncContainers, setNodesBase])

  // Public API
  const focus = useCallback((blockId: string) => {
    nodeRefsMap.current[blockId]?.current?.focus?.()
  }, [])

  // Get current blocks in InitialBlock format (for saving)
  const getBlocks = useCallback((): InitialBlock[] => {
    // Get all container nodes for position lookup
    const containers = nodesRef.current.filter(n => n.type === 'stackContainer')

    return nodesRef.current
      .filter(n => n.type === 'block')
      .sort((a: any, b: any) =>
        ((a.data as BlockData).insertionOrder ?? 0) -
        ((b.data as BlockData).insertionOrder ?? 0)
      )
      .map((n: any) => {
        const data = n.data as BlockData
        const block: InitialBlock = {
          id: n.id,
          canonicalName: data.canonicalName,
          contentJson: data.contentJson,
          html: data.cachedHTML,
          contentPreview: data.contentPreview,
          contentType: data.contentType,
          contentHash: data.contentHash,
          stackIndex: data.stackIndex,
        }

        // Preserve position, parentId, extent, stackId
        if (n.position) {
          block.position = { x: n.position.x, y: n.position.y }
        }
        if (n.parentId) {
          block.parentId = n.parentId
        }
        if (n.extent) {
          block.extent = n.extent
        }
        if (data.stackId) {
          block.stackId = data.stackId

          // Save container position and canonical name for stack persistence
          const container = containers.find(c => c.id === data.stackId)
          if (container?.position) {
            block.containerPosition = { x: container.position.x, y: container.position.y }
          }
          if (container?.data) {
            const containerData = container.data as any
            if (containerData.canonicalName) {
              block.containerCanonicalName = containerData.canonicalName
            }
          }
          // Save container grouping info (for grouped containers)
          if (container?.parentId) {
            block.containerParentId = container.parentId
          }
          if (container?.extent === 'parent') {
            block.containerExtent = container.extent
          }
        }

        return block
      })
  }, [])

  // Edge operations
  const onConnect = useCallback((params: Connection) => {
    const edge: Edge = {
      ...params,
      id: `e-${params.source}-${params.target}-${Date.now()}`,
      type: 'floating',
      style: {
        stroke: 'rgb(35, 131, 226)', // Notion blue
        strokeWidth: 2,
        strokeLinecap: 'round',
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'rgb(35, 131, 226)',
      },
    }
    setEdges((eds) => addEdge(edge, eds))
  }, [setEdges])

  const getEdges = useCallback((): StackEdge[] => {
    return edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    }))
  }, [edges])

  // Load initial edges
  useEffect(() => {
    if (args?.initialEdges && args.initialEdges.length > 0) {
      const initialEdges: Edge[] = args.initialEdges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: 'floating',
        style: {
          stroke: 'rgb(35, 131, 226)',
          strokeWidth: 2,
          strokeLinecap: 'round',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'rgb(35, 131, 226)',
        },
      }))
      setEdges(initialEdges)
    }
  }, []) // Only run once on mount

  // Create a new block imperatively (without full reinitialization)
  const createBlock = useCallback((block: Partial<InitialBlock>): { id: string; canonicalName: string } => {
    const id = block.id ?? nextBlockId()
    if (!nodeRefsMap.current[id]) nodeRefsMap.current[id] = { current: null }

    // Resolve content payload
    let payload: RichTextPayload
    if (block.contentJson) {
      const json = ensureJsonContent(block.contentJson)
      const html = sanitizeAndSave(jsonToHtml(json))
      payload = { json, html }
    } else if (block.html) {
      const json = htmlToJson(block.html)
      const html = sanitizeAndSave(block.html)
      payload = { json, html }
    } else {
      payload = createEmptyPayload()
    }

    // Generate or use provided canonical name
    const canonicalName = block.canonicalName ?? generateCanonicalName('block', id)

    // Register canonical name (will throw if conflict)
    canonicalNameRegistryRef.current.register(canonicalName, id, 'block')

    // Compute content helpers
    const contentPreview = extractPreview(payload.json)
    const contentType = detectContentType(payload.json)
    const contentHash = computeContentHashSync(payload.json)

    // Get current max insertion order
    const maxOrder = nodesRef.current
      .filter(n => n.type === 'block')
      .reduce((max, n: any) => Math.max(max, (n.data as BlockData).insertionOrder ?? 0), -1)

    // Calculate stack index if part of a stack
    let stackIndex: number | undefined
    if (block.stackId) {
      const stackBlocks = nodesRef.current.filter(
        n => n.type === 'block' && (n.data as BlockData).stackId === block.stackId
      )
      stackIndex = block.stackIndex ?? stackBlocks.length
    }

    // Create block data
    const data: BlockData = {
      canonicalName,
      contentJson: payload.json,
      cachedHTML: payload.html,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      contentPreview,
      contentType,
      contentHash,
      height: 24,
      insertionOrder: maxOrder + 1,
      isBottomNode: true,  // New blocks are always at bottom initially
      focusRef: nodeRefsMap.current[id],
      stackId: block.stackId,
      stackIndex,
    }

    // Build node
    const newNode: Node = {
      id,
      type: 'block',
      position: block.position ?? { x: 100, y: 100 },
      dragHandle: '.drag-handle',
      data,
    }

    // Apply optional fields
    if (block.parentId) {
      newNode.parentId = block.parentId
    }
    if (block.extent) {
      newNode.extent = block.extent
    }

    // Add the new node and wire up callbacks
    setNodes((prevNodes) => {
      // Update isBottomNode flags
      const updated = prevNodes.map((n: any) =>
        n.type === 'block'
          ? { ...n, data: { ...n.data, isBottomNode: false } }
          : n
      )

      // Wire callbacks for new node
      const wired = {
        ...newNode,
        data: {
          ...(newNode.data as BlockData),
          onContentUpdate: (payload: RichTextPayload) =>
            setNodes((inner) => inner.map((ni: any) => {
              if (ni.id === id) {
                const json = ensureJsonContent(payload.json)
                const html = sanitizeAndSave(payload.html)
                // Recompute content helpers on content change
                const contentPreview = extractPreview(json)
                const contentType = detectContentType(json)
                const contentHash = computeContentHashSync(json)
                return {
                  ...ni,
                  data: {
                    ...(ni.data as BlockData),
                    contentJson: json,
                    cachedHTML: html,
                    schemaVersion: CURRENT_SCHEMA_VERSION,
                    contentPreview,
                    contentType,
                    contentHash,
                  }
                }
              }
              return ni
            })),
          onContentCommit: () => {
            // Get current block data to include in event
            const currentNode = nodesRef.current.find(n => n.id === id)
            const currentData = currentNode?.data as BlockData | undefined
            emitChange({
              type: 'content.commit',
              blockId: id,
              canonicalName: currentData?.canonicalName,
              contentHash: currentData?.contentHash,
              contentPreview: currentData?.contentPreview,
              contentType: currentData?.contentType,
            })
          },
          onAdd: (initialContent?: RichTextPayload) => blockOps.addBelow(id, initialContent),
          onAddMultiple: (payloads: RichTextPayload[]) => blockOps.addMultipleBelow(id, payloads),
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
      }

      return syncContainers([...updated, wired]) as Node[]
    })

    // Emit block.create event
    emitChange({
      type: 'block.create',
      blockId: id,
      canonicalName,
      stackId: block.stackId,
      stackIndex,
      contentPreview,
      contentType,
      contentHash,
    })

    return { id, canonicalName }
  }, [blockOps, handleHeightChange, handleSlashCommand, syncContainers, emitChange])

  // Load blocks imperatively (replaces all blocks, used for canvas load)
  const loadBlocks = useCallback((blocks: InitialBlock[]) => {
    // Helper to resolve payload
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

    // 1. Extract container data from blocks
    const containerData = new Map<string, { position: { x: number; y: number }; parentId?: string; extent?: 'parent' }>()
    blocks.forEach(blk => {
      if (blk.containerPosition && blk.stackId) {
        containerData.set(blk.stackId, {
          position: blk.containerPosition,
          parentId: blk.containerParentId,
          extent: blk.containerExtent,
        })
      }
    })

    // 2. Pre-create container nodes with saved positions and grouping info
    const preCreatedContainers: Node[] = Array.from(containerData).map(([id, data]) => {
      // Get canonical name from first block in this stack or generate one
      const firstBlockInStack = blocks.find(b => b.stackId === id)
      let containerCanonicalName = firstBlockInStack?.containerCanonicalName
      if (!containerCanonicalName) {
        containerCanonicalName = generateCanonicalName('stack', id)
      }

      const container: Node = {
        id,
        type: 'stackContainer',
        position: data.position,
        style: { width: opts.blockWidth + 8 },
        data: {
          canonicalName: containerCanonicalName,
          stackId: id,
          width: opts.blockWidth + 8,
          manualWidth: undefined,
          isDragging: false,
        },
      }
      // Restore container grouping if it was grouped
      if (data.parentId) container.parentId = data.parentId
      if (data.extent) container.extent = data.extent
      return container
    })

    // 3. Clear and rebuild canonical name registry
    canonicalNameRegistryRef.current.clear()

    // Register container canonical names
    preCreatedContainers.forEach(container => {
      const canonicalName = (container.data as StackContainerData).canonicalName
      if (canonicalName) {
        try {
          canonicalNameRegistryRef.current.register(canonicalName, container.id, 'stack')
        } catch (err: any) {
          console.error(`📦 Stack Editor: Canonical name conflict for container "${canonicalName}":`, err.message)
          // Auto-generate unique name as fallback
          const uniqueName = canonicalNameRegistryRef.current.generateUniqueName(canonicalName)
          canonicalNameRegistryRef.current.register(uniqueName, container.id, 'stack')
          // Update container data with new name
          ;(container.data as StackContainerData).canonicalName = uniqueName
          console.warn(`📦 Stack Editor: Auto-resolved container conflict with name "${uniqueName}"`)
        }
      }
    })

    // 4. Create nodes from blocks
    const created: Node[] = blocks.map((blk, idx) => {
      const id = blk.id ?? nextBlockId()
      if (!nodeRefsMap.current[id]) nodeRefsMap.current[id] = { current: null }

      const x = blk.position?.x ?? 100
      const y = blk.position?.y ?? (100 + idx * 28)

      const payload = resolvePayload(blk)

      // Generate or use provided canonical name
      let canonicalName = blk.canonicalName
      if (!canonicalName) {
        canonicalName = generateCanonicalName('block', id)
        console.warn(`📦 Stack Editor: Generated canonical name "${canonicalName}" for block "${id}" (missing on load)`)
      }

      // Register canonical name (will throw if conflict)
      try {
        canonicalNameRegistryRef.current.register(canonicalName, id, 'block')
      } catch (err: any) {
        console.error(`📦 Stack Editor: Canonical name conflict for "${canonicalName}":`, err.message)
        // Auto-generate unique name as fallback
        canonicalName = canonicalNameRegistryRef.current.generateUniqueName(canonicalName)
        canonicalNameRegistryRef.current.register(canonicalName, id, 'block')
        console.warn(`📦 Stack Editor: Auto-resolved conflict with name "${canonicalName}"`)
      }

      // Compute or validate content helpers
      let contentPreview = blk.contentPreview
      let contentType = blk.contentType
      let contentHash = blk.contentHash

      // Recompute if missing or potentially stale (no version check for now, always trust provided values)
      if (!contentPreview || !contentType || !contentHash) {
        contentPreview = extractPreview(payload.json)
        contentType = detectContentType(payload.json)
        contentHash = computeContentHashSync(payload.json)
        console.warn(`📦 Stack Editor: Recomputed content helpers for block "${canonicalName}" (missing on load)`)
      }

      const data: BlockData = {
        canonicalName,
        contentJson: payload.json,
        cachedHTML: payload.html,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        contentPreview,
        contentType,
        contentHash,
        height: 24,
        insertionOrder: idx,
        isBottomNode: idx === blocks.length - 1,
        focusRef: nodeRefsMap.current[id],
        stackId: blk.stackId,
        stackIndex: blk.stackIndex,
      }

      const node: Node = {
        id,
        type: 'block',
        position: { x, y },
        dragHandle: '.drag-handle',
        data,
      }

      if (blk.parentId) node.parentId = blk.parentId
      if (blk.extent) node.extent = blk.extent

      return node as Node
    })

    // 4. Combine containers and blocks, then wire up callbacks
    const combined = [...preCreatedContainers, ...created]
    const wired = combined.map((n) => {
      // Only wire callbacks for blocks, not containers
      if (n.type !== 'block') return n

      return {
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
          onContentCommit: () => {
            emitChange({ type: 'content.commit', blockId: n.id })
          },
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
      }
    })

    // 5. Apply layout - syncContainers will see existing containers and preserve their positions
    const laidOut = syncContainers(wired) as Node[]
    setNodes(laidOut)
  }, [blockOps, handleHeightChange, handleSlashCommand, syncContainers, opts.blockWidth, emitChange])

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
                position: n.position,
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
                registerStackExpand: (stackId: string, openFn: () => void) => {
                  stackExpandCallbacksRef.current.set(stackId, openFn)
                },
                onToggleSidebar: callbacks.onToggleSidebar,
                isSidebarOpen: callbacks.isSidebarOpen,
              },
            }
          : n
      )
    },
    [onContainerResizeStart, onContainerResize, onContainerResizeEnd, blockOps, callbacks.onToggleSidebar, callbacks.isSidebarOpen]
  )

  // Populate ref for use in early callbacks
  injectCallbacksRef.current = injectContainerCallbacks

  // Force callback re-injection when SIDEBAR callbacks change
  useEffect(() => {
    if (nodesRef.current.length > 0) {
      setNodesBase(prev => injectCallbacksRef.current?.(prev) ?? prev)
    }
  }, [callbacks.isSidebarOpen, callbacks.onToggleSidebar, setNodesBase])

  // Wrapped setNodes that automatically injects callbacks
  const setNodes = useCallback(
    (updater: Node[] | ((nodes: Node[]) => Node[])) => {
      setNodesBase((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        const injected = injectContainerCallbacks(next)
        return injected
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

  // Initialize nodes on mount only (no more controlled mode reinitialization)
  useEffect(() => {
    // Only initialize once on mount
    if (nodesRef.current.length > 0) {
      return // Already initialized
    }

    const initial: InitialBlock[] = args?.initialBlocks ?? [{}]

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

      // Use provided position or calculate default
      const x = blk.position?.x ?? 100
      const y = blk.position?.y ?? (100 + idx * 28)

      const payload = resolvePayload(blk)

      // Generate or use provided canonical name
      const canonicalName = blk.canonicalName ?? generateCanonicalName('block', id)

      // Register canonical name
      try {
        canonicalNameRegistryRef.current.register(canonicalName, id, 'block')
      } catch (err: any) {
        console.error(`📦 Stack Editor: Canonical name conflict during initialization:`, err.message)
      }

      // Compute content helpers
      const contentPreview = blk.contentPreview ?? extractPreview(payload.json)
      const contentType = blk.contentType ?? detectContentType(payload.json)
      const contentHash = blk.contentHash ?? computeContentHashSync(payload.json)

      const data: BlockData = {
        canonicalName,
        contentJson: payload.json,
        cachedHTML: payload.html,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        contentPreview,
        contentType,
        contentHash,
        height: 24,
        insertionOrder: idx,
        isBottomNode: idx === initial.length - 1,
        focusRef: nodeRefsMap.current[id],
        stackIndex: blk.stackIndex,
      }

      // Build node with position and optional parent/extent
      const node: Node = {
        id,
        type: 'block',
        position: { x, y },
        dragHandle: '.drag-handle',
        data,
      }

      // Apply parent/extent if provided
      if (blk.parentId) {
        node.parentId = blk.parentId
      }
      if (blk.extent) {
        node.extent = blk.extent
      }

      return node as Node
    })

    // Extract container data from initial blocks (mirror loadBlocks logic)
    const containerData = new Map<string, {
      canonicalName?: string;
      position: { x: number; y: number };
      parentId?: string;
      extent?: 'parent'
    }>()
    initial.forEach(blk => {
      if (blk.stackId) {
        if (!containerData.has(blk.stackId)) {
          containerData.set(blk.stackId, {
            canonicalName: blk.containerCanonicalName,
            position: blk.containerPosition || { x: 100, y: 100 },
            parentId: blk.containerParentId,
            extent: blk.containerExtent,
          })
        }
      }
    })

    // Pre-create container nodes with canonical names (mirror loadBlocks:768-793)
    const preCreatedContainers: Node[] = Array.from(containerData).map(([id, data]) => {
      let containerCanonicalName = data.canonicalName
      if (!containerCanonicalName) {
        containerCanonicalName = generateCanonicalName('stack', id)
      }

      const container: Node = {
        id,
        type: 'stackContainer',
        position: data.position,
        style: { width: opts.blockWidth + 8 },
        data: {
          canonicalName: containerCanonicalName,
          stackId: id,
          width: opts.blockWidth + 8,
          manualWidth: undefined,
          isDragging: false,
        },
      }

      // Restore container grouping
      if (data.parentId) container.parentId = data.parentId
      if (data.extent) container.extent = data.extent

      return container
    })

    // Register container canonical names (mirror loadBlocks:799-814)
    preCreatedContainers.forEach(container => {
      const canonicalName = (container.data as StackContainerData).canonicalName
      if (canonicalName) {
        try {
          canonicalNameRegistryRef.current.register(canonicalName, container.id, 'stack')
        } catch (err: any) {
          console.error(`📦 Stack Editor: Canonical name conflict for container "${canonicalName}":`, err.message)
          // Auto-generate unique name as fallback
          const uniqueName = canonicalNameRegistryRef.current.generateUniqueName(canonicalName)
          canonicalNameRegistryRef.current.register(uniqueName, container.id, 'stack')
          // Update container data with new name
          ;(container.data as StackContainerData).canonicalName = uniqueName
          console.warn(`📦 Stack Editor: Auto-resolved container conflict with name "${uniqueName}"`)
        }
      }
    })

    // Only auto-stack blocks that don't have explicit positions
    // Blocks with positions (from Canvas clicks/toolbar) should stay standalone
    const blocksWithPositions = created.filter(n => {
      const blk = initial.find(b => b.id === n.id)
      return blk?.position !== undefined
    })
    const blocksWithoutPositions = created.filter(n => !blocksWithPositions.includes(n))

    // Only create a stack if we have multiple blocks WITHOUT explicit positions
    const stackId = blocksWithoutPositions.length > 1 ? nextStackId(nodesRef.current.length > 0 ? nodesRef.current : created) : undefined
    const withStack = created.map((n) => {
      const blk = initial.find(b => b.id === n.id)
      const hasExplicitPosition = blocksWithPositions.includes(n)

      return {
        ...n,
        data: {
          ...(n.data as BlockData),
          // Use incoming stackId if present, otherwise assign based on position
          stackId: blk?.stackId ?? (hasExplicitPosition ? undefined : stackId)
        },
      }
    })

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
        onContentCommit: () => {
          emitChange({ type: 'content.commit', blockId: n.id })
        },
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

    // Merge pre-created containers with block nodes before layout
    const withContainers = [...preCreatedContainers, ...wired]

    // Apply layout only to blocks that are actually in a stack
    let laidOut: Node[] = withContainers
    if (stackId) {
      // Only apply stack layout if we actually created a stack
      laidOut = applyLayout(stackId, withContainers) as Node[]
    } else {
      // For standalone blocks, just sync containers (no stacking)
      laidOut = syncContainers(withContainers) as Node[]
    }

    // Inject resize callbacks into containers
    laidOut = injectContainerCallbacks(laidOut)

    setNodes(laidOut)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitChange])

  // Expand stack (open fullscreen modal for a stack)
  const expandStack = useCallback((stackId: string) => {
    console.log('[expandStack] Called with stackId:', stackId);
    console.log('[expandStack] Registered callbacks:', Array.from(stackExpandCallbacksRef.current.keys()));
    const expandFn = stackExpandCallbacksRef.current.get(stackId)
    if (expandFn) {
      console.log('[expandStack] Found callback, executing...');
      expandFn()
    } else {
      console.warn(`[expandStack] No expand callback registered for stackId: ${stackId}`)
    }
  }, [])

  // ===== History/Undo-Redo APIs =====

  // Get snapshot of current state for undo/redo
  const getSnapshot = useCallback((): StackSnapshot => {
    return {
      version: STACK_SNAPSHOT_VERSION,
      blocks: getBlocks(),
      timestamp: Date.now()
    }
  }, [getBlocks])

  // Apply snapshot to restore state
  const applySnapshot = useCallback((snapshot: StackSnapshot, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false

    console.log('📦 Stack Editor: Applying snapshot', {
      version: snapshot.version,
      blockCount: snapshot.blocks.length,
      silent
    })

    // Validate version
    if (snapshot.version !== STACK_SNAPSHOT_VERSION) {
      console.warn(`📦 Stack Editor: Snapshot version mismatch. Expected ${STACK_SNAPSHOT_VERSION}, got ${snapshot.version}`)
    }

    // Set restoring flag to prevent emissions during load
    const wasRestoring = isRestoringRef.current
    if (silent) {
      isRestoringRef.current = true
    }

    try {
      // Use loadBlocks to restore state
      loadBlocks(snapshot.blocks)
    } finally {
      if (silent) {
        // Reset restoring flag after a brief delay to allow React to update
        setTimeout(() => {
          isRestoringRef.current = wasRestoring
        }, 10)
      }
    }
  }, [loadBlocks])

  // Transaction methods
  const beginTransaction = useCallback((name?: string) => {
    console.log('📦 Stack Editor: Beginning transaction', name)
    isInTransactionRef.current = true
    transactionNameRef.current = name
  }, [])

  const commitTransaction = useCallback((name: string) => {
    console.log('📦 Stack Editor: Committing transaction', name)
    isInTransactionRef.current = false
    transactionNameRef.current = undefined

    // Emit a single commit event for the transaction
    emitChange({
      type: 'content.commit',
    })
  }, [emitChange])

  const abortTransaction = useCallback(() => {
    console.log('📦 Stack Editor: Aborting transaction')
    isInTransactionRef.current = false
    transactionNameRef.current = undefined
  }, [])

  // Subscribe to change events
  const onChange = useCallback((listener: ChangeListener): (() => void) => {
    changeListenersRef.current.add(listener)

    // Return unsubscribe function
    return () => {
      changeListenersRef.current.delete(listener)
    }
  }, [])

  // ===== Grouping APIs =====

  // Update a single node's parent relationship
  const updateNodeParent = useCallback((nodeId: string, parentId?: string, extent?: 'parent') => {
    const blocks = getBlocks()
    const block = blocks.find(b => b.id === nodeId)
    if (!block) return

    const allNodesSnapshot = reactFlowInstance.getNodes()

    // Get group node if parenting
    const groupNode = parentId ? reactFlowInstance.getNode(parentId) : null

    // Convert position if needed
    let newPosition = block.position
    if (parentId && groupNode) {
      // Converting to child: absolute → relative
      const absolutePos = block.position || { x: 0, y: 0 }
      // Get absolute position of group (handles nested groups)
      const groupAbsolutePos = getAbsolutePosition(groupNode, allNodesSnapshot)
      newPosition = convertAbsoluteToRelative(absolutePos, groupAbsolutePos)
    } else if (!parentId && block.parentId) {
      // Converting to standalone: relative → absolute
      const oldParent = reactFlowInstance.getNode(block.parentId)
      if (oldParent) {
        const relativePos = block.position || { x: 0, y: 0 }
        // Get absolute position of parent (handles nested groups)
        const parentAbsolutePos = getAbsolutePosition(oldParent, allNodesSnapshot)
        newPosition = convertRelativeToAbsolute(relativePos, parentAbsolutePos)
      }
    }

    // Update block
    const updatedBlocks = blocks.map(b =>
      b.id === nodeId
        ? {
            ...b,
            parentId,
            extent,
            position: newPosition,
          }
        : b
    )

    loadBlocks(updatedBlocks)

    // Emit change event
    emitChange({
      type: parentId ? 'block.group' : 'block.ungroup',
      blockId: nodeId,
    })
  }, [getBlocks, loadBlocks, reactFlowInstance, emitChange])

  // Group multiple nodes into a parent group
  const groupNodes = useCallback((nodeIds: string[], parentGroupId: string) => {
    const groupNode = reactFlowInstance.getNode(parentGroupId)
    if (!groupNode) {
      console.warn(`[groupNodes] Group node ${parentGroupId} not found`)
      return
    }

    const blocks = getBlocks()
    const allNodesSnapshot = reactFlowInstance.getNodes()

    // Get absolute position of group (handles nested groups)
    const groupAbsolutePos = getAbsolutePosition(groupNode, allNodesSnapshot)

    const updatedBlocks = blocks.map(block => {
      if (!nodeIds.includes(block.id!)) return block

      // Find this block in React Flow nodes to get absolute position
      const blockNode = allNodesSnapshot.find(n => n.id === block.id)
      const absolutePos = blockNode
        ? getAbsolutePosition(blockNode, allNodesSnapshot)
        : block.position || { x: 0, y: 0 }

      // Convert to relative position within group
      const relativePos = convertAbsoluteToRelative(absolutePos, groupAbsolutePos)

      return {
        ...block,
        parentId: parentGroupId,
        extent: 'parent' as const,
        position: relativePos,
      }
    })

    loadBlocks(updatedBlocks)

    // Also group related stack containers
    const selectedStackIds = new Set(
      blocks
        .filter(b => nodeIds.includes(b.id!) && b.stackId)
        .map(b => b.stackId!)
    )

    if (selectedStackIds.size > 0) {
      const containerIds = Array.from(selectedStackIds)
      setNodes(nds => nds.map(n => {
        if (containerIds.includes(n.id)) {
          const containerAbsPos = getAbsolutePosition(n, allNodesSnapshot)
          const relativePos = convertAbsoluteToRelative(containerAbsPos, groupAbsolutePos)

          return {
            ...n,
            parentId: parentGroupId,
            extent: 'parent' as const,
            position: relativePos
          }
        }
        return n
      }))
    }

    // Emit change event for each grouped node
    nodeIds.forEach(nodeId => {
      emitChange({
        type: 'block.group',
        blockId: nodeId,
      })
    })
  }, [getBlocks, loadBlocks, reactFlowInstance, emitChange, setNodes])

  // Ungroup nodes from their parent
  const ungroupNodes = useCallback((nodeIds: string[]) => {
    const blocks = getBlocks()
    const allNodesSnapshot = reactFlowInstance.getNodes()

    const updatedBlocks = blocks.map(block => {
      if (!nodeIds.includes(block.id!) || !block.parentId) return block

      // Find parent to convert position
      const parentNode = allNodesSnapshot.find(n => n.id === block.parentId)
      const relativePos = block.position || { x: 0, y: 0 }
      // Get absolute position of parent (handles nested groups)
      const parentAbsolutePos = parentNode
        ? getAbsolutePosition(parentNode, allNodesSnapshot)
        : { x: 0, y: 0 }
      const absolutePos = parentNode
        ? convertRelativeToAbsolute(relativePos, parentAbsolutePos)
        : relativePos

      return {
        ...block,
        parentId: undefined,
        extent: undefined,
        position: absolutePos,
      }
    })

    loadBlocks(updatedBlocks)

    // Emit change event for each ungrouped node
    nodeIds.forEach(nodeId => {
      emitChange({
        type: 'block.ungroup',
        blockId: nodeId,
      })
    })
  }, [getBlocks, loadBlocks, reactFlowInstance, emitChange])

  // Delete a group and ungroup its children
  const deleteGroup = useCallback((groupId: string) => {
    const blocks = getBlocks()
    const allNodesSnapshot = reactFlowInstance.getNodes()

    // Find ALL children (blocks and containers)
    const childBlockIds = blocks
      .filter(block => block.parentId === groupId)
      .map(block => block.id!)
      .filter(id => id !== undefined)

    const childContainerIds = allNodesSnapshot
      .filter(n => n.type === 'stackContainer' && n.parentId === groupId)
      .map(n => n.id)

    // Step 1: Ungroup blocks (converts positions, clears parentId)
    if (childBlockIds.length > 0) {
      ungroupNodes(childBlockIds)
    }

    // Step 2: In SAME setNodes call, delete group and ungroup containers
    setNodes(nds => nds
      .filter(n => n.id !== groupId)  // Remove group node
      .map(n => {
        // Ungroup containers
        if (childContainerIds.includes(n.id)) {
          const absolutePos = getAbsolutePosition(n, allNodesSnapshot)
          return {
            ...n,
            parentId: undefined,
            extent: undefined,
            position: absolutePos
          }
        }
        return n
      })
    )

    // Emit delete event for the group itself
    emitChange({
      type: 'group.delete',
      groupId,
    })

    // Return the ungrouped block IDs for consumers to know what was affected
    return childBlockIds
  }, [getBlocks, ungroupNodes, emitChange, reactFlowInstance, setNodes])

  // Overlays
  const overlays = (
    <>
      {slashMenu && (
        <SlashMenu
          position={slashMenu.position}
          query={slashMenu.range.query}
          onSelect={onSlashMenuSelect}
          onClose={() => setSlashMenu(null)}
        />
      )}
      <DropIndicator show={drag.dropIndicator.show} position={drag.dropIndicator.position} canvasPosition={drag.dropIndicator.canvasPosition} />
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

  // NEW API: Canonical name operations
  const findBlockByCanonical = useCallback((name: string): InitialBlock | null => {
    const id = canonicalNameRegistryRef.current.resolve(name)
    if (!id) return null

    const node = nodesRef.current.find(n => n.id === id)
    if (!node || node.type !== 'block') return null

    const data = node.data as BlockData
    return {
      id: node.id,
      canonicalName: data.canonicalName,
      contentJson: data.contentJson,
      html: data.cachedHTML,
      contentPreview: data.contentPreview,
      contentType: data.contentType,
      contentHash: data.contentHash,
      position: node.position,
      parentId: node.parentId,
      extent: node.extent === 'parent' ? 'parent' : undefined,
      stackId: data.stackId,
      stackIndex: data.stackIndex,
    }
  }, [])

  const findStackByCanonical = useCallback((name: string): string | null => {
    // Look through containers for matching canonical name
    const container = nodesRef.current.find(
      n => n.type === 'stackContainer' && (n.data as any)?.canonicalName === name
    )
    return container?.id ?? null
  }, [])

  const renameCanonical = useCallback((args: { from: string; to: string }) => {
    const { from, to } = args

    // Rename in registry (will throw if conflict)
    canonicalNameRegistryRef.current.rename(from, to)

    // Update block data
    setNodes(prev => prev.map(n => {
      if (n.type === 'block' && (n.data as BlockData).canonicalName === from) {
        return {
          ...n,
          data: {
            ...(n.data as BlockData),
            canonicalName: to,
          }
        }
      }
      return n
    }))

    // Emit rename event
    emitChange({
      type: 'block.rename',
      previousName: from,
      newName: to,
      canonicalName: to,
    })
  }, [emitChange, setNodes])

  const updateBlockContent = useCallback((args: { canonicalName: string; contentJson: any }) => {
    const { canonicalName, contentJson } = args
    const id = canonicalNameRegistryRef.current.resolve(canonicalName)

    if (!id) {
      throw new Error(`Block not found: ${canonicalName}`)
    }

    const json = ensureJsonContent(contentJson)
    const html = sanitizeAndSave(jsonToHtml(json))

    // Recompute content helpers
    const contentPreview = extractPreview(json)
    const contentType = detectContentType(json)
    const contentHash = computeContentHashSync(json)

    setNodes(prev => prev.map(n => {
      if (n.id === id) {
        return {
          ...n,
          data: {
            ...(n.data as BlockData),
            contentJson: json,
            cachedHTML: html,
            contentPreview,
            contentType,
            contentHash,
          }
        }
      }
      return n
    }))

    // Emit content update event
    emitChange({
      type: 'block.content.update',
      blockId: id,
      canonicalName,
      contentHash,
      contentPreview,
      contentType,
    })
  }, [emitChange, setNodes])

  const createStack = useCallback((args: { title?: string; canonicalName?: string; position?: { x: number; y: number } }): { stackId: string; canonicalName: string } => {
    const stackId = nextStackId(nodesRef.current)
    const canonicalName = args.canonicalName ?? generateCanonicalName('stack', stackId)

    // Register canonical name for stack
    canonicalNameRegistryRef.current.register(canonicalName, stackId, 'stack')

    const position = args.position ?? { x: 100, y: 100 }

    const container: Node = {
      id: stackId,
      type: 'stackContainer',
      position,
      style: { width: opts.blockWidth + 8 },
      data: {
        canonicalName,
        stackId,
        width: opts.blockWidth + 8,
        manualWidth: undefined,
        isDragging: false,
        title: args.title,
      },
    }

    setNodes(prev => syncContainers([...prev, container]) as Node[])

    // Emit stack.create event
    emitChange({
      type: 'stack.create',
      stackId,
      canonicalName,
    })

    return { stackId, canonicalName }
  }, [opts.blockWidth, emitChange, setNodes, syncContainers])

  const duplicateStack = useCallback((args: { canonicalName: string; position?: { x: number; y: number } }): { stackId: string; canonicalName: string; blockIds: string[] } => {
    // Find source stack by canonical name
    const sourceStackId = findStackByCanonical(args.canonicalName)
    if (!sourceStackId) {
      throw new Error(`Stack not found: ${args.canonicalName}`)
    }

    const sourceContainer = nodesRef.current.find(n => n.id === sourceStackId)
    if (!sourceContainer || sourceContainer.type !== 'stackContainer') {
      throw new Error(`Stack container not found: ${args.canonicalName}`)
    }

    const sourceContainerData = sourceContainer.data as StackContainerData
    const sourceContainerDataAny = sourceContainer.data as any

    // Find all blocks in the source stack
    const sourceBlocks = nodesRef.current
      .filter(n => n.type === 'block' && (n.data as BlockData).stackId === sourceStackId)
      .sort((a, b) => ((a.data as BlockData).stackIndex ?? 0) - ((b.data as BlockData).stackIndex ?? 0))

    // Begin transaction for atomicity
    beginTransaction('duplicateStack')

    try {
      // Generate unique canonical name for the new stack
      const baseStackName = args.canonicalName + '-copy'
      const newStackCanonicalName = canonicalNameRegistryRef.current.generateUniqueName(baseStackName)

      // Calculate position for duplicate (offset if not provided)
      const newPosition = args.position ?? {
        x: sourceContainer.position.x + 50,
        y: sourceContainer.position.y + 50
      }

      // Create new stack container
      const newStackId = nextStackId(nodesRef.current)
      canonicalNameRegistryRef.current.register(newStackCanonicalName, newStackId, 'stack')

      const newContainer: Node = {
        id: newStackId,
        type: 'stackContainer',
        position: newPosition,
        style: { width: sourceContainer.style?.width ?? opts.blockWidth + 8 },
        data: {
          canonicalName: newStackCanonicalName,
          stackId: newStackId,
          width: sourceContainerDataAny.width ?? opts.blockWidth + 8,
          manualWidth: sourceContainerDataAny.manualWidth,
          isDragging: false,
          title: sourceContainerData.title,
        },
      }

      // Preserve grouping if original is grouped
      if (sourceContainer.parentId) {
        newContainer.parentId = sourceContainer.parentId
        newContainer.extent = sourceContainer.extent
      }

      // Emit stack.create event
      emitChange({
        type: 'stack.create',
        stackId: newStackId,
        canonicalName: newStackCanonicalName,
      })

      // Duplicate all blocks in the stack
      const newBlockIds: string[] = []
      const newBlocks: Node[] = []

      sourceBlocks.forEach((sourceBlock) => {
        const sourceBlockData = sourceBlock.data as BlockData

        // Generate unique canonical name for the new block
        const sourceBlockCanonical = sourceBlockData.canonicalName
        const baseBlockName = sourceBlockCanonical + '-copy'
        const newBlockCanonicalName = canonicalNameRegistryRef.current.generateUniqueName(baseBlockName)

        // Create new block with duplicated content
        const newBlockId = nextBlockId()
        if (!nodeRefsMap.current[newBlockId]) nodeRefsMap.current[newBlockId] = { current: null }

        // Register canonical name
        canonicalNameRegistryRef.current.register(newBlockCanonicalName, newBlockId, 'block')

        // Get current max insertion order
        const maxOrder = nodesRef.current
          .filter(n => n.type === 'block')
          .reduce((max, n: any) => Math.max(max, (n.data as BlockData).insertionOrder ?? 0), -1)

        // Create block data with duplicated content
        const newBlockData: BlockData = {
          canonicalName: newBlockCanonicalName,
          contentJson: sourceBlockData.contentJson,
          cachedHTML: sourceBlockData.cachedHTML,
          schemaVersion: sourceBlockData.schemaVersion,
          contentPreview: sourceBlockData.contentPreview,
          contentType: sourceBlockData.contentType,
          contentHash: sourceBlockData.contentHash,
          height: sourceBlockData.height ?? 24,
          insertionOrder: maxOrder + 1 + newBlockIds.length,
          isBottomNode: false,
          focusRef: nodeRefsMap.current[newBlockId],
          stackId: newStackId,  // Reference new stack
          stackIndex: sourceBlockData.stackIndex,
        }

        // Create new block node with absolute position based on new container position
        const newBlockNode: Node = {
          id: newBlockId,
          type: 'block',
          position: {
            x: newPosition.x + 4,  // Container X + padding
            y: newPosition.y + sourceBlock.position.y  // Container Y + block's relative Y
          },
          dragHandle: '.drag-handle',
          data: newBlockData,
        }

        // Wire up callbacks
        const wiredBlock = {
          ...newBlockNode,
          data: {
            ...newBlockData,
            onContentUpdate: (payload: RichTextPayload) =>
              setNodes((inner) => inner.map((ni: any) => {
                if (ni.id === newBlockId) {
                  const json = ensureJsonContent(payload.json)
                  const html = sanitizeAndSave(payload.html)
                  const contentPreview = extractPreview(json)
                  const contentType = detectContentType(json)
                  const contentHash = computeContentHashSync(json)
                  return {
                    ...ni,
                    data: {
                      ...(ni.data as BlockData),
                      contentJson: json,
                      cachedHTML: html,
                      schemaVersion: CURRENT_SCHEMA_VERSION,
                      contentPreview,
                      contentType,
                      contentHash,
                    }
                  }
                }
                return ni
              })),
            onContentCommit: () => {
              const currentNode = nodesRef.current.find(n => n.id === newBlockId)
              const currentData = currentNode?.data as BlockData | undefined
              emitChange({
                type: 'content.commit',
                blockId: newBlockId,
                canonicalName: currentData?.canonicalName,
                contentHash: currentData?.contentHash,
                contentPreview: currentData?.contentPreview,
                contentType: currentData?.contentType,
              })
            },
            onAdd: (initialContent?: RichTextPayload) => blockOps.addBelow(newBlockId, initialContent),
            onAddMultiple: (payloads: RichTextPayload[]) => blockOps.addMultipleBelow(newBlockId, payloads),
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
        }

        // Collect the new block
        newBlocks.push(wiredBlock)

        // Emit block.create event
        emitChange({
          type: 'block.create',
          blockId: newBlockId,
          canonicalName: newBlockCanonicalName,
        })

        newBlockIds.push(newBlockId)
      })

      // Add container and all blocks together in a single atomic update
      setNodes((prevNodes) => {
        const updated = prevNodes.map((n: any) =>
          n.type === 'block'
            ? { ...n, data: { ...n.data, isBottomNode: false } }
            : n
        )
        return syncContainers([...updated, newContainer, ...newBlocks]) as Node[]
      })

      // Commit transaction
      commitTransaction('duplicateStack')

      return {
        stackId: newStackId,
        canonicalName: newStackCanonicalName,
        blockIds: newBlockIds
      }
    } catch (error) {
      // Abort transaction on error
      abortTransaction()
      throw error
    }
  }, [findStackByCanonical, beginTransaction, commitTransaction, abortTransaction, opts.blockWidth, emitChange, setNodes, syncContainers, blockOps, handleHeightChange, handleSlashCommand])

  const moveBlock = useCallback((args: { canonicalName: string; stackId?: string; index?: number }): { from: { stackId?: string; index?: number }; to: { stackId: string; index: number }; affected: string[] } => {
    const { canonicalName, stackId: targetStackId, index: targetIndex } = args

    const id = canonicalNameRegistryRef.current.resolve(canonicalName)
    if (!id) {
      throw new Error(`Block not found: ${canonicalName}`)
    }

    const node = nodesRef.current.find(n => n.id === id)
    if (!node || node.type !== 'block') {
      throw new Error(`Block not found: ${canonicalName}`)
    }

    const data = node.data as BlockData
    const fromStackId = data.stackId
    const fromIndex = data.stackIndex

    // If no target stack specified, keep current stack
    const finalStackId = targetStackId ?? fromStackId ?? ''

    // Get blocks in target stack
    const stackBlocks = nodesRef.current
      .filter(n => n.type === 'block' && (n.data as BlockData).stackId === finalStackId)
      .sort((a, b) => ((a.data as BlockData).stackIndex ?? 0) - ((b.data as BlockData).stackIndex ?? 0))

    // Calculate final index (default to end)
    const finalIndex = targetIndex ?? stackBlocks.length

    // Track affected blocks
    const affected: string[] = []

    // Update blocks
    setNodes(prev => prev.map(n => {
      if (n.type !== 'block') return n

      const blockData = n.data as BlockData

      // Moving block
      if (n.id === id) {
        affected.push(blockData.canonicalName)
        return {
          ...n,
          data: {
            ...blockData,
            stackId: finalStackId,
            stackIndex: finalIndex,
          }
        }
      }

      // Reindex blocks in source stack (if different from target)
      if (fromStackId && blockData.stackId === fromStackId && fromStackId !== finalStackId) {
        const currentIndex = blockData.stackIndex ?? 0
        if (currentIndex > (fromIndex ?? 0)) {
          affected.push(blockData.canonicalName)
          return {
            ...n,
            data: {
              ...blockData,
              stackIndex: currentIndex - 1,
            }
          }
        }
      }

      // Reindex blocks in target stack
      if (blockData.stackId === finalStackId) {
        const currentIndex = blockData.stackIndex ?? 0
        if (currentIndex >= finalIndex && n.id !== id) {
          affected.push(blockData.canonicalName)
          return {
            ...n,
            data: {
              ...blockData,
              stackIndex: currentIndex + 1,
            }
          }
        }
      }

      return n
    }))

    // Emit move event
    emitChange({
      type: 'block.move',
      blockId: id,
      canonicalName,
      from: { stackId: fromStackId, index: fromIndex },
      to: { stackId: finalStackId, index: finalIndex },
      affected,
    })

    return {
      from: { stackId: fromStackId, index: fromIndex },
      to: { stackId: finalStackId, index: finalIndex },
      affected,
    }
  }, [emitChange, setNodes])

  return {
    nodes,
    nodeTypes,
    onNodesChange,
    // Edge operations
    edges,
    onEdgesChange,
    onConnect,
    getEdges,
    setEdges,
    onNodeDragStart: (evt, node) => {
      // Handle extent constraint removal for auto-grouping
      if (opts.enableAutoGrouping && node.parentId && node.extent === 'parent') {
        setNodes((nds) => nds.map((n) => {
          if (n.id === node.id) {
            return {
              ...n,
              extent: undefined,
              __originalExtent: 'parent',
            } as Node
          }
          return n
        }))
      }

      // Update nodesRef with all React Flow nodes (including group nodes from consumer)
      nodesRef.current = reactFlowInstance.getNodes()
      drag.onNodeDragStart(evt, node, nodesRef)
    },
    onNodeDrag: (evt, node) => {
      // Update nodesRef with all React Flow nodes (including group nodes from consumer)
      nodesRef.current = reactFlowInstance.getNodes()
      return drag.onNodeDrag(evt, node, nodesRef, setNodes, reactFlowInstance.flowToScreenPosition, reactFlowInstance.getViewport().zoom)
    },
    onNodeDragStop: (evt, node) => {
      // Handle auto-grouping if enabled
      if (opts.enableAutoGrouping) {
        const allNodesSnapshot = reactFlowInstance.getNodes()
        const dropPoint = reactFlowInstance.screenToFlowPosition({ x: evt.clientX, y: evt.clientY })
        const intersectingGroup = findIntersectingGroup(dropPoint, allNodesSnapshot, opts.groupNodeTypes)

        const hadOriginalExtent = (node as any).__originalExtent

        // Helper to check if node is in a stack
        const isNodeInStack = (node: Node) => {
          const parentNode = allNodesSnapshot.find(n => n.id === node.parentId)
          return parentNode?.type === 'stackContainer'
        }

        // AUTO-PARENT: Node dropped into group
        // Skip if drop indicator is showing (user is trying to attach to a stack/solo node)
        if (intersectingGroup && (!node.parentId || isNodeInStack(node)) && !drag.dropIndicator.show) {
          const blocks = getBlocks()

          // Handle stack containers specially
          if ((node as any).type === 'stackContainer') {
            const stackId = node.id
            const stackBlocks = blocks.filter(b => (b as any).stackId === stackId)

            if (stackBlocks.length > 0) {
              // Get absolute position of container and group
              const containerAbsolutePos = getAbsolutePosition(node, allNodesSnapshot)
              const groupAbsolutePos = getAbsolutePosition(intersectingGroup, allNodesSnapshot)

              // Update all blocks in the stack
              const updatedBlocks = blocks.map(b => {
                if ((b as any).stackId === stackId) {
                  // Block's current absolute position
                  const blockNode = allNodesSnapshot.find(n => n.id === b.id)
                  const blockAbsolutePos = blockNode
                    ? getAbsolutePosition(blockNode, allNodesSnapshot)
                    : { x: containerAbsolutePos.x + (b.position?.x || 0), y: containerAbsolutePos.y + (b.position?.y || 0) }

                  // Convert to relative position within group
                  const relativePos = convertAbsoluteToRelative(blockAbsolutePos, groupAbsolutePos)

                  return {
                    ...b,
                    parentId: intersectingGroup.id,
                    extent: 'parent' as const,
                    position: relativePos,
                  }
                }
                return b
              })

              // Update React Flow nodes directly instead of loadBlocks
              setNodes((currentNodes) => {
                // Update block nodes with new parentId/extent/position
                const updated = currentNodes.map((rfNode) => {
                  const updatedBlock = updatedBlocks.find(b => b.id === rfNode.id)
                  if (updatedBlock && rfNode.type === 'block') {
                    return {
                      ...rfNode,
                      parentId: updatedBlock.parentId,
                      extent: updatedBlock.extent as any,
                      position: updatedBlock.position || rfNode.position,
                      data: {
                        ...(rfNode.data || {}),
                        ...updatedBlock,
                      }
                    }
                  }
                  return rfNode
                })
                // Sync containers with ALL nodes (preserves existing containers)
                return syncContainersWithCallbacks(updated)
              })

              // Emit change events for all blocks
              stackBlocks.forEach(b => {
                emitChange({
                  type: 'block.group',
                  blockId: b.id!,
                })
              })

              // Skip normal drag stop handling
              return
            }
          }

          // Handle individual blocks
          const blockToGroup = blocks.find(b => b.id === node.id)

          if (blockToGroup) {
            // Check if block is being extracted from a stack
            const wasInStack = isNodeInStack(node)
            const oldStackId = wasInStack ? (blockToGroup as any).stackId : undefined

            // Get absolute position of block (handles parent stack container)
            const absolutePos = getAbsolutePosition(node, allNodesSnapshot)
            // Get absolute position of group (handles nested groups)
            const groupAbsolutePos = getAbsolutePosition(intersectingGroup, allNodesSnapshot)
            const relativePos = convertAbsoluteToRelative(absolutePos, groupAbsolutePos)

            const updatedBlocks = blocks.map(b =>
              b.id === node.id
                ? {
                    ...b,
                    parentId: intersectingGroup.id,
                    extent: 'parent' as const,
                    position: relativePos,
                    stackId: undefined, // Remove from stack
                  }
                : b
            )

            // Update React Flow nodes directly instead of loadBlocks
            setNodes((currentNodes) => {
              // Update block node with new parentId/extent/position
              const updated = currentNodes.map((rfNode) => {
                if (rfNode.id === node.id && rfNode.type === 'block') {
                  const updatedBlock = updatedBlocks.find(b => b.id === node.id)!
                  const newData = {
                    ...(rfNode.data || {}),
                    ...updatedBlock,
                  }
                  // Remove stackId when extracting from stack
                  if (wasInStack) {
                    delete newData.stackId
                  }
                  return {
                    ...rfNode,
                    parentId: updatedBlock.parentId,
                    extent: updatedBlock.extent as any,
                    position: updatedBlock.position || rfNode.position,
                    data: newData
                  }
                }
                return rfNode
              })
              // Sync containers with ALL nodes (preserves existing containers)
              let synced = syncContainersWithCallbacks(updated)

              // If block was extracted from a stack, reposition remaining blocks
              if (wasInStack && oldStackId) {
                synced = applyLayout(oldStackId, synced)
              }

              return synced
            })

            // Emit change event
            emitChange({
              type: 'block.group',
              blockId: node.id,
            })

            // Skip normal drag stop handling
            return
          }
        }

        // AUTO-UNPARENT: Node dragged outside its parent group
        if (!intersectingGroup && node.parentId) {
          // Only auto-unparent if parent is a GROUP node, or a stack container inside a group
          const parentNode = allNodesSnapshot.find(n => n.id === node.parentId)
          const isDirectGroupParent = parentNode && parentNode.type && opts.groupNodeTypes?.includes(parentNode.type)

          // Check if parent is a container that's inside a group
          const isContainerInGroup = parentNode &&
                                    parentNode.type === 'stackContainer' &&
                                    parentNode.parentId &&
                                    allNodesSnapshot.find((n: any) => n.id === parentNode.parentId && opts.groupNodeTypes?.includes(n.type))

          const isGroupParent = isDirectGroupParent || isContainerInGroup

          if (!isGroupParent) {
            // Parent is neither a group nor a container in a group
            // Skip auto-unparent, fall through to normal drag handling
          } else {
            // Parent is a group OR container in group - proceed with auto-unparent
            const blocks = getBlocks()

            // Handle stack containers specially
            if ((node as any).type === 'stackContainer') {
            const stackId = node.id
            const stackBlocks = blocks.filter(b => (b as any).stackId === stackId)

            if (stackBlocks.length > 0) {
              // Get parent (group) absolute position
              const parentNode = allNodesSnapshot.find(n => n.id === node.parentId)
              const parentAbsolutePos = parentNode
                ? getAbsolutePosition(parentNode, allNodesSnapshot)
                : { x: 0, y: 0 }

              // Container's current absolute position
              const containerAbsolutePos = getAbsolutePosition(node, allNodesSnapshot)

              // Update all blocks in the stack
              const updatedBlocks = blocks.map(b => {
                if ((b as any).stackId === stackId) {
                  // Block's current position (relative to container)
                  const blockNode = allNodesSnapshot.find(n => n.id === b.id)
                  const blockRelativePos = blockNode?.position || b.position || { x: 0, y: 0 }

                  // Block's absolute position = container absolute + block relative
                  const blockAbsolutePos = {
                    x: containerAbsolutePos.x + blockRelativePos.x,
                    y: containerAbsolutePos.y + blockRelativePos.y,
                  }

                  return {
                    ...b,
                    parentId: undefined,
                    extent: undefined,
                    position: blockAbsolutePos,
                  }
                }
                return b
              })

              // Update React Flow nodes directly instead of loadBlocks
              setNodes((currentNodes) => {
                // Update container AND block nodes with removed parentId/extent
                const updated = currentNodes.map((rfNode) => {
                  // Update container node to remove parentId/extent
                  if (rfNode.id === stackId && rfNode.type === 'stackContainer') {
                    return {
                      ...rfNode,
                      parentId: undefined,
                      extent: undefined,
                      // Position is already absolute from React Flow drag
                    }
                  }

                  // Update block nodes with absolute positions
                  const updatedBlock = updatedBlocks.find(b => b.id === rfNode.id)
                  if (updatedBlock && rfNode.type === 'block') {
                    return {
                      ...rfNode,
                      parentId: updatedBlock.parentId,
                      extent: updatedBlock.extent,
                      position: updatedBlock.position || rfNode.position,
                      data: {
                        ...(rfNode.data || {}),
                        ...updatedBlock,
                      }
                    }
                  }
                  return rfNode
                })
                // Sync containers - container has no parentId so won't preserve group parent
                return syncContainersWithCallbacks(updated)
              })

              // Emit change events for all blocks
              stackBlocks.forEach(b => {
                emitChange({
                  type: 'block.ungroup',
                  blockId: b.id!,
                })
              })

              // Fall through to normal drag stop handling (will return early for containers)
            }
          }

          // Handle individual blocks
          const blockToUngroup = blocks.find(b => b.id === node.id)

          if (blockToUngroup) {
            const parentNode = allNodesSnapshot.find(n => n.id === node.parentId)
            const currentRFNode = allNodesSnapshot.find(n => n.id === node.id)
            const relativePos = currentRFNode?.position || node.position
            // Get absolute position of parent (handles nested groups)
            const parentAbsolutePos = parentNode
              ? getAbsolutePosition(parentNode, allNodesSnapshot)
              : { x: 0, y: 0 }
            const absolutePos = parentNode
              ? convertRelativeToAbsolute(relativePos, parentAbsolutePos)
              : relativePos

            const updatedBlocks = blocks.map(b =>
              b.id === node.id
                ? {
                    ...b,
                    parentId: undefined,
                    extent: undefined,
                    position: absolutePos,
                    stackId: undefined,  // Clear stackId to prevent syncContainers from re-inheriting group
                  }
                : b
            )

            // Update React Flow nodes directly instead of loadBlocks
            setNodes((currentNodes) => {
              // Update block node with removed parentId/extent and absolute position
              const updated = currentNodes.map((rfNode) => {
                if (rfNode.id === node.id && rfNode.type === 'block') {
                  const updatedBlock = updatedBlocks.find(b => b.id === node.id)!
                  return {
                    ...rfNode,
                    parentId: updatedBlock.parentId,
                    extent: updatedBlock.extent,
                    position: updatedBlock.position || rfNode.position,
                    data: {
                      ...(rfNode.data || {}),
                      ...updatedBlock,
                    }
                  }
                }
                return rfNode
              })
              // Sync containers with ALL nodes (preserves existing containers)
              return syncContainersWithCallbacks(updated)
            })

            // Emit change event
            emitChange({
              type: 'block.ungroup',
              blockId: node.id,
            })

            // Fall through to normal drag stop handling to allow stack attachment
          }
          }
        }

        // RESTORE EXTENT: Node dragged but stayed within parent
        if (hadOriginalExtent && node.parentId) {
          // Only restore extent for GROUP parents, not stack containers
          const parentNode = allNodesSnapshot.find(n => n.id === node.parentId)
          const isGroupParent = parentNode && parentNode.type && opts.groupNodeTypes?.includes(parentNode.type)

          if (isGroupParent) {
            setNodes((nds) => nds.map((n) => {
              if (n.id === node.id) {
                const { __originalExtent, ...nodeWithoutMeta } = n as any
                return {
                  ...nodeWithoutMeta,
                  extent: __originalExtent,
                } as Node
              }
              return n
            }))

            // Continue with normal drag stop handling
          }
        }
      }

      // Normal drag stop handling for stack operations
      drag.onNodeDragStop(evt, node, setNodes, updateBottomNodeFlags, syncContainersWithCallbacks)
    },
    onMove,
    focus,
    addBelow: blockOps.addBelow,
    split: blockOps.handleSplit,
    delete: blockOps.handleDelete,
    getBlocks,
    createBlock,
    loadBlocks,
    // Canonical name operations
    findBlockByCanonical,
    findStackByCanonical,
    renameCanonical,
    updateBlockContent,
    // Stack operations
    createStack,
    duplicateStack,
    moveBlock,
    expandStack,
    // Grouping APIs
    groupNodes,
    ungroupNodes,
    deleteGroup,
    updateNodeParent,
    overlays,
    // History/undo-redo APIs
    getSnapshot,
    applySnapshot,
    beginTransaction,
    commitTransaction,
    abortTransaction,
    onChange,
  }
}

export default useStackEditor
