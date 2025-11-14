// Initialize logging system
import './utils/setupLogger'

// Main exports for @stack-editor/react package
export { default as StackEditor } from './StackEditor'
export { default as useStackEditor } from './useStackEditor'

// Export logging control functions
export { enableLogging, disableLogging, isLoggingEnabled } from './utils/setupLogger'

// Export types
export type {
  BlockData,
  BlockId,
  ContentType,
  StackContainerData,
  StackEditorOptions,
  InitialBlock,
  StackEditorValue,
  StackEditorHookArgs,
  StackEditorHookResult,
  StackSnapshot,
  ChangeEvent,
  ChangeEventType,
  ChangeListener,
  StackEdge,
} from './types'
export { STACK_SNAPSHOT_VERSION } from './types'

// Export renderers for customization
export { default as NotionBlock } from './renderers/NotionBlock'
export { default as StackContainer } from './renderers/StackContainer'
export { default as SlashMenu } from './renderers/SlashMenu'
export { default as DropIndicator } from './renderers/DropIndicator'
export { default as FullscreenModal } from './renderers/FullscreenModal'
export { default as FullscreenEditor } from './renderers/FullscreenEditor'

// Export connection components
export { StackHandles } from './components/StackHandles'
export { FloatingEdge } from './components/FloatingEdge'

// Export grouping utilities
export {
  getAbsolutePosition,
  convertAbsoluteToRelative,
  convertRelativeToAbsolute,
  isPointWithinNode,
  findIntersectingGroup,
} from './logic/grouping'

// Export content helper utilities
export {
  extractPreview,
  detectContentType,
  computeContentHash,
  computeContentHashSync,
  computeStructureHash,
  normalizeContentJson,
  countItems,
  getTodoStats,
  getWordCount,
  PREVIEW_ALGO_VERSION,
  HASH_ALGO_VERSION,
} from './logic/contentHelpers'

// Export canonical name utilities
export {
  CanonicalNameRegistry,
  CanonicalNameError,
  generateCanonicalName,
  normalizeCanonicalName,
  validateNotReserved,
} from './logic/canonicalNames'
