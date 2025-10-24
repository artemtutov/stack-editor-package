import type { Node } from '@xyflow/react'
import { getAbsolutePosition } from './dragAndDrop'

/**
 * Get all block nodes belonging to a specific stack
 */
export function getStackBlocks(stackId: string, allNodes: Node[]): Node[] {
  return allNodes.filter((n) => (n as any).type !== 'stackContainer' && (n as any).data?.stackId === stackId)
}

/**
 * Ensure all blocks in a stack have an insertionOrder property
 */
export function ensureInsertionOrder(stackId: string, allNodes: Node[]): Node[] {
  const blocks = getStackBlocks(stackId, allNodes)
  if (blocks.length === 0) return allNodes

  const missing = blocks.some((b: any) => typeof b.data?.insertionOrder !== 'number')
  if (!missing) return allNodes

  const sortedByY = [...blocks].sort((a, b) => a.position.y - b.position.y)
  let idx = 0
  const idToOrder = new Map(sortedByY.map((b) => [b.id, idx++]))

  return allNodes.map((n: any) =>
    n.type !== 'stackContainer' && n.data?.stackId === stackId
      ? { ...n, data: { ...n.data, insertionOrder: idToOrder.get(n.id) } }
      : n
  )
}

/**
 * Check if a node is the bottom node in its stack
 */
export function isBottomNode(nodeId: string, allNodes: Node[]): boolean {
  const node = allNodes.find((n) => n.id === nodeId)
  if (!node) return true

  const stackId = (node as any).data?.stackId
  if (!stackId) return true

  const stackNodes = allNodes.filter((n: any) => n.data?.stackId === stackId)
  const maxY = Math.max(...stackNodes.map((n) => n.position.y))
  return node.position.y === maxY
}

/**
 * Update isBottomNode flag for all nodes in all stacks
 */
export function updateBottomNodeFlags(allNodes: Node[]): Node[] {
  return allNodes.map((n: any) => ({
    ...n,
    data: {
      ...n.data,
      isBottomNode: isBottomNode(n.id, allNodes),
    },
  }))
}

/**
 * Calculate and apply vertical layout for a stack (relative positions)
 */
export function calculateStackLayout(
  stackId: string,
  allNodes: Node[],
  gap: number,
  headerHeight: number
): Node[] {
  let updated = ensureInsertionOrder(stackId, allNodes)
  const blocks = getStackBlocks(stackId, updated)
  if (blocks.length <= 1) return updated  // Skip layout for single or no blocks

  const sorted = [...blocks].sort(
    (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
  )

  // Calculate relative Y positions (x is always 4 for padding)
  let currentY = headerHeight + 4
  const idToPos = new Map<string, { x: number; y: number }>()

  sorted.forEach((b: any) => {
    const h = b.data?.height || 24
    idToPos.set(b.id, { x: 4, y: currentY })
    currentY += h + gap
  })

  // Update positions (relative to parent container)
  updated = updated.map((n: any) =>
    n.type !== 'stackContainer' && n.data?.stackId === stackId
      ? { ...n, position: { x: idToPos.get(n.id)!.x, y: idToPos.get(n.id)!.y } }
      : n
  )

  return updated
}

/**
 * Sync stack container nodes to match their block positions
 * Ensures parent-child relationships and sizes containers correctly
 */
export function syncStackContainers(
  allNodes: Node[],
  blockWidth: number,
  headerHeight: number
): Node[] {
  const blockNodes = allNodes.filter((n: any) => n.type !== 'stackContainer')
  const existingContainers = allNodes.filter((n: any) => n.type === 'stackContainer')

  const stackGroups: Record<string, Node[]> = {}
  blockNodes.forEach((node: any) => {
    const stackId = node.data?.stackId
    if (stackId) {
      if (!stackGroups[stackId]) stackGroups[stackId] = []
      stackGroups[stackId].push(node)
    }
  })

  const updatedBlocks: Node[] = []
  const newContainers: Node[] = []

  // Process each stack
  Object.entries(stackGroups).forEach(([stackId, stackNodes]) => {
    const isMultiBlock = stackNodes.length > 1
    const existingContainer = existingContainers.find(c => c.id === stackId)

    if (isMultiBlock) {
      // Multi-block stack: needs container
      // Find any block that's already parented to this container
      const parentedBlock = stackNodes.find((b: any) => b.parentId === stackId)

      let containerX: number, containerY: number

      if (existingContainer && parentedBlock) {
        // At least one block is already parented, keep existing container position
        containerX = existingContainer.position.x
        containerY = existingContainer.position.y
      } else {
        // No parented blocks yet, calculate container position from absolute positions
        const firstBlock = stackNodes[0] as any
        const absoluteYs = stackNodes.map(n => n.position.y)
        const minAbsY = Math.min(...absoluteYs)
        containerX = firstBlock.position.x - 4
        containerY = minAbsY - headerHeight
      }

      // Calculate container width early (preserve manual width if it exists)
      const containerWidth =
        (existingContainer as any)?.data?.manualWidth ||
        (existingContainer as any)?.style?.width ||
        blockWidth + 8
      const childWidth = containerWidth - 8 // Account for padding

      // IMPORTANT: Detect group parent BEFORE modifying blocks
      // Check if all blocks in this stack share the same group parent
      let groupParentId: string | undefined = undefined
      let groupExtent: 'parent' | undefined = undefined

      console.log('🔍 Analyzing stack blocks for group parent:', {
        stackId,
        blockCount: stackNodes.length,
        blockParentIds: stackNodes.map((b: any) => ({ id: b.id, parentId: b.parentId, type: b.type }))
      })

      const blockGroupParents = stackNodes
        .map((b: any) => b.parentId)  // Check their CURRENT parentId (before we change it to stackId)
        .filter((pid: string | undefined) => pid && pid !== stackId) // Exclude stack container itself

      console.log('🔍 After filtering:', {
        blockGroupParents,
        allSame: blockGroupParents.every((pid: string) => pid === blockGroupParents[0]),
        allHaveParent: blockGroupParents.length === stackNodes.length
      })

      if (blockGroupParents.length > 0 &&
          blockGroupParents.length === stackNodes.length &&  // ALL blocks must have a group parent
          blockGroupParents.every((pid: string) => pid === blockGroupParents[0])) {
        // All blocks share the same group parent
        groupParentId = blockGroupParents[0]
        groupExtent = 'parent'
        console.log('✅ Stack container', stackId, 'inherits group parent:', groupParentId)
      } else {
        console.log('❌ Stack container', stackId, 'will NOT inherit group parent')
      }

      // Convert blocks to relative positions if needed
      stackNodes.forEach((block: any) => {
        let relativeX: number, relativeY: number

        if (block.parentId === stackId) {
          // Already relative to this container
          relativeX = block.position.x
          relativeY = block.position.y
        } else {
          // Convert to absolute first (handles both no-parent and different-parent cases)
          const absolutePos = getAbsolutePosition(block, allNodes)
          // Then convert to relative for the new container
          relativeX = absolutePos.x - containerX
          relativeY = absolutePos.y - containerY
        }

        updatedBlocks.push({
          ...block,
          position: { x: relativeX, y: relativeY },
          parentId: stackId,
          className: 'in-stack',
          style: { ...(block.style || {}), width: childWidth },
          data: { ...(block.data || {}), parentContainerId: stackId },
        })
      })

      // Calculate container dimensions from relative positions
      const relativeYs = updatedBlocks
        .filter(b => (b as any).data?.stackId === stackId)
        .map((b: any) => b.position.y)
      const heights = updatedBlocks
        .filter(b => (b as any).data?.stackId === stackId)
        .map((b: any) => b.data.height || 24)
      const minY = Math.min(...relativeYs)
      const maxY = Math.max(...relativeYs.map((y: number, i: number) => y + heights[i]))

      // containerWidth already calculated above
      const containerHeight = maxY - minY + headerHeight + 8

      // Build the container node with proper parent relationship
      // groupParentId was detected earlier (before blocks were modified)
      let containerParent: { parentId?: string; extent?: 'parent' } = {}
      if (existingContainer?.parentId) {
        // Preserve existing container's group parent
        containerParent = {
          parentId: existingContainer.parentId,
          extent: existingContainer.extent as 'parent' | undefined
        }
      } else if (groupParentId) {
        // Inherit group parent from blocks
        containerParent = {
          parentId: groupParentId,
          extent: groupExtent
        }
      }

      console.log('🔨 Creating stack container:', {
        stackId,
        blockCount: stackNodes.length,
        groupParentId,
        containerParent,
        position: { x: containerX, y: containerY }
      })

      const containerNode = {
        id: stackId,
        type: 'stackContainer',
        position: { x: containerX, y: containerY },
        ...containerParent,
        style: {
          width: containerWidth,
          height: containerHeight,
        },
        data: { width: containerWidth, height: containerHeight, stackId },
        selectable: true,
        draggable: true,
        resizable: false,
        zIndex: -1,
      } as Node

      console.log('📦 Final container node:', {
        id: containerNode.id,
        parentId: containerNode.parentId,
        extent: containerNode.extent,
        position: containerNode.position
      })

      newContainers.push(containerNode)
    } else {
      // Single block: no stack container needed, but preserve group parent if exists
      stackNodes.forEach((block: any) => {
        let absolutePosition = block.position

        // If block had a stack container parent (not a group parent), convert to absolute
        if (block.parentId === stackId) {
          const parent = allNodes.find(n => n.id === block.parentId)
          if (parent) {
            absolutePosition = {
              x: parent.position.x + block.position.x,
              y: parent.position.y + block.position.y
            }
          }
        }

        // Remove className and stack container parentId, but preserve group parentId and extent
        const { className, ...rest } = block
        const shouldRemoveParent = block.parentId === stackId // Only remove if parent is the stack container
        const { stackId: _stackId, ...restData } = rest.data || {}

        updatedBlocks.push({
          ...rest,
          position: absolutePosition,
          ...(shouldRemoveParent ? { parentId: undefined } : {}),
          data: restData
        } as Node)
      })
    }
  })

  // Handle blocks without stackId (standalone blocks)
  blockNodes.forEach((node: any) => {
    if (!node.data?.stackId) {
      // Check if parentId points to a stack container (orphaned parent reference)
      const isStackContainerParent = node.parentId &&
        existingContainers.some(c => c.id === node.parentId)

      if (isStackContainerParent) {
        // Block was removed from stack but still has stack container parentId
        const parent = allNodes.find(n => n.id === node.parentId)
        const parentAbsolutePos = parent
          ? getAbsolutePosition(parent, allNodes)
          : { x: 0, y: 0 }

        // Check if stack container has a group parent
        const containerGroupParent = parent?.parentId

        let newPosition, newParentId, newExtent

        if (containerGroupParent) {
          // Inherit group parent from container
          const groupNode = allNodes.find(n => n.id === containerGroupParent)
          const groupAbsolutePos = groupNode
            ? getAbsolutePosition(groupNode, allNodes)
            : { x: 0, y: 0 }

          // Block's absolute position
          const blockAbsolutePos = {
            x: parentAbsolutePos.x + node.position.x,
            y: parentAbsolutePos.y + node.position.y
          }

          // Convert to relative within group
          newPosition = {
            x: blockAbsolutePos.x - groupAbsolutePos.x,
            y: blockAbsolutePos.y - groupAbsolutePos.y
          }
          newParentId = containerGroupParent
          newExtent = 'parent'
        } else {
          // No group parent, convert to absolute
          newPosition = {
            x: parentAbsolutePos.x + node.position.x,
            y: parentAbsolutePos.y + node.position.y
          }
          newParentId = undefined
          newExtent = undefined
        }

        const { className, ...rest } = node
        updatedBlocks.push({
          ...rest,
          position: newPosition,
          parentId: newParentId,
          extent: newExtent,
        } as Node)
      } else {
        // Normal standalone block - preserve group parentId and extent if exists
        // These nodes are not in stacks, so keep their position and parent as-is
        const { className, ...rest } = node
        updatedBlocks.push(rest as Node)
      }
    }
  })

  return [...newContainers, ...updatedBlocks]
}

/**
 * Apply complete stack layout: calculate positions, update flags, sync containers
 */
export function applyStackLayout(
  stackId: string,
  allNodes: Node[],
  gap: number,
  blockWidth: number,
  headerHeight: number
): Node[] {
  // First ensure parent-child relationships and container exists
  const withContainers = syncStackContainers(allNodes, blockWidth, headerHeight)

  // Then calculate relative Y positions for stacked blocks
  const laidOut = calculateStackLayout(stackId, withContainers, gap, headerHeight)

  // Finally update bottom node flags
  return updateBottomNodeFlags(laidOut)
}
