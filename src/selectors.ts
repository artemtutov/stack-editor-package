import type { ReactFlowState } from '@xyflow/react'

/**
 * Selector to read a node's width from React Flow's internal store.
 * Tries multiple property paths for compatibility across React Flow versions.
 *
 * Usage:
 *   const width = useStore(useMemo(() => selectNodeWidth(nodeId), [nodeId]))
 */
export const selectNodeWidth =
  (id?: string) =>
  (state: ReactFlowState): number | undefined => {
    if (!id) return undefined

    const node = state.nodeLookup.get(id) as any
    if (!node) return undefined

    // Try multiple paths for React Flow v12 compatibility
    // 1. measured.width (RF v12 measured dimensions)
    if (node.measured?.width) return node.measured.width

    // 2. width directly (explicit width from style)
    if (node.width) return node.width

    // 3. dimensions.width (older API, fallback)
    if (node.dimensions?.width) return node.dimensions.width

    // 4. Try nodeInternals as fallback (deprecated but might still work)
    const legacyNode = (state as any).nodeInternals?.get(id)
    if (legacyNode?.dimensions?.width) return legacyNode.dimensions.width

    return undefined
  }
