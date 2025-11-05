import { Node, Position } from '@xyflow/react';
import { getAbsolutePosition } from './grouping';

interface ConnectionPoint {
  x: number;
  y: number;
  position: Position;
}

/**
 * Get the center point of a node in absolute coordinates.
 * Handles nested parent relationships using the existing grouping utilities.
 */
export function getNodeCenter(node: Node, allNodes?: Node[]): { x: number; y: number } {
  const absolutePos = allNodes ? getAbsolutePosition(node, allNodes) : { x: node.position.x, y: node.position.y };

  return {
    x: absolutePos.x + (node.measured?.width ?? node.width ?? 0) / 2,
    y: absolutePos.y + (node.measured?.height ?? node.height ?? 0) / 2,
  };
}

/**
 * Calculate the optimal connection point on a node based on the direction to another node.
 * Returns the position on the edge of the node that faces the other node.
 */
export function getConnectionPoint(
  node: Node,
  otherNodeCenter: { x: number; y: number },
  allNodes?: Node[]
): ConnectionPoint {
  const nodeCenter = getNodeCenter(node, allNodes);
  const absolutePos = allNodes ? getAbsolutePosition(node, allNodes) : { x: node.position.x, y: node.position.y };

  const width = node.measured?.width ?? node.width ?? 0;
  const height = node.measured?.height ?? node.height ?? 0;

  // Calculate direction vector from this node to the other node
  const dx = otherNodeCenter.x - nodeCenter.x;
  const dy = otherNodeCenter.y - nodeCenter.y;

  // Determine which edge to use based on the larger difference
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection (left or right)
    if (dx > 0) {
      // Other node is to the right
      return {
        x: absolutePos.x + width,
        y: nodeCenter.y,
        position: Position.Right,
      };
    } else {
      // Other node is to the left
      return {
        x: absolutePos.x,
        y: nodeCenter.y,
        position: Position.Left,
      };
    }
  } else {
    // Vertical connection (top or bottom)
    if (dy > 0) {
      // Other node is below
      return {
        x: nodeCenter.x,
        y: absolutePos.y + height,
        position: Position.Bottom,
      };
    } else {
      // Other node is above
      return {
        x: nodeCenter.x,
        y: absolutePos.y,
        position: Position.Top,
      };
    }
  }
}

/**
 * Calculate the source and target connection points for a floating edge.
 * Dynamically determines the best connection points based on node positions.
 */
export function getFloatingEdgePositions(
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
  allNodes?: Node[]
): {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
} {
  // Fallback if nodes are missing
  if (!sourceNode || !targetNode) {
    return {
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Right,
      targetX: 0,
      targetY: 0,
      targetPosition: Position.Left,
    };
  }

  const sourceCenter = getNodeCenter(sourceNode, allNodes);
  const targetCenter = getNodeCenter(targetNode, allNodes);

  const sourcePoint = getConnectionPoint(sourceNode, targetCenter, allNodes);
  const targetPoint = getConnectionPoint(targetNode, sourceCenter, allNodes);

  return {
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    sourcePosition: sourcePoint.position,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    targetPosition: targetPoint.position,
  };
}
