# Grouping Integration Guide for Canvas React

This guide explains how to integrate the native grouping support from `@artemtutov/stack-editor-react@0.3.0` into Canvas React, replacing the previous "glue code" implementation.

## What's New in 0.3.0

The stack editor package now provides **first-class grouping support**:

- ✅ **Drag-based auto-grouping** - Blocks automatically parent/unparent when dragged into/out of groups
- ✅ **Selection-based grouping APIs** - `groupNodes()`, `ungroupNodes()`, `updateNodeParent()`
- ✅ **Position utilities** - Exported helpers for absolute ↔ relative position conversion
- ✅ **Nested group support** - Correctly handles groups within groups
- ✅ **Container grouping** - Stack containers can be grouped too
- ✅ **Smooth grouped stack interactions** - Blocks in grouped stacks can be dragged out in one operation
- ✅ **Undo/redo ready** - Emits `block.group` and `block.ungroup` events

---

## Migration Overview

### Before (Glue Code)
Blocks existed in **dual state**:
- Ungrouped blocks → Stack editor state
- Grouped blocks → React Flow state only

Required manual transfer between states on group/ungroup.

### After (Native Support)
Blocks stay in **stack editor state** whether grouped or not. The package handles everything internally.

---

## Step-by-Step Migration

### 1. Remove Dual-State Transfer Logic

**Remove from `handleNodeDragStopRouted`** (Canvas.tsx around line 4335-4444):

```typescript
// ❌ DELETE THIS SECTION
if (intersectingGroup && !node.parentId) {
  // AUTO-PARENT: Block dropped into group
  // Transfer ownership from stack editor to React Flow
  const blocks = stackEditor.getBlocks();
  const updatedBlocks = blocks.filter(b => b.id !== node.id);
  stackEditor.loadBlocks(updatedBlocks); // Remove from stack editor

  setNodes(nds => {
    // Add to React Flow state...
  });
  return; // Skip stackEditor.onNodeDragStop
}

// Similar removal for auto-unparent logic...
```

**Replace with**:

```typescript
// ✅ NOTHING! Auto-grouping is now built-in
// Just call the stack editor's drag handler normally
stackEditor.onNodeDragStop?.(event, node);
```

The package now handles auto-grouping internally before calling its drag stop logic.

---

### 2. Update Selection-Based Grouping

**Remove from `createGroupFromSelectedNodes`** (Canvas.tsx around line 2724-2748):

```typescript
// ❌ DELETE THIS SECTION
// Update stack blocks via stack editor (setNodes doesn't update stack editor state)
const selectedBlocks = selectedNodes.filter(node => node.type === 'block');
if (selectedBlocks.length > 0) {
  const blocks = stackEditor.getBlocks();
  const updatedBlocks = blocks.map(block => {
    const isSelected = selectedBlocks.some(sb => sb.id === block.id);
    if (isSelected) {
      const absolutePos = getAbsolutePosition(
        selectedBlocks.find(sb => sb.id === block.id)!,
        allNodes
      );
      return {
        ...block,
        parentId: groupId,
        extent: 'parent' as const,
        position: {
          x: absolutePos.x - groupX,
          y: absolutePos.y - groupY,
        }
      };
    }
    return block;
  });
  stackEditor.loadBlocks(updatedBlocks);
}
```

**Replace with**:

```typescript
// ✅ USE NATIVE API
const selectedBlockIds = selectedBlocks.map(b => b.id);
if (selectedBlockIds.length > 0) {
  stackEditor.groupNodes(selectedBlockIds, groupId);
}
```

---

### 3. Update Ungrouping Logic

**In `ungroupSelectedNodes`** (Canvas.tsx around line 2762+):

```typescript
// ❌ OLD: Manual position conversion and state transfer
const blocks = stackEditor.getBlocks();
const updatedBlocks = blocks.map(block => {
  if (blockIds.includes(block.id)) {
    return {
      ...block,
      parentId: undefined,
      extent: undefined,
      position: convertToAbsolute(block.position, parentPos)
    };
  }
  return block;
});
stackEditor.loadBlocks(updatedBlocks);
```

**Replace with**:

```typescript
// ✅ USE NATIVE API
stackEditor.ungroupNodes(blockIds);
```

---

### 4. Remove Extent Constraint Management

**Remove from `handleNodeDragStartRouted`** (Canvas.tsx around line 4277-4290):

```typescript
// ❌ DELETE THIS SECTION
// BOUNDARY FIX: Temporarily remove extent constraint for grouped blocks
if (node.type === 'block' && node.parentId && node.extent === 'parent') {
  setNodes(nds => nds.map(n => {
    if (n.id === node.id) {
      return {
        ...n,
        extent: undefined,
        __originalExtent: 'parent' as const
      };
    }
    return n;
  }));
}
```

**Replace with**:

```typescript
// ✅ NOTHING! The package handles extent management internally
```

The stack editor now automatically removes/restores extent constraints during drag.

---

### 5. Enable Auto-Grouping in Stack Editor

**Update stack editor initialization**:

```typescript
const stackEditor = useStackEditor({
  initialBlocks: [],
  options: {
    blockWidth: 242,
    gap: 2,
    headerHeight: 28,
    // ✅ ADD THESE:
    enableAutoGrouping: true,        // Enable drag-based auto-grouping (default: true)
    groupNodeTypes: ['group'],       // Which node types to treat as groups (default: ['group'])
  }
});
```

---

### 6. Update Event Routing (Optional Cleanup)

**Simplify `handleNodeDragStopRouted`**:

```typescript
const handleNodeDragStopRouted = useCallback(
  (event: React.MouseEvent, node: Node) => {
    // Check if this is a stack editor node
    if (node.type === 'block' || node.type === 'stackContainer') {
      // ✅ SIMPLE: Just call the stack editor handler
      // It handles auto-grouping internally now
      stackEditor.onNodeDragStop?.(event, node);
    } else {
      // Route to existing Canvas drag stop handler
      onNodeDragStop(event, node);
    }
  },
  [stackEditor, onNodeDragStop]
);
```

All the complex grouping logic is gone!

---

## New APIs Available

### `stackEditor.groupNodes(nodeIds, parentGroupId)`

Group multiple blocks into a parent group.

```typescript
// Example: Group selected blocks into a group
const selectedBlockIds = ['block1', 'block2', 'block3'];
const groupId = 'group-123';
stackEditor.groupNodes(selectedBlockIds, groupId);
```

**What it does**:
- Converts absolute positions to relative positions within the group
- Sets `parentId` and `extent: 'parent'`
- Emits `block.group` event for each block (for undo/redo)

---

### `stackEditor.ungroupNodes(nodeIds)`

Ungroup blocks from their parent groups.

```typescript
// Example: Ungroup selected blocks
const blockIds = ['block1', 'block2'];
stackEditor.ungroupNodes(blockIds);
```

**What it does**:
- Converts relative positions to absolute canvas positions
- Removes `parentId` and `extent`
- Emits `block.ungroup` event for each block (for undo/redo)

---

### `stackEditor.updateNodeParent(nodeId, parentId?, extent?)`

Low-level API to update a single block's parent.

```typescript
// Example: Move block into a group
stackEditor.updateNodeParent('block1', 'group-123', 'parent');

// Example: Remove block from group
stackEditor.updateNodeParent('block1');
```

---

## Utility Functions (Exported)

The package now exports position conversion utilities you can use elsewhere:

```typescript
import {
  getAbsolutePosition,
  convertAbsoluteToRelative,
  convertRelativeToAbsolute,
  isPointWithinNode,
  findIntersectingGroup,
} from '@artemtutov/stack-editor-react';

// Example: Get absolute position of a nested node
const absolutePos = getAbsolutePosition(node, allNodes);

// Example: Convert position for grouping
const relativePos = convertAbsoluteToRelative(
  { x: 100, y: 200 },
  { x: 50, y: 50 }
);
// Result: { x: 50, y: 150 }

// Example: Check if point is within a node (handles nested parents)
const isInside = isPointWithinNode(
  { x: 100, y: 200 },
  groupNode,
  allNodes
);

// Example: Find which group contains a point
const group = findIntersectingGroup(
  dropPoint,
  allNodes,
  ['group', 'frame'] // Custom group types
);
```

---

## Undo/Redo Integration

The stack editor now emits grouping events you can listen to:

```typescript
useEffect(() => {
  const unsubscribe = stackEditor.onChange((event) => {
    switch (event.type) {
      case 'block.group':
        console.log('Block grouped:', event.blockId);
        // Record snapshot for undo
        recordSnapshot('Group Block');
        break;

      case 'block.ungroup':
        console.log('Block ungrouped:', event.blockId);
        // Record snapshot for undo
        recordSnapshot('Ungroup Block');
        break;

      case 'content.commit':
        // Existing handler
        break;
    }
  });

  return unsubscribe;
}, [stackEditor]);
```

---

## Testing the Migration

### 1. Test Drag-Based Grouping
- ✅ Drag a block into a group → should auto-parent
- ✅ Drag a block out of a group → should auto-unparent
- ✅ Drag within same group → should stay grouped
- ✅ Undo/redo → should restore state correctly

### 2. Test Selection-Based Grouping
- ✅ Select multiple blocks → Create group → should group them
- ✅ Select grouped blocks → Ungroup → should ungroup them
- ✅ Works with mix of blocks and containers

### 3. Test Nested Groups
- ✅ Create group A
- ✅ Create group B inside group A
- ✅ Drag blocks between groups → positions should be correct
- ✅ Ungroup from nested group → absolute positions should be correct

### 4. Test Persistence
- ✅ Group some blocks
- ✅ Save canvas (uses `stackEditor.getBlocks()`)
- ✅ Reload canvas (uses `stackEditor.loadBlocks()`)
- ✅ Grouped blocks should restore correctly with relative positions

### 5. Test Grouped Stack Interactions
- ✅ Create a stack inside a group
- ✅ Drag a block from the grouped stack out of the group → should ungroup in one smooth operation
- ✅ Drag a block from the grouped stack within the group → should stay grouped
- ✅ No jump-back or two-step removal needed
- ✅ Behavior matches solo blocks in groups

---

## Troubleshooting

### Issue: Blocks jump to wrong position when grouped

**Problem**: Not using absolute positions before converting to relative.

**Solution**: The package handles this automatically. If you're doing custom grouping, use:

```typescript
import { getAbsolutePosition, convertAbsoluteToRelative } from '@artemtutov/stack-editor-react';

// Get absolute position (handles nested parents)
const absolutePos = getAbsolutePosition(blockNode, allNodes);

// Get group's absolute position
const groupAbsolutePos = getAbsolutePosition(groupNode, allNodes);

// Convert to relative
const relativePos = convertAbsoluteToRelative(absolutePos, groupAbsolutePos);
```

---

### Issue: Auto-grouping not working

**Check**:
1. `enableAutoGrouping: true` in options ✅
2. Group node type is in `groupNodeTypes` array ✅
3. Not overriding `onNodeDragStop` without calling `stackEditor.onNodeDragStop()` ✅

---

### Issue: Blocks stay in React Flow state instead of stack editor state

**Problem**: Old glue code still present.

**Solution**: Remove all manual state transfer code. Blocks should ALWAYS be in stack editor state, even when grouped. The package manages the visual parent/child relationship via `parentId` in the block data.

---

### Issue: Can't drag block from grouped stack out of group

**Symptom**: Block jumps back to group or requires two-step removal (first from stack, then from group).

**Solution**: This is now fixed in v0.3.0! The auto-grouping logic recognizes stack containers inside groups and allows single-operation removal. Make sure you're using the latest version.

**Technical details**: The `isGroupParent` check now detects both direct group parents AND stack containers that are children of groups, enabling consistent drag behavior across all node types.

---

## Performance Notes

- ✅ **No extra re-renders**: Grouping uses `loadBlocks()` which is batched
- ✅ **Position calculations cached**: `getAbsolutePosition()` is called only during grouping operations
- ✅ **Event coalescing**: Multiple blocks grouped together emit individual events, but you can batch snapshots

---

## Summary of Benefits

The migration provides not just feature parity, but a **polished user experience** with intuitive interactions:

| Before | After |
|--------|-------|
| 200+ lines of glue code | 0 lines (built-in) |
| Dual state management | Single source of truth |
| Manual position calculations | Automatic with utilities |
| No nested group support | Full nested support |
| Manual extent management | Automatic |
| Custom undo/redo logic | Built-in events |
| Grouped stack removal | Two-step process | Single smooth drag |

---

## Example: Complete Migration Diff

**Before** (`createGroupFromSelectedNodes`):
```typescript
// 50+ lines of manual position calculation and state transfer
const blocks = stackEditor.getBlocks();
const updatedBlocks = blocks.map(block => {
  if (isSelected(block)) {
    const absolutePos = getAbsolutePosition(/* ... */);
    return {
      ...block,
      parentId: groupId,
      extent: 'parent',
      position: { x: absolutePos.x - groupX, y: absolutePos.y - groupY }
    };
  }
  return block;
});
stackEditor.loadBlocks(updatedBlocks);
```

**After**:
```typescript
// 1 line
stackEditor.groupNodes(selectedBlockIds, groupId);
```

---

## Need Help?

- 📖 Check the [main README](./README.md) for basic usage
- 🐛 Report issues at https://github.com/artemtutov/stack-editor-package/issues
- 💬 Review the implementation in `src/useStackEditor.tsx` and `src/logic/grouping.ts`
