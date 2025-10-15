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

      newContainers.push({
        id: stackId,
        type: 'stackContainer',
        position: { x: containerX, y: containerY },
        style: {
          width: containerWidth,
          height: containerHeight,
        },
        data: { width: containerWidth, height: containerHeight, stackId },
        selectable: true,
        draggable: true,
        resizable: false,
        zIndex: -1,
      } as Node)
    } else {
      // Single block: no parent needed
      stackNodes.forEach((block: any) => {
        let absolutePosition = block.position

        // If block had a parent, convert relative position to absolute
        if (block.parentId) {
          const parent = allNodes.find(n => n.id === block.parentId)
          if (parent) {
            absolutePosition = {
              x: parent.position.x + block.position.x,
              y: parent.position.y + block.position.y
            }
          }
        }

        const { className, parentId, ...rest } = block
        // Remove stackId property completely (not just set to undefined)
        const { stackId, ...restData } = rest.data || {}
        updatedBlocks.push({
          ...rest,
          position: absolutePosition,
          data: restData
        } as Node)
      })
    }
  })

  // Handle blocks without stackId
  blockNodes.forEach((node: any) => {
    if (!node.data?.stackId) {
      let absolutePosition = node.position

      // Convert from relative to absolute if node has parent
      if (node.parentId) {
        const parent = allNodes.find(n => n.id === node.parentId)
        if (parent) {
          absolutePosition = {
            x: parent.position.x + node.position.x,
            y: parent.position.y + node.position.y
          }
        }
      }

      const { className, parentId, ...rest } = node
      updatedBlocks.push({
        ...rest,
        position: absolutePosition
      } as Node)
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
