import React, { useMemo } from 'react';
import { EdgeProps, useStore, getSmoothStepPath } from '@xyflow/react';
import { getFloatingEdgePositions } from '../logic/floatingEdgeUtils';

/**
 * FloatingEdge component that dynamically calculates optimal connection points
 * between nodes based on their positions and orientations.
 *
 * Uses smooth step path for clean, orthogonal routing.
 */
export function FloatingEdge({ id, source, target, markerEnd, style }: EdgeProps) {
  // Get source and target nodes from React Flow store
  const sourceNode = useStore((store) => store.nodeLookup.get(source));
  const targetNode = useStore((store) => store.nodeLookup.get(target));
  const allNodes = useStore((store) => Array.from(store.nodeLookup.values()));

  // Calculate dynamic connection points and path
  const { edgePath } = useMemo(() => {
    const {
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    } = getFloatingEdgePositions(sourceNode, targetNode, allNodes);

    // Generate smooth step path with rounded corners
    const [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 4,
    });

    return { edgePath: path };
  }, [sourceNode, targetNode, allNodes]);

  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      markerEnd={markerEnd}
      style={style}
    />
  );
}
