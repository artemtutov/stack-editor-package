import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { StackEditor } from '../src'
import '../src/styles/block-editor.css'
import '../src/styles/fullscreen-editor.scss'

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <ReactFlowProvider>
        <StackEditor initialBlocks={[{ html: '<p></p>' }]}>
          {({ nodes, nodeTypes, onNodesChange, onNodeDragStart, onNodeDrag, onNodeDragStop, onMove }) => (
            <ReactFlow
              nodes={nodes}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onMove={onMove}
              panOnScroll
              panOnDrag
              zoomOnScroll
              style={{ background: '#f8f8fb' }}
            >
              <MiniMap />
              <Controls />
              <Background gap={16} color="#e0e0e0" />
            </ReactFlow>
          )}
        </StackEditor>
      </ReactFlowProvider>
    </div>
  )
}
