import type { Node } from '@xyflow/react'

export type DropInfo = {
  show: boolean
  targetStackId: string | null
  targetType: 'container' | 'solo' | null
  targetNodeId?: string | null
  insertionIndex: number
  position: { x: number; y: number; width: number }
  canvasPosition: { x: number; y: number }
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
 * Check if a point is within a container's rectangular boundary (with tolerance padding)
 */
function isWithinContainerBounds(
  pointerX: number,
  pointerY: number,
  container: any,
  tolerance: number,
  blockWidth: number
): boolean {
  const containerX = container.position.x
  const containerY = container.position.y
  const containerWidth = container.data?.width || blockWidth
  const containerHeight = container.data?.height || container.measured?.height || 100

  // Check if pointer is within rectangular bounds with tolerance padding
  const withinX = pointerX >= containerX - tolerance && pointerX <= containerX + containerWidth + tolerance
  const withinY = pointerY >= containerY - tolerance && pointerY <= containerY + containerHeight + tolerance

  return withinX && withinY
}

/**
 * Calculate where a dragged node should be dropped in a stack
 */
export function calculateDropIndicator(
  draggedNode: Node,
  allNodes: Node[],
  dragStartStackId: string | null,
  flowToScreenPosition: (position: { x: number; y: number }) => { x: number; y: number },
  xTolerance: number,
  blockWidth: number,
  headerHeight: number
): DropInfo {
  const draggedNodeId = draggedNode.id
  const draggedAbsPos = getAbsolutePosition(draggedNode, allNodes)
  const pointerX = draggedAbsPos.x
  const pointerY = draggedAbsPos.y

  // Get all containers
  const containers = allNodes.filter((n: any) => n.type === 'stackContainer')

  // Find target container based on rectangular boundary with tolerance
  let targetContainer: Node | null = null
  let targetStackId: string | null = null

  if (containers.length > 0) {
    // First try to match the start stack if within rectangular bounds
    if (dragStartStackId) {
      const startContainer = containers.find((c: any) => c.data?.stackId === dragStartStackId)
      if (startContainer && isWithinContainerBounds(pointerX, pointerY, startContainer, xTolerance, blockWidth)) {
        targetContainer = startContainer
        targetStackId = dragStartStackId
      }
    }

    // Otherwise find closest container within rectangular bounds
    if (!targetContainer) {
      let bestDistance = Infinity
      containers.forEach((container: any) => {
        if (isWithinContainerBounds(pointerX, pointerY, container, xTolerance, blockWidth)) {
          // Calculate distance to container center for tie-breaking
          const containerCenterX = container.position.x + ((container.data?.width || blockWidth) / 2)
          const containerCenterY = container.position.y + ((container.data?.height || container.measured?.height || 100) / 2)
          const distance = Math.sqrt(
            Math.pow(pointerX - containerCenterX, 2) + Math.pow(pointerY - containerCenterY, 2)
          )

          if (distance < bestDistance) {
            bestDistance = distance
            targetContainer = container
            targetStackId = container.data?.stackId
          }
        }
      })
    }
  }

  // If no container found, check for solo blocks within 20px tolerance
  if (!targetContainer || !targetStackId) {
    const SOLO_TOLERANCE = 20
    const soloBlocks = (allNodes as any).filter(
      (n: any) => n.type !== 'stackContainer' && !n.data?.stackId && n.id !== draggedNodeId
    )

    let bestSoloBlock: any = null
    let bestDistance = Infinity

    soloBlocks.forEach((block: any) => {
      const blockAbsPos = getAbsolutePosition(block, allNodes)
      const dx = Math.abs(pointerX - blockAbsPos.x)
      const dy = Math.abs(pointerY - blockAbsPos.y)
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance <= SOLO_TOLERANCE && distance < bestDistance) {
        bestDistance = distance
        bestSoloBlock = block
      }
    })

    if (bestSoloBlock) {
      const soloAbsPos = getAbsolutePosition(bestSoloBlock as Node, allNodes)
      const screenPos = flowToScreenPosition({ x: soloAbsPos.x, y: soloAbsPos.y })
      const screenW = (bestSoloBlock as any).measured?.width || blockWidth

      return {
        show: true,
        targetStackId: null,
        targetType: 'solo' as const,
        targetNodeId: bestSoloBlock.id as string,
        insertionIndex: -1,
        position: { x: screenPos.x, y: screenPos.y, width: screenW },
        canvasPosition: { x: soloAbsPos.x, y: soloAbsPos.y },
      }
    }

    return { show: false, targetStackId: null, targetType: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 }, canvasPosition: { x: 0, y: 0 } }
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
        // When inserting at first position, use container position + header offset
        if (i === 0) {
          indicatorAbsY = targetContainer.position.y + headerHeight + 4
        } else {
          indicatorAbsY = blockAbsPos.y
        }
        break
      }
      if (i === stackBlocks.length - 1) {
        insertionIndex = stackBlocks.length
        indicatorAbsY = blockAbsPos.y + blockHeight
      }
    }
  } else {
    insertionIndex = 0
    indicatorAbsY = targetContainer.position.y + headerHeight + 4
  }

  // Convert to screen coordinates for indicator
  const containerAbsX = targetContainer.position.x
  const screenPos = flowToScreenPosition({ x: containerAbsX, y: indicatorAbsY })
  const containerWidth = (targetContainer.data as any)?.width || blockWidth

  return {
    show: true,
    targetStackId,
    targetType: 'container',
    insertionIndex,
    position: { x: screenPos.x, y: screenPos.y, width: containerWidth },
    canvasPosition: { x: containerAbsX, y: indicatorAbsY },
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

