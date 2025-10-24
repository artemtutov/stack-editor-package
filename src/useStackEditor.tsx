import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNodesState, applyNodeChanges, useStoreApi, useReactFlow, type Node, type NodeTypes, type NodeChange } from '@xyflow/react'
import type { Editor } from '@tiptap/core'
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
  SlashPayload,
  StackSnapshot,
  ChangeEvent,
  ChangeListener,
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

  // Core state
  const [nodes, setNodesBase, onNodesChangeBase] = useNodesState<Node>([])
  const nodesRef = useRef<Node[]>([])
  const nodeRefsMap = useRef<NodeRefsMap>({})
  const storeApi = useStoreApi()
  const reactFlowInstance = useReactFlow()

  // Active resize tracking
  const activeResizeContainerRef = useRef<string | null>(null)

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

    changeListenersRef.current.forEach(listener => {
      try {
        listener(event)
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

  // Viewport tracking (kept for compatibility, but not used for drop indicator)
  const onMove = useCallback((_evt: any, viewport: { x: number; y: number; zoom: number }) => {
    // Viewport is now accessed via reactFlowInstance
  }, [])

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
          contentJson: data.contentJson,
          html: data.cachedHTML,
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

          // Save container position for stack persistence
          const container = containers.find(c => c.id === data.stackId)
          if (container?.position) {
            block.containerPosition = { x: container.position.x, y: container.position.y }
          }
        }

        return block
      })
  }, [])

  // Create a new block imperatively (without full reinitialization)
  const createBlock = useCallback((block: Partial<InitialBlock>) => {
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

    // Get current max insertion order
    const maxOrder = nodesRef.current
      .filter(n => n.type === 'block')
      .reduce((max, n: any) => Math.max(max, (n.data as BlockData).insertionOrder ?? 0), -1)

    // Create block data
    const data: BlockData = {
      contentJson: payload.json,
      cachedHTML: payload.html,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      height: 24,
      insertionOrder: maxOrder + 1,
      isBottomNode: true,  // New blocks are always at bottom initially
      focusRef: nodeRefsMap.current[id],
      stackId: block.stackId,
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
            setNodes((inner) => inner.map((ni: any) => (ni.id === id ? { ...ni, data: {
                  ...(ni.data as BlockData),
                  contentJson: ensureJsonContent(payload.json),
                  cachedHTML: sanitizeAndSave(payload.html),
                  schemaVersion: CURRENT_SCHEMA_VERSION,
                } } : ni))),
          onContentCommit: () => {
            emitChange({ type: 'content.commit', blockId: id })
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

    // 1. Extract container positions from blocks
    const containerPositions = new Map<string, { x: number; y: number }>()
    blocks.forEach(blk => {
      if (blk.containerPosition && blk.stackId) {
        containerPositions.set(blk.stackId, blk.containerPosition)
      }
    })

    // 2. Pre-create container nodes with saved positions
    const preCreatedContainers: Node[] = Array.from(containerPositions).map(([id, pos]) => ({
      id,
      type: 'stackContainer',
      position: pos,
      style: { width: opts.blockWidth + 8 },
      data: {
        stackId: id,
        width: opts.blockWidth + 8,
        manualWidth: undefined,
        isDragging: false,
      },
    }))

    // 3. Create nodes from blocks
    const created: Node[] = blocks.map((blk, idx) => {
      const id = blk.id ?? nextBlockId()
      if (!nodeRefsMap.current[id]) nodeRefsMap.current[id] = { current: null }

      const x = blk.position?.x ?? 100
      const y = blk.position?.y ?? (100 + idx * 28)

      const payload = resolvePayload(blk)
      const data: BlockData = {
        contentJson: payload.json,
        cachedHTML: payload.html,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        height: 24,
        insertionOrder: idx,
        isBottomNode: idx === blocks.length - 1,
        focusRef: nodeRefsMap.current[id],
        stackId: blk.stackId,
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
      const data: BlockData = {
        contentJson: payload.json,
        cachedHTML: payload.html,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        height: 24,
        insertionOrder: idx,
        isBottomNode: idx === initial.length - 1,
        focusRef: nodeRefsMap.current[id],
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

    // Apply layout only to blocks that are actually in a stack
    let laidOut: Node[] = wired
    if (stackId) {
      // Only apply stack layout if we actually created a stack
      laidOut = applyLayout(stackId, wired) as Node[]
    } else {
      // For standalone blocks, just sync containers (no stacking)
      laidOut = syncContainers(wired) as Node[]
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

    // Emit change event for each grouped node
    nodeIds.forEach(nodeId => {
      emitChange({
        type: 'block.group',
        blockId: nodeId,
      })
    })
  }, [getBlocks, loadBlocks, reactFlowInstance, emitChange])

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

  return {
    nodes,
    nodeTypes,
    onNodesChange,
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

      drag.onNodeDragStart(evt, node, nodesRef)
    },
    onNodeDrag: (evt, node) => drag.onNodeDrag(evt, node, nodesRef, setNodes, reactFlowInstance.flowToScreenPosition, reactFlowInstance.getViewport().zoom),
    onNodeDragStop: (evt, node) => {
      // Handle auto-grouping if enabled
      if (opts.enableAutoGrouping) {
        const allNodesSnapshot = reactFlowInstance.getNodes()
        const dropPoint = reactFlowInstance.screenToFlowPosition({ x: evt.clientX, y: evt.clientY })
        const intersectingGroup = findIntersectingGroup(dropPoint, allNodesSnapshot, opts.groupNodeTypes)

        const hadOriginalExtent = (node as any).__originalExtent

        // AUTO-PARENT: Node dropped into group
        if (intersectingGroup && !node.parentId) {
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
            // Use current React Flow position (already updated during drag)
            const currentRFNode = allNodesSnapshot.find(n => n.id === node.id)
            const absolutePos = currentRFNode?.position || node.position
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
                  }
                : b
            )

            // Update React Flow nodes directly instead of loadBlocks
            setNodes((currentNodes) => {
              // Update block node with new parentId/extent/position
              const updated = currentNodes.map((rfNode) => {
                if (rfNode.id === node.id && rfNode.type === 'block') {
                  const updatedBlock = updatedBlocks.find(b => b.id === node.id)!
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
          // Only auto-unparent if parent is a GROUP node, not a stack container
          const parentNode = allNodesSnapshot.find(n => n.id === node.parentId)
          const isGroupParent = parentNode && opts.groupNodeTypes?.includes(parentNode.type)

          if (!isGroupParent) {
            // Parent is a stack container or other non-group parent
            // Skip auto-unparent, fall through to normal drag handling
          } else {
            // Parent is a group - proceed with auto-unparent
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

              // Skip normal drag stop handling
              return
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

            // Skip normal drag stop handling
            return
          }
          }
        }

        // RESTORE EXTENT: Node dragged but stayed within parent
        if (hadOriginalExtent && node.parentId) {
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
    expandStack,
    // Grouping APIs
    groupNodes,
    ungroupNodes,
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
