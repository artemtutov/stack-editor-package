import React, { useMemo } from 'react'
import type { NodeTypes } from '@xyflow/react'
import useStackEditor from './useStackEditor'
import NotionBlock from './renderers/NotionBlock'
import StackContainer from './renderers/StackContainer'
import type { StackEditorHookArgs, StackEditorHookResult } from './types'

// Import CSS once from the wrapper (or consumer can import directly)
import './styles/block-editor.css'
import './styles/tiptap-basic.css'

export type StackEditorSlots = {
  renderBlock?: any
  renderContainer?: any
}

export type StackEditorProps = StackEditorHookArgs &
  StackEditorSlots & {
    children: (api: StackEditorHookResult & { nodeTypes: NodeTypes }) => React.ReactNode
  }

/**
 * StackEditor - A Notion-style stacked block editor component.
 *
 * @description
 * Provides a complete stacked block editing experience with:
 * - Vertical block stacking with automatic layout
 * - Drag-and-drop reordering with visual indicators
 * - Rich text editing via TipTap (supports ~20-30 blocks smoothly)
 * - Keyboard navigation (Tab/Shift+Tab, Enter, Backspace, Arrow keys)
 * - Fullscreen editing mode with deep-sync block diffing
 * - Customizable block and container renderers
 *
 * @example
 * ```tsx
 * import { StackEditor } from '@stack-editor/react'
 * import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
 * import '@xyflow/react/dist/style.css'
 * import '@stack-editor/react/styles.css'
 *
 * function App() {
 *   return (
 *     <ReactFlowProvider>
 *       <StackEditor initialBlocks={[{ html: '<p>Hello</p>' }]}>
 *         {({ nodes, nodeTypes, onNodesChange, onNodeDragStart, onNodeDrag, onNodeDragStop }) => (
 *           <ReactFlow
 *             nodes={nodes}
 *             nodeTypes={nodeTypes}
 *             onNodesChange={onNodesChange}
 *             onNodeDragStart={onNodeDragStart}
 *             onNodeDrag={onNodeDrag}
 *             onNodeDragStop={onNodeDragStop}
 *           />
 *         )}
 *       </StackEditor>
 *     </ReactFlowProvider>
 *   )
 * }
 * ```
 *
 * @param props - StackEditor configuration
 * @param props.initialBlocks - Initial blocks to render (optional)
 * @param props.renderBlock - Custom block renderer (optional)
 * @param props.renderContainer - Custom stack container renderer (optional)
 * @param props.options - Editor configuration options (optional)
 * @param props.children - Render prop receiving editor API and nodeTypes
 *
 * @returns React component with editor overlays (modals, slash menu, drop indicators)
 */
export default function StackEditor({ renderBlock, renderContainer, children, ...hookArgs }: StackEditorProps) {
  const api = useStackEditor(hookArgs)

  const nodeTypes = useMemo(() => {
    const base: NodeTypes = {
      block: renderBlock || ((props: any) => <NotionBlock {...props} />),
      stackContainer: renderContainer || ((props: any) => <StackContainer {...props} />),
    }
    return base
  }, [renderBlock, renderContainer])

  return (
    <>
      {children({ ...api, nodeTypes })}
      {api.overlays}
    </>
  )
}
