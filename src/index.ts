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
  StackEditorControlled,
  StackEditorHookArgs,
  StackEditorHookResult,
} from './types'

// Export renderers for customization
export { default as NotionBlock } from './renderers/NotionBlock'
export { default as StackContainer } from './renderers/StackContainer'
export { default as SlashMenu } from './renderers/SlashMenu'
export { default as DropIndicator } from './renderers/DropIndicator'
export { default as FullscreenModal } from './renderers/FullscreenModal'
