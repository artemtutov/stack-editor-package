import type { Node, NodeTypes } from '@xyflow/react'
import type { JSONContent } from '@tiptap/core'

export type BlockId = string

export type RichTextPayload = {
  json: JSONContent
  html: string
}

export type BlockData = {
  contentJson: JSONContent
  cachedHTML?: string
  schemaVersion: number
  stackId?: string
  height?: number
  insertionOrder?: number
  isBottomNode?: boolean
  // callbacks populated by the hook; included here for convenience typing
  onContentUpdate?: (payload: RichTextPayload) => void
  onAdd?: (initialContent?: RichTextPayload) => void
  onAddMultiple?: (payloads: RichTextPayload[]) => void
  onHeightChange?: (id: string, height: number) => void
  onTabNext?: (id: string) => void
  onTabPrev?: (id: string) => void
  onArrowUp?: (id: string) => void
  onArrowDown?: (id: string) => void
  onSlashCommand?: (id: string, rect?: DOMRect | null) => void
  onDelete?: (id: string) => void
  onSplit?: (id: string, before: RichTextPayload, after: RichTextPayload) => void
  onMergeUp?: (id: string, currentContent?: RichTextPayload) => void
  focusRef?: { current: null | { focus: () => void; setCaretToEnd?: () => void; setCaretAt?: (pos: number) => void; getLatestJson?: () => JSONContent } }
  placeholder?: string
}

export type StackEditorOptions = {
  blockWidth?: number
  gap?: number
  headerHeight?: number
  enableContainerDrag?: boolean
  enableShiftGroupDrag?: boolean
  enableSlashMenu?: boolean
  xTolerance?: number // px: horizontal tolerance to consider a stack target
  yHysteresis?: number // px: vertical band around midlines to reduce flicker
  indicatorStabilityPx?: number // px: minimal delta to update overlay
}

export type InitialBlock = {
  id?: string
  contentJson?: JSONContent
  html?: string
}

export type StackEditorValue = InitialBlock[]

export type StackEditorControlled = {
  value: StackEditorValue
  onChange: (value: StackEditorValue) => void
}

export type StackEditorHookArgs = {
  initialBlocks?: StackEditorValue
  options?: StackEditorOptions
  // controlled mode (optional)
  controlled?: StackEditorControlled
}

export type StackEditorHookResult = {
  nodes: Node[]
  nodeTypes: NodeTypes
  onNodesChange: (changes: any) => void
  onNodeDragStart: (evt: React.MouseEvent, node: Node) => void
  onNodeDrag: (evt: React.MouseEvent, node: Node) => void
  onNodeDragStop: (evt: React.MouseEvent, node: Node) => void
  onMove: (_evt: any, viewport: { x: number; y: number; zoom: number }) => void
  // helpers
  focus: (blockId: string) => void
  addBelow: (blockId: string, initialContent?: RichTextPayload) => void
  split: (blockId: string, before: RichTextPayload, after: RichTextPayload) => void
  delete: (blockId: string) => void
  // overlays to render alongside ReactFlow
  overlays: React.ReactNode
}
