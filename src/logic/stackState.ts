import type { Node } from '@xyflow/react'

/**
 * Generate unique block IDs
 */
let globalIdCounter = 0
export function nextBlockId(): string {
  const globalCrypto = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID()
  }
  return `block_${globalIdCounter++}`
}

/**
 * Generate unique stack/container IDs
 */
let globalStackCounter = 0
export function nextStackId(): string {
  return `container_${globalStackCounter++}`
}

/**
 * Get the previous block in a stack by insertion order
 */
export function getPreviousBlockInStack(nodeId: string, allNodes: Node[]): Node | null {
  const current = allNodes.find((n) => n.id === nodeId) as any
  if (!current) return null

  const sid = current.data?.stackId
  if (!sid) return null

  const blocks = allNodes
    .filter((n: any) => n.type !== 'stackContainer' && n.data?.stackId === sid)
    .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))

  const idx = blocks.findIndex((b) => b.id === nodeId)
  return idx > 0 ? blocks[idx - 1] : null
}

/**
 * Get the previous block by Y position (fallback when no stack)
 */
export function getPreviousBlockByY(nodeId: string, allNodes: Node[]): Node | null {
  const allBlocks = allNodes
    .filter((n: any) => n.type !== 'stackContainer')
    .sort((a: any, b: any) => a.position.y - b.position.y)

  const idx = allBlocks.findIndex((n) => n.id === nodeId)
  return idx > 0 ? allBlocks[idx - 1] : null
}

/**
 * Get the next block by Y position (fallback when no stack)
 */
export function getNextBlockByY(nodeId: string, allNodes: Node[]): Node | null {
  const allBlocks = allNodes
    .filter((n: any) => n.type !== 'stackContainer')
    .sort((a: any, b: any) => a.position.y - b.position.y)

  const idx = allBlocks.findIndex((n) => n.id === nodeId)
  return idx >= 0 && idx < allBlocks.length - 1 ? allBlocks[idx + 1] : null
}

/**
 * Get the next block in a stack by insertion order
 */
export function getNextBlockInStack(nodeId: string, allNodes: Node[]): Node | null {
  const current = allNodes.find((n) => n.id === nodeId) as any
  if (!current) return null

  const sid = current.data?.stackId
  if (!sid) return null

  const blocks = allNodes
    .filter((n: any) => n.type !== 'stackContainer' && n.data?.stackId === sid)
    .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))

  const idx = blocks.findIndex((b) => b.id === nodeId)
  return idx >= 0 && idx < blocks.length - 1 ? blocks[idx + 1] : null
}

/**
 * Determine if a block is the last in its stack
 */
export function isLastInStack(nodeId: string, allNodes: Node[]): boolean {
  const node = allNodes.find((n) => n.id === nodeId) as any
  if (!node) return true

  const sid = node.data?.stackId
  if (!sid) return true

  const blocks = allNodes
    .filter((n: any) => n.type !== 'stackContainer' && n.data?.stackId === sid)
    .sort((a: any, b: any) => (a.data.insertionOrder ?? 0) - (b.data.insertionOrder ?? 0))

  return blocks[blocks.length - 1]?.id === nodeId
}

/**
 * Find the best block to focus after deletion
 */
export function findFocusTargetAfterDelete(nodeId: string, allNodes: Node[]): string | null {
  const node = allNodes.find((n) => n.id === nodeId) as any
  if (!node) return null

  // Try previous in stack
  const prev = getPreviousBlockInStack(nodeId, allNodes)
  if (prev) return prev.id

  // Fallback to previous by Y
  const prevByY = getPreviousBlockByY(nodeId, allNodes)
  return prevByY ? prevByY.id : null
}

/**
 * Get all stacks with their blocks
 */
export function getStackGroups(allNodes: Node[]): Record<string, Node[]> {
  const stackGroups: Record<string, Node[]> = {}

  allNodes.forEach((node: any) => {
    if (node.type !== 'stackContainer') {
      const stackId = node.data?.stackId
      if (stackId) {
        if (!stackGroups[stackId]) stackGroups[stackId] = []
        stackGroups[stackId].push(node)
      }
    }
  })

  return stackGroups
}

/**
 * Remove a block from nodes array
 */
export function removeBlock(nodeId: string, allNodes: Node[]): Node[] {
  return allNodes.filter((n) => n.id !== nodeId)
}

/**
 * Update block HTML content
 */
export function updateBlockHtml(nodeId: string, html: string, allNodes: Node[]): Node[] {
  return allNodes.map((n: any) =>
    n.id === nodeId ? { ...n, data: { ...n.data, html } } : n
  )
}

/**
 * Update block height
 */
export function updateBlockHeight(nodeId: string, height: number, allNodes: Node[]): Node[] {
  return allNodes.map((n: any) =>
    n.id === nodeId ? { ...n, data: { ...n.data, height } } : n
  )
}

/**
 * Assign a block to a stack
 */
export function assignBlockToStack(nodeId: string, stackId: string | undefined, allNodes: Node[]): Node[] {
  return allNodes.map((n: any) =>
    n.id === nodeId ? { ...n, data: { ...n.data, stackId } } : n
  )
}
