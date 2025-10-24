# @stack-editor/react

A Notion-style stacked block editor built on React Flow. Features drag-and-drop stacking, keyboard navigation, rich text editing via TipTap, and customizable block renderers.

## 🎉 What's New in v0.3.0

Native grouping support for React Flow group nodes! No more glue code needed.

- ✅ **Drag-based auto-grouping** - Blocks automatically parent/unparent when dragged into/out of groups
- ✅ **Selection-based APIs** - `groupNodes()`, `ungroupNodes()`, `updateNodeParent()`
- ✅ **Nested group support** - Works with groups within groups
- ✅ **Position utilities** - Exported helpers for coordinate conversion
- ✅ **Undo/redo events** - Emits `block.group` and `block.ungroup` events

[**📖 See migration guide**](./GROUPING_INTEGRATION.md) if upgrading from v0.2.x

## Features

- ✨ **Notion-style stacking** - Vertical block stacking with automatic layout
- 📝 **Rich text editing** - TipTap integration with formatting, headings, lists, links, and more
- 🎯 **Drag & drop** - Reorder blocks with visual drop indicators
- 🔲 **Native grouping support** ⭐ NEW in v0.3.0 - Auto-grouping on drag, selection-based APIs, nested groups
- ⌨️ **Keyboard navigation** - Tab/Shift+Tab navigation, Enter to split, Backspace to merge
- 🖥️ **Fullscreen mode** - Deep-sync editing with block diffing (blocksToDoc/docToBlocks)
- 🎨 **Customizable renderers** - Override default block and container components
- 📦 **Bundle size** - ~150KB gzipped (includes TipTap rich text editor)

## Bundle Size

| Package | Size (gzipped) |
|---------|----------------|
| @stack-editor/react | ~150KB |

The package includes TipTap and all necessary rich text editing dependencies bundled together for ease of use. No additional dependencies required!

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
      <StackEditor
        initialBlocks={[
          { html: '<h1>Welcome</h1>' },
          { html: '<p>Start typing with rich text support!</p>' }
        ]}
      >
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

### Rich Text Features

- **Formatting**: Bold, italic, underline, highlight, strikethrough
- **Headings**: H1, H2, H3
- **Lists**: Bullet lists, ordered lists, task lists (checkboxes)
- **Links**: Auto-linking with validation (https/mailto only)
- **Blockquotes**: Quote formatting
- **Keyboard shortcuts**: Standard shortcuts (Cmd/Ctrl+B, Cmd/Ctrl+I, etc.)
- **Slash menu**: Type `/` for quick formatting options
- **Mobile support**: Touch-friendly with safe-area insets

### Grouping Features ⭐ NEW

Version 0.3.0 introduces native grouping support for React Flow group nodes:

- **Drag-based auto-grouping**: Drag blocks into/out of groups to automatically parent/unparent
- **Selection-based grouping**: Use `groupNodes()` and `ungroupNodes()` APIs
- **Nested groups**: Full support for groups within groups
- **Container grouping**: Stack containers can be grouped too
- **Position utilities**: Exported helpers for coordinate conversion
- **Undo/redo integration**: Emits `block.group` and `block.ungroup` events

```tsx
// Enable auto-grouping (enabled by default)
const editor = useStackEditor({
  options: {
    enableAutoGrouping: true,      // Auto-parent on drag
    groupNodeTypes: ['group'],     // Which node types are groups
  }
})

// Selection-based grouping
editor.groupNodes(['block1', 'block2'], 'group-123')

// Ungrouping
editor.ungroupNodes(['block1', 'block2'])

// Position utilities
import { getAbsolutePosition, convertAbsoluteToRelative } from '@stack-editor/react'
const absolutePos = getAbsolutePosition(node, allNodes)
```

📖 **[See full integration guide](./GROUPING_INTEGRATION.md)** for migrating from custom glue code.

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
    blockWidth?: number            // Default: 242
    gap?: number                   // Default: 2
    headerHeight?: number          // Default: 28
    enableContainerDrag?: boolean  // Default: true
    enableShiftGroupDrag?: boolean // Default: true
    enableSlashMenu?: boolean      // Default: true
    enableAutoGrouping?: boolean   // Default: true (NEW in v0.3.0)
    groupNodeTypes?: string[]      // Default: ['group'] (NEW in v0.3.0)
    xTolerance?: number            // Default: 10
    yHysteresis?: number           // Default: 3
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

// Grouping APIs (NEW in v0.3.0)
editor.groupNodes(['id1', 'id2'], 'groupId')  // Group blocks
editor.ungroupNodes(['id1', 'id2'])           // Ungroup blocks
editor.updateNodeParent('id', 'groupId')      // Set parent

// Persistence
editor.getBlocks()       // Get current state (includes parentId/extent)
editor.loadBlocks(blocks) // Load state
editor.createBlock({ html: '<p>Hi</p>', parentId: 'group1' })

// Undo/redo coordination
editor.getSnapshot()     // Get snapshot for undo
editor.applySnapshot(snapshot) // Restore snapshot
editor.onChange((event) => {
  // Listen for changes: 'block.group', 'block.ungroup', etc.
})
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
