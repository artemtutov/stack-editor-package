import type { Node } from '@xyflow/react'

export type DropInfo = {
  show: boolean
  targetStackId: string | null
  insertionIndex: number
  position: { x: number; y: number; width: number }
}

export type ContainerDragState = {
  pos: { x: number; y: number }
  stackId: string
  origPositions: Record<string, { x: number; y: number }>
}

/**
 * Get absolute position of a node (handles parent-child relationships)
 */
export function getAbsolutePosition(
  node: Node,
  allNodes: Node[]
): { x: number; y: number } {
  if (!(node as any).parentId) return node.position

  const parent = allNodes.find((n) => n.id === (node as any).parentId)
  if (!parent) return node.position

  const parentAbs = getAbsolutePosition(parent, allNodes)
  return {
    x: parentAbs.x + node.position.x,
    y: parentAbs.y + node.position.y,
  }
}

/**
 * Calculate where a dragged node should be dropped in a stack
 */
export function calculateDropIndicator(
  draggedNode: Node,
  allNodes: Node[],
  dragStartStackId: string | null,
  viewport: { x: number; y: number; zoom: number },
  xTolerance: number,
  blockWidth: number
): DropInfo {
  const draggedNodeId = draggedNode.id
  const draggedAbsPos = getAbsolutePosition(draggedNode, allNodes)
  const pointerX = draggedAbsPos.x
  const pointerY = draggedAbsPos.y

  // Get all containers
  const containers = allNodes.filter((n: any) => n.type === 'stackContainer')
  if (containers.length === 0) {
    return { show: false, targetStackId: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 } }
  }

  // Find target container based on X alignment
  let targetContainer: Node | null = null
  let targetStackId: string | null = null

  // First try to match the start stack if X-aligned
  if (dragStartStackId) {
    const startContainer = containers.find((c: any) => c.data?.stackId === dragStartStackId)
    if (startContainer && Math.abs(pointerX - startContainer.position.x) <= xTolerance) {
      targetContainer = startContainer
      targetStackId = dragStartStackId
    }
  }

  // Otherwise find closest container within X tolerance
  if (!targetContainer) {
    let bestDx = Infinity
    containers.forEach((container: any) => {
      const dx = Math.abs(pointerX - container.position.x)
      if (dx <= xTolerance && dx < bestDx) {
        bestDx = dx
        targetContainer = container
        targetStackId = container.data?.stackId
      }
    })
  }

  if (!targetContainer || !targetStackId) {
    return { show: false, targetStackId: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 } }
  }

  // Get blocks in target stack
  const stackBlocks = (allNodes as any)
    .filter((n: any) => n.type !== 'stackContainer' && n.data?.stackId === targetStackId && n.id !== draggedNodeId)
    .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))

  // Calculate insertion point based on absolute Y
  let insertionIndex = stackBlocks.length
  let indicatorAbsY = pointerY

  if (stackBlocks.length > 0) {
    for (let i = 0; i < stackBlocks.length; i++) {
      const block = stackBlocks[i]
      const blockAbsPos = getAbsolutePosition(block, allNodes)
      const blockHeight = block.data?.height || 24
      const blockMidY = blockAbsPos.y + blockHeight / 2

      if (pointerY < blockMidY) {
        insertionIndex = i
        indicatorAbsY = blockAbsPos.y
        break
      }
      if (i === stackBlocks.length - 1) {
        insertionIndex = stackBlocks.length
        indicatorAbsY = blockAbsPos.y + blockHeight
      }
    }
  } else {
    insertionIndex = 0
    indicatorAbsY = pointerY
  }

  // Convert to screen coordinates for indicator
  const containerAbsX = targetContainer.position.x
  const { x: vx, y: vy, zoom } = viewport
  const screenX = vx + containerAbsX * zoom
  const screenY = vy + indicatorAbsY * zoom
  const containerWidth = (targetContainer.data as any)?.width || blockWidth
  const screenW = containerWidth * zoom

  return {
    show: true,
    targetStackId,
    insertionIndex,
    position: { x: screenX, y: screenY, width: screenW },
  }
}

/**
 * Apply shift+drag group movement to all blocks in the stack
 */
export function applyGroupDrag(
  allNodes: Node[],
  draggedNode: Node,
  currentNode: Node,
  stackId: string
): Node[] {
  const deltaX = draggedNode.position.x - currentNode.position.x
  const deltaY = draggedNode.position.y - currentNode.position.y

  return (allNodes as any).map((n: any) => {
    if (n.data.stackId === stackId && n.id !== draggedNode.id) {
      return { ...n, position: { x: n.position.x + deltaX, y: n.position.y + deltaY } }
    }
    if (n.id === draggedNode.id) return { ...n, position: draggedNode.position }
    return n
  })
}

/**
 * Reorder blocks within a stack after drag
 */
export function reorderStack(
  allNodes: Node[],
  draggedNodeId: string,
  targetStackId: string,
  insertionIndex: number
): Node[] {
  const blocksAll = (allNodes as any).filter(
    (n: any) => n.data?.stackId === targetStackId && n.type !== 'stackContainer'
  )
  const orderedAll = [...blocksAll].sort(
    (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
  )
  const dragged = (allNodes as any).find((n: any) => n.id === draggedNodeId)
  const othersOrdered = orderedAll.filter((b: any) => b.id !== draggedNodeId)

  const insertIndex = Math.max(0, Math.min(othersOrdered.length, insertionIndex))
  const reordered = [...othersOrdered.slice(0, insertIndex), dragged, ...othersOrdered.slice(insertIndex)]
  const idToOrder = new Map(reordered.map((b: any, i: number) => [b.id, i]))

  return (allNodes as any).map((n: any) =>
    n.data?.stackId === targetStackId && n.type !== 'stackContainer'
      ? { ...n, data: { ...n.data, insertionOrder: idToOrder.get(n.id) } }
      : n
  )
}

