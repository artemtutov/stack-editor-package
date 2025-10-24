// Main exports for @stack-editor/react package
export { default as StackEditor } from './StackEditor'
export { default as useStackEditor } from './useStackEditor'

// Export types
export type {
  BlockData,
  BlockId,
  StackEditorOptions,
  InitialBlock,
  StackEditorValue,
  StackEditorHookArgs,
  StackEditorHookResult,
  StackSnapshot,
  ChangeEvent,
  ChangeEventType,
  ChangeListener,
} from './types'
export { STACK_SNAPSHOT_VERSION } from './types'

// Export renderers for customization
export { default as NotionBlock } from './renderers/NotionBlock'
export { default as StackContainer } from './renderers/StackContainer'
export { default as SlashMenu } from './renderers/SlashMenu'
export { default as DropIndicator } from './renderers/DropIndicator'
export { default as FullscreenModal } from './renderers/FullscreenModal'
export { default as FullscreenEditor } from './renderers/FullscreenEditor'

// Export grouping utilities
export {
  getAbsolutePosition,
  convertAbsoluteToRelative,
  convertRelativeToAbsolute,
  isPointWithinNode,
  findIntersectingGroup,
} from './logic/grouping'
