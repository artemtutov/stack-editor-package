import type { Node } from '@xyflow/react'

/**
 * Convert absolute canvas position to relative position within a parent group
 */
export function convertAbsoluteToRelative(
  absolutePosition: { x: number; y: number },
  parentPosition: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: absolutePosition.x - parentPosition.x,
    y: absolutePosition.y - parentPosition.y,
  }
}

/**
 * Convert relative position within a parent to absolute canvas position
 */
export function convertRelativeToAbsolute(
  relativePosition: { x: number; y: number },
  parentPosition: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: relativePosition.x + parentPosition.x,
    y: relativePosition.y + parentPosition.y,
  }
}

/**
 * Get absolute position of a node, accounting for parent hierarchy
 * Recursively walks up the parent chain to compute absolute canvas position
 */
export function getAbsolutePosition(
  node: Node,
  allNodes: Node[]
): { x: number; y: number } {
  if (!node.parentId) {
    return { ...node.position }
  }

  const parent = allNodes.find(n => n.id === node.parentId)
  if (!parent) {
    // Parent not found, return node's position as-is
    return { ...node.position }
  }

  // Recursively get parent's absolute position
  const parentAbsolute = getAbsolutePosition(parent, allNodes)

  // Add this node's relative position to parent's absolute position
  return {
    x: parentAbsolute.x + node.position.x,
    y: parentAbsolute.y + node.position.y,
  }
}

/**
 * Check if a point (in absolute canvas coordinates) is within the bounds of a node
 */
export function isPointWithinNode(
  point: { x: number; y: number },
  node: Node,
  allNodes: Node[]
): boolean {
  // Get absolute position of the node (handles nested parents)
  const absolutePos = getAbsolutePosition(node, allNodes)

  const width = (node as any).measured?.width || node.width || 200
  const height = (node as any).measured?.height || node.height || 100

  const withinX = point.x >= absolutePos.x && point.x <= absolutePos.x + width
  const withinY = point.y >= absolutePos.y && point.y <= absolutePos.y + height

  return withinX && withinY
}

/**
 * Find the group node that contains a given point (in absolute canvas coordinates)
 */
export function findIntersectingGroup(
  point: { x: number; y: number },
  allNodes: Node[],
  groupNodeTypes: string[] = ['group']
): Node | null {
  const groupNodes = allNodes.filter(n => groupNodeTypes.includes(n.type || ''))

  return groupNodes.find(gn => isPointWithinNode(point, gn, allNodes)) || null
}
