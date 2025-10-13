import { useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { StackEditor } from '../src'
import '../src/styles/block-editor.css'
import '../src/styles/fullscreen-editor.scss'
import TipTapDemo from './TipTapDemo'

type DemoType = 'stack' | 'tiptap'

export default function App() {
  const [activeDemo, setActiveDemo] = useState<DemoType>('stack')

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Demo Navigation */}
      <div style={{
        display: 'flex',
        gap: '0',
        padding: '0',
        background: '#ffffff',
        borderBottom: '1px solid #e0e0e0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <button
          onClick={() => setActiveDemo('stack')}
          style={{
            padding: '16px 32px',
            border: 'none',
            background: activeDemo === 'stack' ? '#f8f8fb' : 'transparent',
            borderBottom: activeDemo === 'stack' ? '2px solid #6229e5' : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: activeDemo === 'stack' ? '600' : '400',
            fontSize: '14px',
            color: activeDemo === 'stack' ? '#6229e5' : '#666',
            transition: 'all 0.2s',
          }}
        >
          Stack Editor Demo
        </button>
        <button
          onClick={() => setActiveDemo('tiptap')}
          style={{
            padding: '16px 32px',
            border: 'none',
            background: activeDemo === 'tiptap' ? '#f8f8fb' : 'transparent',
            borderBottom: activeDemo === 'tiptap' ? '2px solid #6229e5' : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: activeDemo === 'tiptap' ? '600' : '400',
            fontSize: '14px',
            color: activeDemo === 'tiptap' ? '#6229e5' : '#666',
            transition: 'all 0.2s',
          }}
        >
          TipTap Editor Demo
        </button>
      </div>

      {/* Demo Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {activeDemo === 'stack' ? (
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
        ) : (
          <TipTapDemo />
        )}
      </div>
    </div>
  )
}
