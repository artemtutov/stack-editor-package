import { useState, useMemo, useCallback } from 'react'
import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider, Node, NodeProps, NodeChange, MarkerType, ConnectionMode } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStackEditor, FloatingEdge } from '../src'
import '../src/styles/block-editor.css'
import '../src/styles/fullscreen-editor.scss'
import TipTapDemo from './TipTapDemo'

type DemoType = 'stack' | 'tiptap'

// Custom GroupNode component for testing
function GroupNode({ data }: NodeProps) {
  const label = (data as any)?.label || 'Test Group'

  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: '3px dashed #6229e5',
      background: 'rgba(98, 41, 229, 0.1)',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      pointerEvents: 'all',
      position: 'relative',
      boxShadow: '0 0 0 1px rgba(98, 41, 229, 0.1)',
    }}>
      <div style={{
        fontSize: '16px',
        fontWeight: '700',
        color: '#6229e5',
        marginBottom: '8px',
        textShadow: '0 1px 2px rgba(255, 255, 255, 0.8)',
      }}>
        📦 {label}
      </div>
      <div style={{
        fontSize: '13px',
        color: '#666',
        fontStyle: 'italic',
      }}>
        Drag blocks here to test grouping
      </div>
    </div>
  )
}

function StackDemo() {
  // State for group node position (so it can be dragged)
  const [groupPosition, setGroupPosition] = useState({ x: 350, y: 200 })
  const [savedState, setSavedState] = useState<any>(null)

  const stackEditor = useStackEditor({
    initialBlocks: [
      // Blocks outside group (left side) - for dragging in
      {
        id: 'block-outside-1',
        html: '<p><strong>Drag me into the group →</strong></p>',
        position: { x: 50, y: 250 }
      },
      {
        id: 'block-outside-2',
        html: '<p>Or drag me into the group →</p>',
        position: { x: 50, y: 320 }
      },

      // Blocks already inside group (grouped)
      {
        id: 'block-inside-1',
        html: '<p>✅ I am grouped! Drag me out.</p>',
        position: { x: 20, y: 60 }, // relative to group
        parentId: 'test-group',
        extent: 'parent'
      },
      {
        id: 'block-inside-2',
        html: '<p>✅ Me too! Try moving around.</p>',
        position: { x: 20, y: 130 }, // relative to group
        parentId: 'test-group',
        extent: 'parent'
      },

      // Blocks in a GROUPED STACK (testing container grouping persistence)
      {
        id: 'grouped-stack-block-1',
        html: '<p>🎯 I am in a grouped stack!</p>',
        position: { x: 20, y: 60 }, // relative to container
        stackId: 'grouped-stack-container',
        containerPosition: { x: 600, y: 60 }, // container position relative to group
        containerParentId: 'test-group', // Container is grouped!
        containerExtent: 'parent'
      },
      {
        id: 'grouped-stack-block-2',
        html: '<p>🎯 Me too - save & reload to test!</p>',
        position: { x: 20, y: 130 }, // relative to container
        stackId: 'grouped-stack-container',
        containerPosition: { x: 600, y: 60 },
        containerParentId: 'test-group',
        containerExtent: 'parent'
      },

      // Another block far away for general testing
      {
        id: 'block-far',
        html: '<p>🎯 Free block - test stacking!</p>',
        position: { x: 750, y: 300 }
      }
    ],
    options: {
      enableAutoGrouping: true,  // Enable drag-based grouping
      groupNodeTypes: ['group'], // Recognize 'group' type nodes
    }
  })

  // Save current state
  const handleSave = useCallback(() => {
    const blocks = stackEditor.getBlocks()
    const edges = stackEditor.getEdges()
    setSavedState({ blocks, edges, groupPosition })
    console.log('💾 Saved state:', { blocks, edges, groupPosition })
  }, [stackEditor, groupPosition])

  // Load saved state
  const handleLoad = useCallback(() => {
    if (savedState) {
      setGroupPosition(savedState.groupPosition)
      stackEditor.loadBlocks(savedState.blocks)
      if (savedState.edges) {
        stackEditor.setEdges(savedState.edges.map((edge: any) => ({
          ...edge,
          type: 'floating',
          style: {
            stroke: 'rgb(35, 131, 226)',
            strokeWidth: 2,
            strokeLinecap: 'round',
          },
          markerEnd: {
            type: 'ArrowClosed',
            color: 'rgb(35, 131, 226)',
          },
        })))
      }
      console.log('📂 Loaded state:', savedState)
    }
  }, [stackEditor, savedState])

  // Combine stack editor nodes with our test group node
  const allNodes = useMemo(() => {
    const groupNode: Node = {
      id: 'test-group',
      type: 'group',
      position: groupPosition,  // Use state so it can update
      width: 800,
      height: 300,
      style: {
        width: 800,
        height: 300,
        backgroundColor: 'transparent',
      },
      data: { label: 'Test Group' },
      selectable: true,
      draggable: true,
    }

    return [groupNode, ...stackEditor.nodes]
  }, [stackEditor.nodes, groupPosition])

  // Custom nodes change handler to manage both group and stack nodes
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Separate changes by node type
    const groupChanges = changes.filter(change =>
      'id' in change && change.id === 'test-group'
    )
    const stackChanges = changes.filter(change =>
      !('id' in change) || change.id !== 'test-group'
    )

    // Handle group node position updates
    groupChanges.forEach(change => {
      if (change.type === 'position' && change.position) {
        setGroupPosition(change.position)
      }
    })

    // Forward other changes to stack editor
    if (stackChanges.length > 0) {
      stackEditor.onNodesChange(stackChanges)
    }
  }, [stackEditor])

  // Combine node types
  const allNodeTypes = useMemo(() => ({
    ...stackEditor.nodeTypes,
    group: GroupNode,
  }), [stackEditor.nodeTypes])

  // Edge types
  const edgeTypes = useMemo(() => ({
    floating: FloatingEdge,
  }), [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Instructions Overlay */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '16px 24px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '2px solid #6229e5',
        maxWidth: '600px',
      }}>
        <div style={{ fontSize: '16px', fontWeight: '600', color: '#6229e5', marginBottom: '8px' }}>
          🎯 Testing Auto-Grouping & Persistence (v0.3.1)
        </div>
        <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.6' }}>
          <div>✨ <strong>Drag blocks into</strong> the dashed group → they auto-parent</div>
          <div>✨ <strong>Drag grouped blocks out</strong> → they auto-unparent</div>
          <div>✨ <strong>Move blocks within group</strong> → they stay grouped</div>
          <div>✨ <strong>Drag the group itself</strong> → grouped blocks move with it!</div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
            💡 Press <kbd>Enter</kbd> to create new blocks. Try creating stacks inside the group!
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 16px',
                background: '#6229e5',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
              }}
            >
              💾 Save State
            </button>
            <button
              onClick={handleLoad}
              disabled={!savedState}
              style={{
                padding: '8px 16px',
                background: savedState ? '#10b981' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: savedState ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: '600',
              }}
            >
              📂 Load State
            </button>
            {savedState && (
              <span style={{ fontSize: '12px', color: '#10b981', alignSelf: 'center', marginLeft: '4px' }}>
                ✓ State saved
              </span>
            )}
          </div>
        </div>
      </div>

      <ReactFlow
        nodes={allNodes}
        nodeTypes={allNodeTypes}
        edges={stackEditor.edges}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={stackEditor.onEdgesChange}
        onConnect={stackEditor.onConnect}
        onNodeDragStart={stackEditor.onNodeDragStart}
        onNodeDrag={stackEditor.onNodeDrag}
        onNodeDragStop={stackEditor.onNodeDragStop}
        onMove={stackEditor.onMove}
        connectionMode={ConnectionMode.Loose}
        panOnScroll
        panOnDrag
        zoomOnScroll
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        style={{ background: '#f8f8fb' }}
        fitView={false}
      >
        <MiniMap />
        <Controls />
        <Background gap={16} color="#e0e0e0" />
        {stackEditor.overlays}
      </ReactFlow>
    </div>
  )
}

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
          Stack Editor Demo (with Grouping!)
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
            <StackDemo />
          </ReactFlowProvider>
        ) : (
          <TipTapDemo />
        )}
      </div>
    </div>
  )
}
