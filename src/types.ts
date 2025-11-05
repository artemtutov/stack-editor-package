import type { Node, NodeTypes } from '@xyflow/react'
import type { JSONContent, Editor } from '@tiptap/core'

export type BlockId = string

export type SlashPayload = {
  anchor: { x: number; y: number }
  range: { from: number; to: number; query: string }
  blockId: string
  getEditor: () => Editor | null
}

export type RichTextPayload = {
  json: JSONContent
  html: string
}

export type ContentType = 'list' | 'todo' | 'heading' | 'paragraph'

export type BlockData = {
  // Core identity (stable across operations)
  canonicalName: string
  // Content
  contentJson: JSONContent
  cachedHTML?: string
  schemaVersion: number
  // Derived content metadata (readonly - auto-computed from contentJson)
  readonly contentPreview: string
  readonly contentType: ContentType
  readonly contentHash: string
  // Stack relationship
  stackId?: string
  readonly stackIndex?: number  // Position within stack [0..n-1]
  // Layout
  height?: number
  insertionOrder?: number
  isBottomNode?: boolean
  // callbacks populated by the hook; included here for convenience typing
  onContentUpdate?: (payload: RichTextPayload) => void
  onContentCommit?: () => void  // Called when content editing completes (e.g., on blur)
  onAdd?: (initialContent?: RichTextPayload, isEmptyBlock?: boolean) => void
  onAddMultiple?: (payloads: RichTextPayload[]) => void
  onHeightChange?: (id: string, height: number) => void
  onTabNext?: (id: string) => void
  onTabPrev?: (id: string) => void
  onArrowUp?: (id: string) => void
  onArrowDown?: (id: string) => void
  onSlashCommand?: (payload: SlashPayload) => void
  onDelete?: (id: string) => void
  onSplit?: (id: string, before: RichTextPayload, after: RichTextPayload) => void
  onMergeUp?: (id: string, currentContent?: RichTextPayload) => void
  focusRef?: { current: null | { focus: () => void; setCaretToEnd?: () => void; setCaretAt?: (pos: number) => void; getLatestJson?: () => JSONContent } }
  placeholder?: string
}

export type StackContainerData = {
  canonicalName: string
  stackId: string
  title?: string
}

export type StackEditorOptions = {
  blockWidth?: number
  gap?: number
  headerHeight?: number
  enableContainerDrag?: boolean
  enableShiftGroupDrag?: boolean
  enableSlashMenu?: boolean
  enableAutoGrouping?: boolean // Enable automatic grouping on drag (default: true)
  groupNodeTypes?: string[] // Node types to treat as groups (default: ['group'])
  xTolerance?: number // px: horizontal tolerance to consider a stack target
  yHysteresis?: number // px: vertical band around midlines to reduce flicker
  indicatorStabilityPx?: number // px: minimal delta to update overlay
  enableLogging?: boolean // Enable debug logging (default: false)
}

export type StackEditorCallbacks = {
  onToggleSidebar?: () => void // Callback to toggle sidebar in fullscreen mode
  isSidebarOpen?: boolean // Whether the sidebar is currently open
}

export type InitialBlock = {
  id?: string
  // Canonical identity
  canonicalName?: string                // Stable identifier (auto-generated if missing)
  // Content
  contentJson?: JSONContent
  html?: string
  // Derived content metadata (optional on load, will be computed if missing)
  contentPreview?: string
  contentType?: ContentType
  contentHash?: string
  // Positioning
  position?: { x: number; y: number }  // Position hint for block placement
  parentId?: string                     // Parent node ID for grouping
  extent?: 'parent'                     // Boundary constraint
  // Stack relationship
  stackId?: string                      // Stack relationship (preserved across saves)
  stackIndex?: number                   // Position within stack
  containerPosition?: { x: number; y: number }  // Position of parent container (for stack persistence)
  containerParentId?: string            // Parent node ID of the container (for grouped containers)
  containerExtent?: 'parent'            // Boundary constraint of the container (for grouped containers)
  containerCanonicalName?: string       // Canonical name of the container
}

export type StackEditorValue = InitialBlock[]

export type StackEditorHookArgs = {
  initialBlocks?: StackEditorValue
  options?: StackEditorOptions
  callbacks?: StackEditorCallbacks
}

// Snapshot version for future compatibility
export const STACK_SNAPSHOT_VERSION = 1

// Snapshot structure for undo/redo
export type StackSnapshot = {
  version: number
  blocks: InitialBlock[]
  timestamp: number
}

// Change event types for undo/redo coordination
export type ChangeEventType =
  | 'block.create'
  | 'block.delete'
  | 'block.move.end'
  | 'block.move'           // NEW: Index-based stack reordering
  | 'block.rename'         // NEW: Canonical name change
  | 'block.content.update' // NEW: Content update with metadata
  | 'block.group'
  | 'block.ungroup'
  | 'content.commit'
  | 'stack.expand'
  | 'stack.collapse'
  | 'stack.create'         // NEW: Stack creation
  | 'group.delete'

export type ChangeEvent = {
  type: ChangeEventType
  // Core identifiers
  blockId?: string
  stackId?: string
  groupId?: string
  canonicalName?: string
  // Event metadata for determinism
  eventId?: string
  timestamp?: number
  // Rename-specific
  previousName?: string
  newName?: string
  // Move-specific
  from?: { stackId?: string; index?: number }
  to?: { stackId?: string; index?: number }
  affected?: string[]  // Canonical names of blocks affected by reindexing
  // Content-specific
  contentHash?: string
  contentPreview?: string
  contentType?: ContentType
  // Stack index
  stackIndex?: number
}

export type ChangeListener = (event: ChangeEvent) => void

export type StackEditorHookResult = {
  nodes: Node[]
  nodeTypes: NodeTypes
  onNodesChange: (changes: any) => void
  onNodeDragStart: (evt: React.MouseEvent, node: Node) => void
  onNodeDrag: (evt: React.MouseEvent, node: Node) => void
  onNodeDragStop: (evt: React.MouseEvent, node: Node) => void
  onMove: (_evt: any, viewport: { x: number; y: number; zoom: number }) => void
  // Block operations
  focus: (blockId: string) => void
  addBelow: (blockId: string, initialContent?: RichTextPayload) => void
  split: (blockId: string, before: RichTextPayload, after: RichTextPayload) => void
  delete: (blockId: string) => void
  createBlock: (block: Partial<InitialBlock>) => { id: string; canonicalName: string }
  // Canonical name operations (NEW)
  findBlockByCanonical: (name: string) => InitialBlock | null
  findStackByCanonical: (name: string) => string | null  // Returns stackId
  renameCanonical: (args: { from: string; to: string }) => void
  updateBlockContent: (args: { canonicalName: string; contentJson: JSONContent }) => void
  // Stack operations
  createStack: (args: { title?: string; canonicalName?: string; position?: { x: number; y: number } }) => { stackId: string; canonicalName: string }
  moveBlock: (args: { canonicalName: string; stackId?: string; index?: number }) => { from: { stackId?: string; index?: number }; to: { stackId: string; index: number }; affected: string[] }
  expandStack: (stackId: string) => void
  // Persistence
  getBlocks: () => InitialBlock[]
  loadBlocks: (blocks: InitialBlock[]) => void
  // Grouping APIs
  groupNodes: (nodeIds: string[], parentGroupId: string) => void
  ungroupNodes: (nodeIds: string[]) => void
  deleteGroup: (groupId: string) => string[]
  updateNodeParent: (nodeId: string, parentId?: string, extent?: 'parent') => void
  // overlays to render alongside ReactFlow
  overlays: React.ReactNode
  // History/undo-redo APIs
  getSnapshot: () => StackSnapshot
  applySnapshot: (snapshot: StackSnapshot, options?: { silent?: boolean }) => void
  // Transaction APIs for grouping operations
  beginTransaction: (name?: string) => void
  commitTransaction: (name: string) => void
  abortTransaction: () => void
  // Change subscription for coordinating with host history
  onChange: (listener: ChangeListener) => () => void
}
