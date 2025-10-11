# Container Resizing Implementation

## Overview

Stack containers support horizontal resizing (200px - 600px) with live child block updates. This document describes the implementation details, data flow, and essential guardrails that prevent conflicts between React Flow's native resize handling and our state management.

## Architecture Principles

### Separation of Concerns

**Width Management**: User-controlled only
- Initial: `blockWidth + 8` (default 208px)
- During resize: Managed by React Flow visually, we update children
- After resize: Persisted to `node.data.manualWidth`
- **Never recalculated** by layout system (`syncStackContainers`)

**Height Management**: Content-driven
- Always recalculated by `syncStackContainers`
- Based on children heights + gaps + header height
- Independent from width calculations

This separation breaks potential circular dependencies:
- Width: User resize → Container → Children (one direction)
- Height: Children → Layout → Container (other direction)

## Resize Flow

### 1. Resize Start (`onContainerResizeStart`)

**Location**: `useStackEditor.tsx:178-183`

```typescript
activeResizeContainerRef.current = containerId
```

**Purpose**: Sets the active resize flag, enabling guardrails.

### 2. During Resize (`onContainerResize`)

**Location**: `useStackEditor.tsx:185-204`

```typescript
const onContainerResize = useCallback(
  (containerId: string, newWidth: number) => {
    const childWidth = newWidth - 8 // Account for container padding

    const setNodesFn = setNodesRef.current || setNodesBase
    setNodesFn((nds) =>
      nds.map((n: any) =>
        // Only update children - let React Flow handle container
        n.parentId === containerId
          ? {
              ...n,
              style: { ...n.style, width: childWidth },
              data: { ...n.data, width: childWidth },
            }
          : n
      )
    )
  },
  [setNodesBase]
)
```

**Trigger**: Fires continuously as user drags resize handle
**Updates**: ONLY child block widths (not container)
**Why**: Container dimensions are managed by React Flow during active resize. Updating the container node would conflict with React Flow's internal state.

**Wired in**: `StackContainer.tsx:40, 55`
```typescript
onResize={(_, params) => onResize?.(id, params.width)}
```

### 3. Resize End (`onContainerResizeEnd`)

**Location**: `useStackEditor.tsx:206-242`

```typescript
const onContainerResizeEnd = useCallback(
  (containerId: string) => {
    // Get final width from React Flow
    const node = storeApi.getState().nodeLookup?.get(containerId)
    const finalWidth = (node as any)?.measured?.width || 200
    const childWidth = finalWidth - 8

    // Persist width to both container and children, then run layout sync
    const setNodesFn = setNodesRef.current || setNodesBase
    setNodesFn((nds) => {
      let updated = nds.map((n: any) =>
        n.id === containerId
          ? {
              ...n,
              style: { ...n.style, width: finalWidth },
              data: { ...n.data, width: finalWidth, manualWidth: finalWidth },
            }
          : n.parentId === containerId
          ? {
              ...n,
              style: { ...n.style, width: childWidth },
              data: { ...n.data, width: childWidth },
            }
          : n
      )

      // Now safe to run layout sync to recalculate heights
      updated = syncContainers(updated)

      return updated
    })

    // Clear active resize tracking
    activeResizeContainerRef.current = null
  },
  [storeApi, setNodesBase, syncContainers]
)
```

**Purpose**:
1. Reads final width from React Flow's internal state
2. Persists width to container's `data.manualWidth` (preserves across layout updates)
3. Updates child widths to match
4. Runs `syncContainers` to recalculate heights
5. Clears active resize flag

**Why syncContainers here**: Safe because resize is complete. React Flow is no longer managing container dimensions.

## Essential Guardrails

### 1. Active Resize Tracking

**Location**: `useStackEditor.tsx:45`

```typescript
const activeResizeContainerRef = useRef<string | null>(null)
```

**Purpose**: Global flag indicating which container (if any) is being resized.

**Set**: `onContainerResizeStart` (line 180)
**Cleared**: `onContainerResizeEnd` (line 239)

### 2. Position Guard

**Location**: `useStackEditor.tsx:173-195` (inside `onNodesChange`)

```typescript
const activeContainerId = activeResizeContainerRef.current
if (activeContainerId) {
  for (const change of changes as any) {
    if (change.type === 'position') {
      const node = next.find((n) => n.id === change.id)
      if ((node as any)?.parentId === activeContainerId) {
        // Rollback this child's position by keeping the previous version
        const prevNode = prev.find((n) => n.id === change.id)
        if (prevNode) {
          next = next.map((n) => (n.id === change.id ? prevNode : n))
        }
      }
    }
  }
}
```

**Purpose**: Prevents child position updates during active resize.

**Why**: React Flow emits position change events for children when their parent container resizes. These would cause children to shift incorrectly. By blocking position changes during resize, we keep children in their correct relative positions.

**Critical**: Without this guard, children would jump around during resize.

### 3. Layout Sync Guard

**Location**: `useStackEditor.tsx:77-84` (inside `handleHeightChange`)

```typescript
// Skip layout sync during active resize to avoid width conflicts
if (!activeResizeContainerRef.current) {
  if (changedNode?.data?.stackId) {
    updated = applyLayout(changedNode.data.stackId, updated)
  } else {
    updated = syncContainers(updated)
  }
}
```

**Purpose**: Prevents `syncStackContainers` from running during active resize.

**Why**: If a child block's height changes during resize (e.g., user types text), `handleHeightChange` would normally trigger `syncContainers`. This would:
1. Read the container's OLD width (not the live resize width)
2. Apply that old width to children
3. Cause container to "jump back" to old width

**Critical**: Without this guard, typing during resize causes container to snap back to previous width.

### 4. Width Preservation in syncStackContainers

**Location**: `stackLayout.ts:147-150`

```typescript
const containerWidth =
  (existingContainer as any)?.data?.manualWidth ||  // 1. Manual resize (highest priority)
  (existingContainer as any)?.style?.width ||       // 2. Existing width
  blockWidth + 8                                     // 3. Default
```

**Purpose**: Ensures `syncStackContainers` never overwrites user-resized widths.

**Priority**:
1. `manualWidth` - Set by `onContainerResizeEnd`, preserves user resize
2. `style.width` - Existing width if not manually set
3. Default - Only for new containers

## Data Flow Diagram

```
User drags handle
       ↓
┌──────────────────────────────────────┐
│ onContainerResizeStart               │
│ - Set activeResizeContainerRef       │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│ React Flow handles container resize  │
│ (visual only, internal state)        │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│ onContainerResize (fires repeatedly) │
│ - Get new width from React Flow      │
│ - Update ONLY child widths           │
│ - Container managed by React Flow    │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│ GUARDRAILS ACTIVE:                   │
│ • Position guard blocks child moves  │
│ • Layout sync guard blocks           │
│   syncContainers calls               │
└──────────────────────────────────────┘
       ↓
User releases handle
       ↓
┌──────────────────────────────────────┐
│ onContainerResizeEnd                 │
│ - Read final width from React Flow   │
│ - Persist to container & children    │
│ - Run syncContainers (height only)   │
│ - Clear activeResizeContainerRef     │
└──────────────────────────────────────┘
```

## Why This Approach Works

1. **No State Conflicts**: React Flow owns container dimensions during resize. We don't fight it.

2. **Live Child Updates**: Children resize smoothly as user drags because `onContainerResize` fires continuously.

3. **Preserved Widths**: `manualWidth` ensures layout system never overwrites user-resized containers.

4. **Position Stability**: Position guard prevents React Flow's position change events from shifting children.

5. **No Layout Interference**: Layout sync guard prevents height recalculations from triggering width updates during resize.

6. **Clean Separation**: Width (user) and height (content) are managed independently, breaking circular dependencies.

## Common Issues and Solutions

### Issue: Container jumps back during resize

**Cause**: Removing the layout sync guard, allowing `syncContainers` to run during resize.

**Solution**: Ensure `activeResizeContainerRef.current` check exists in `handleHeightChange`.

### Issue: Children don't resize during drag

**Cause**: Missing or not wired `onContainerResize` callback.

**Solution**: Verify `onResize` is injected into container data and wired to `NodeResizeControl`.

### Issue: Children positions shift during resize

**Cause**: Position guard disabled or not working.

**Solution**: Check position guard logic in `onNodesChange` (lines 173-195).

### Issue: Width resets after layout updates

**Cause**: `manualWidth` not set or not used by `syncStackContainers`.

**Solution**: Ensure `onContainerResizeEnd` sets `data.manualWidth` and `syncStackContainers` reads it first.

## Implementation Checklist

When implementing similar resize functionality:

- [ ] Create active resize tracking ref
- [ ] Implement onResizeStart to set flag
- [ ] Implement onResize to update children only (not parent)
- [ ] Implement onResizeEnd to persist and clear flag
- [ ] Add position guard in onNodesChange
- [ ] Add layout sync guard in height change handler
- [ ] Ensure layout system preserves manual widths
- [ ] Wire all callbacks to container component
- [ ] Test: Resize while typing in child
- [ ] Test: Resize multiple times
- [ ] Test: Layout updates preserve width
