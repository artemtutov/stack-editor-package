import type { Node } from '@xyflow/react'
import type { StackAnchors } from './stackLayout'

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
 * Calculate where a dragged node should be dropped in a stack
 */
export function calculateDropIndicator(
  draggedNode: Node,
  allNodes: Node[],
  stackAnchors: StackAnchors,
  dragStartStackId: string | null,
  dragStartAnchorX: number,
  viewport: { x: number; y: number; zoom: number },
  xTolerance: number,
  blockWidth: number
): DropInfo {
  const draggedNodeId = draggedNode.id
  const pointerX = draggedNode.position.x
  const pointerY = draggedNode.position.y

  // Build stacks map
  const stacks: Record<string, Node[]> = {}
  ;(allNodes as any).forEach((n: any) => {
    const sid = n.data?.stackId
    if (n.type !== 'stackContainer' && sid) {
      if (!stacks[sid]) stacks[sid] = []
      stacks[sid].push(n)
    }
  })

  // Prefer original stack if aligned in X
  let targetStackId: string | null = null

  const alignedWithStart = dragStartStackId && Math.abs(pointerX - dragStartAnchorX) <= xTolerance
  if (alignedWithStart && dragStartStackId && stacks[dragStartStackId]) {
    targetStackId = dragStartStackId
  } else {
    // Pick stack whose anchor X is within tolerance and closest in X
    let bestSid: string | null = null
    let bestDx = Infinity
    Object.keys(stacks).forEach((sid) => {
      const ax = stackAnchors[sid]?.x ?? (stacks[sid] as any)[0].position.x
      const dx = Math.abs(pointerX - ax)
      if (dx <= xTolerance && dx < bestDx) {
        bestDx = dx
        bestSid = sid
      }
    })
    targetStackId = bestSid
  }

  if (!targetStackId) {
    return { show: false, targetStackId: null, insertionIndex: -1, position: { x: 0, y: 0, width: 0 } }
  }

  const stackBlocks = (stacks[targetStackId] as any)
    .filter((n: any) => n.id !== draggedNodeId)
    .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))

  let insertionIndex = stackBlocks.length
  let indicatorY = pointerY

  if (stackBlocks.length > 0) {
    for (let i = 0; i < stackBlocks.length; i++) {
      const block = stackBlocks[i]
      const blockHeight = block.data?.height || 24
      const blockMidY = block.position.y + blockHeight / 2
      if (pointerY < blockMidY) {
        insertionIndex = i
        indicatorY = block.position.y
        break
      }
      if (i === stackBlocks.length - 1) {
        insertionIndex = stackBlocks.length
        indicatorY = block.position.y + blockHeight
      }
    }
  } else {
    insertionIndex = 0
    indicatorY = pointerY
  }

  const anchorX = stackAnchors[targetStackId]?.x ?? (stackBlocks[0]?.position.x ?? pointerX)
  const { x: vx, y: vy, zoom } = viewport
  const screenX = vx + anchorX * zoom
  const screenY = vy + indicatorY * zoom
  const screenW = blockWidth * zoom

  return {
    show: true,
    targetStackId,
    insertionIndex,
    position: { x: screenX, y: screenY, width: screenW },
  }
}

/**
 * Apply container drag movement to all blocks in the stack
 */
export function applyContainerDrag(
  allNodes: Node[],
  containerNode: Node,
  dragState: ContainerDragState,
  stackAnchors: StackAnchors
): Node[] {
  const { stackId, pos, origPositions } = dragState
  const deltaX = containerNode.position.x - pos.x
  const deltaY = containerNode.position.y - pos.y

  const moved = (allNodes as any).map((n: any) => {
    if (n.type !== 'stackContainer' && n.data?.stackId === stackId) {
      const orig = origPositions[n.id]
      if (orig) {
        return { ...n, position: { x: orig.x + deltaX, y: orig.y + deltaY } }
      }
    }
    if (n.id === containerNode.id) return { ...n, position: containerNode.position }
    return n
  })

  // Update anchor to new top during drag
  const stackBlocks = moved.filter((n: any) => n.data?.stackId === stackId && n.type !== 'stackContainer')
  if (stackBlocks.length > 0) {
    const topBlock = [...stackBlocks].sort((a: any, b: any) => a.position.y - b.position.y)[0]
    stackAnchors[stackId] = { x: topBlock.position.x, y: topBlock.position.y }
  }

  return moved
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

/**
 * Preserve original stack top position after drag
 */
export function preserveStackTop(
  allNodes: Node[],
  stackId: string,
  originalTopY: number,
  originalTopId: string
): Node[] {
  const stackBlocks = (allNodes as any)
    .filter((n: any) => n.data.stackId === stackId && n.type !== 'stackContainer')
    .sort((a: any, b: any) => a.position.y - b.position.y)

  if (stackBlocks.length === 0) return allNodes

  const currentTopNode = stackBlocks[0]
  if (currentTopNode.id !== originalTopId) return allNodes

  const currentTop = currentTopNode.position.y
  const anchorDelta = originalTopY - currentTop

  if (!anchorDelta) return allNodes

  return (allNodes as any).map((n: any) =>
    n.data.stackId === stackId
      ? { ...n, position: { ...n.position, y: n.position.y + anchorDelta } }
      : n
  )
}
