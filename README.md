# @stack-editor/react

A Notion-style stacked block editor built on React Flow. Features drag-and-drop stacking, keyboard navigation, and customizable block renderers.

## Features

- ✨ **Notion-style stacking** - Vertical block stacking with automatic layout
- 🎯 **Drag & drop** - Reorder blocks with visual drop indicators
- ⌨️ **Keyboard navigation** - Tab/Shift+Tab navigation, Enter to split, Backspace to merge
- 🎨 **Customizable renderers** - Override default block and container components
- 📦 **Lightweight** - Built on @xyflow/react with minimal dependencies

## Installation

```bash
npm install @stack-editor/react @xyflow/react react react-dom
```

## Quick Start

```tsx
import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { StackEditor } from '@stack-editor/react'
import '@stack-editor/react/styles.css'

function App() {
  return (
    <ReactFlowProvider>
      <StackEditor initialBlocks={[{ html: '<p>Start typing...</p>' }]}>
        {({ nodes, nodeTypes, onNodesChange, onNodeDragStart, onNodeDrag, onNodeDragStop, onMove }) => (
          <ReactFlow
            nodes={nodes}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onMove={onMove}
            style={{ width: '100%', height: '100vh' }}
          />
        )}
      </StackEditor>
    </ReactFlowProvider>
  )
}
```

## API

### StackEditor Props

```tsx
interface StackEditorProps {
  // Initial blocks to render
  initialBlocks?: Array<{ id?: string; html?: string }>

  // Customize block renderer
  renderBlock?: (props: NodeProps) => React.ReactNode

  // Customize container renderer
  renderContainer?: (props: NodeProps) => React.ReactNode

  // Configuration options
  options?: {
    blockWidth?: number          // Default: 200
    gap?: number                 // Default: 2
    headerHeight?: number        // Default: 28
    enableContainerDrag?: boolean // Default: true
    enableShiftGroupDrag?: boolean // Default: true
    enableSlashMenu?: boolean    // Default: true
    xTolerance?: number          // Default: 10
    yHysteresis?: number         // Default: 3
  }

  // Render prop that receives editor state
  children: (api: StackEditorHookResult) => React.ReactNode
}
```

### useStackEditor Hook

For more control, use the hook directly:

```tsx
import { useStackEditor } from '@stack-editor/react'

const editor = useStackEditor({
  initialBlocks: [{ html: '<p>Hello</p>' }],
  options: { blockWidth: 250 }
})

// Access editor state
editor.nodes        // Current nodes
editor.nodeTypes    // Node type definitions
editor.focus(id)    // Focus a block
editor.addBelow(id) // Add block below
editor.split(id, before, after) // Split block
editor.delete(id)   // Delete block
```

## Development

```bash
# Install dependencies
npm install

# Run demo in development mode
npm run dev

# Build library
npm run build

# Type check
npm run typecheck
```

## Local Development with npm link

To test this package in another project:

```bash
# In stack-editor-package directory
npm link

# In your project directory
npm link @stack-editor/react
```

Changes to the package will be reflected in your linked project.

## License

MIT
