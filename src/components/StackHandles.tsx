import React from 'react';
import { Handle, Position } from '@xyflow/react';

interface StackHandlesProps {
  isConnectable: boolean;
}

/**
 * Connection handles for StackContainer nodes.
 * Provides 4 handles (top, right, bottom, left) for creating connections between containers.
 * All handles are type="source" to enable bidirectional connections.
 */
export function StackHandles({ isConnectable }: StackHandlesProps) {
  return (
    <>
      {/* Top handle */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={isConnectable}
        style={{
          top: '-10px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '18px',
          height: '18px',
        }}
      />

      {/* Right handle */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{
          right: '-10px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '18px',
          height: '18px',
        }}
      />

      {/* Bottom handle */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        style={{
          bottom: '-10px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '18px',
          height: '18px',
        }}
      />

      {/* Left handle */}
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{
          left: '-10px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '18px',
          height: '18px',
        }}
      />
    </>
  );
}
