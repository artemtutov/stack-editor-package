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
