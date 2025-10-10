import type { Node } from '@xyflow/react'

export type StackAnchors = Record<string, { x: number; y: number }>

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
 * Calculate and apply vertical layout for a stack
 */
export function calculateStackLayout(
  stackId: string,
  allNodes: Node[],
  stackAnchors: StackAnchors,
  gap: number
): Node[] {
  let updated = ensureInsertionOrder(stackId, allNodes)
  const blocks = getStackBlocks(stackId, updated)
  if (blocks.length === 0) return updated

  let anchor = stackAnchors[stackId]
  if (!anchor) {
    const topByY = [...blocks].sort((a, b) => a.position.y - b.position.y)[0]
    anchor = { x: topByY.position.x, y: topByY.position.y }
    stackAnchors[stackId] = anchor
  }

  const sorted = [...blocks].sort(
    (a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0)
  )

  let currentY = anchor.y
  const idToPos = new Map<string, { x: number; y: number }>()

  sorted.forEach((b: any) => {
    const h = b.data?.height || 24
    idToPos.set(b.id, { x: anchor!.x, y: currentY })
    currentY += h + gap
  })

  updated = updated.map((n: any) =>
    n.type !== 'stackContainer' && n.data?.stackId === stackId
      ? { ...n, position: { x: idToPos.get(n.id)!.x, y: idToPos.get(n.id)!.y } }
      : n
  )

  return updated
}

/**
 * Sync stack container nodes to match their block positions
 */
export function syncStackContainers(
  allNodes: Node[],
  stackAnchors: StackAnchors,
  blockWidth: number,
  headerHeight: number
): Node[] {
  const blockNodes = allNodes.filter((n: any) => n.type !== 'stackContainer')

  const stackGroups: Record<string, Node[]> = {}
  blockNodes.forEach((node: any) => {
    const stackId = node.data?.stackId
    if (stackId) {
      if (!stackGroups[stackId]) stackGroups[stackId] = []
      stackGroups[stackId].push(node)
    }
  })

  const updatedBlocks = blockNodes.map((n: any) => {
    const sid = n.data?.stackId
    const inMultiNodeStack = sid && (stackGroups[sid]?.length || 0) > 1
    if (inMultiNodeStack) {
      return { ...n, className: 'in-stack' }
    }
    const { className, ...rest } = n
    return rest as any
  })

  const newContainers: Node[] = Object.entries(stackGroups).map(([stackId, stackNodes]) => {
    const anchor = stackAnchors[stackId]
    const ys = (stackNodes as any).map((n: any) => n.position.y)
    const heights = (stackNodes as any).map((n: any) => n.data.height || 24)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys.map((y: number, i: number) => y + heights[i]))
    const containerWidth = blockWidth + 8
    const containerHeight = maxY - minY + (headerHeight + 8)
    const containerX = anchor ? anchor.x - 4 : (stackNodes as any)[0].position.x - 4

    return {
      id: `container-${stackId}`,
      type: 'stackContainer',
      position: { x: containerX, y: minY - headerHeight },
      data: { width: containerWidth, height: containerHeight, stackId },
      selectable: false,
      draggable: true,
      dragHandle: '.stack-drag-handle',
      zIndex: -1,
    } as Node
  })

  return [...updatedBlocks, ...newContainers]
}

/**
 * Apply complete stack layout: calculate positions, update flags, sync containers
 */
export function applyStackLayout(
  stackId: string,
  allNodes: Node[],
  stackAnchors: StackAnchors,
  gap: number,
  blockWidth: number,
  headerHeight: number
): Node[] {
  const laidOut = calculateStackLayout(stackId, allNodes, stackAnchors, gap)
  const withFlags = updateBottomNodeFlags(laidOut)
  return syncStackContainers(withFlags, stackAnchors, blockWidth, headerHeight)
}
